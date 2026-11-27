import { Container, Sprite } from 'pixi.js'
import { describe, expect, it, vi } from 'vitest'
import {
  CONFETTI_COUNT,
  GRAND_SLAM_DURATION,
  GrandSlamOverlay,
  confettiDrop,
  confettiStep,
  grandSlamBanner,
} from './grandSlam'

// 测试环境为 node(无 DOM/canvas):Text 桩替换(与 worldScene.test.ts 同款)
vi.mock('pixi.js', async (importOriginal) => {
  const pixi = await importOriginal<typeof import('pixi.js')>()
  class StubText extends pixi.Container {
    anchor = { set: () => {} }
  }
  return { ...pixi, Text: StubText }
})

/** 深度统计可见 Sprite 粒子数(公开场景树,横幅容器不计入) */
function visibleSprites(root: Container): number {
  let n = 0
  const walk = (node: Container): void => {
    if (node instanceof Sprite && node.visible) n++
    for (const child of node.children) walk(child)
  }
  walk(root)
  return n
}

/**
 * 大满贯全屏演出(接缝:grandSlamBanner/confetti* 纯函数 + GrandSlamOverlay
 * 公开行为,票 #43,spec §5.2)。
 *
 * 替代既有 toast:画布内横幅 + 星芒/彩带粒子,约 2s;幂等(演出中重复
 * 触发不重启;幂等标记沿用 collection 既有,本层只管「一次演出不重入」)。
 * 「大满贯」是演出/文案名,不是状态名(GLOSSARY 集齐)。
 */

describe('演出时长与横幅时间线(接缝:grandSlamBanner 纯函数)', () => {
  it('总时长约 2s(spec 口径)', () => {
    expect(GRAND_SLAM_DURATION).toBeGreaterThanOrEqual(1.8)
    expect(GRAND_SLAM_DURATION).toBeLessThanOrEqual(2.2)
  })

  it('横幅:淡入 → 保持 → 淡出(两端 0,中段全显)', () => {
    const first = grandSlamBanner(0)
    const mid = grandSlamBanner(GRAND_SLAM_DURATION / 2)
    const end = grandSlamBanner(GRAND_SLAM_DURATION)
    expect(first.alpha).toBeLessThan(0.2)
    expect(mid.alpha).toBe(1)
    expect(end.alpha).toBe(0)
  })

  it('横幅缩放弹跳:开局放大落定(读作「砸出来」,不是常驻横幅)', () => {
    const first = grandSlamBanner(0)
    const settled = grandSlamBanner(GRAND_SLAM_DURATION / 2)
    expect(first.scale).toBeGreaterThan(settled.scale)
    expect(settled.scale).toBe(1)
  })

  it('同刻采样逐位一致(确定性)', () => {
    expect(grandSlamBanner(0.37)).toEqual(grandSlamBanner(0.37))
  })
})

describe('彩带粒子(接缝:confettiDrop/confettiStep 纯函数)', () => {
  it('数量有界(克制口径),出生在画面顶缘之上', () => {
    expect(CONFETTI_COUNT).toBeLessThanOrEqual(40)
    for (let i = 0; i < CONFETTI_COUNT; i++) {
      const p = confettiDrop(i)
      expect(p.y).toBeLessThanOrEqual(0)
      expect(p.vy).toBeGreaterThan(0) // 下落
      expect(p.life).toBeLessThanOrEqual(GRAND_SLAM_DURATION)
    }
  })

  it('推进:下落、横摆往复、寿命尽即死', () => {
    const p0 = confettiDrop(0)
    const p1 = confettiStep(p0, 0.2)
    expect(p1.y).toBeGreaterThan(p0.y)
    expect(p1.age).toBeCloseTo(0.2, 6)
    const dead = confettiStep(p0, p0.life + 1) // 越过寿命 + 错峰上界,必死
    expect(dead.alive).toBe(false)
  })

  it('逐粒参数有散布(不是一列整齐的雨)', () => {
    const vys = Array.from({ length: CONFETTI_COUNT }, (_, i) => confettiDrop(i).vy)
    expect(new Set(vys).size).toBeGreaterThan(1)
  })
})

describe('演出幂等(接缝:GrandSlamOverlay.start/update)', () => {
  it('演出中重复 start 不重启:总时长从首次触发起算', () => {
    const slam = new GrandSlamOverlay()
    expect(slam.playing).toBe(false)

    slam.start()
    expect(slam.playing).toBe(true)
    slam.update(GRAND_SLAM_DURATION / 2)
    slam.start() // 幂等:此刻再触发不重新计时
    slam.update(GRAND_SLAM_DURATION / 2)
    // 首触发起 2s 已到:演出结束(若重启了,此刻应仍在演出)
    expect(slam.playing).toBe(false)
  })

  it('演出结束回到非演出态;粒子全部回收(可见 Sprite 归零)', () => {
    const slam = new GrandSlamOverlay()
    slam.start()
    slam.update(GRAND_SLAM_DURATION + 0.05)
    expect(slam.playing).toBe(false)
    expect(visibleSprites(slam.container)).toBe(0)
  })

  it('结束后可再次演出(新会话触发语义不受本层限制)', () => {
    const slam = new GrandSlamOverlay()
    slam.start()
    slam.update(GRAND_SLAM_DURATION)
    slam.start()
    expect(slam.playing).toBe(true)
  })

  it('未触发时长期 update 恒无可见粒子(零开销路径)', () => {
    const slam = new GrandSlamOverlay()
    for (let i = 0; i < 300; i++) slam.update(1 / 60)
    expect(slam.playing).toBe(false)
    expect(visibleSprites(slam.container)).toBe(0)
  })
})
