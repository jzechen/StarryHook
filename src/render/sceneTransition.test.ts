import { describe, expect, it } from 'vitest'
import { SceneTransition, WARP_FADE_SECONDS } from './sceneTransition'

/**
 * 过场状态机(票 #35,spec §1.4):走到出口 → 淡黑约 300ms → 对侧入口出现,
 * 朝向保持行进方向;过场中输入锁定(组合根据此不喂输入)、不写存档。
 * 纯状态机:淡出结束时报告一次 'switch'(组合根此刻换图落位),淡入结束报告
 * 'arrived'(解锁);Pixi 遮罩由 worldDirector 持有,不在此处。
 */

const WARP = { x: 896, y: 192, width: 32, height: 32, target: 'river', tx: 88, ty: 208 }

function machine(): SceneTransition {
  const t = new SceneTransition()
  t.begin(WARP)
  return t
}

describe('SceneTransition(接缝:纯状态机,渲染/组合根各取所需)', () => {
  it('淡出:alpha 0 → 1 随时间线性推进(约 300ms 走满),期间锁定输入', () => {
    const t = machine()
    expect(t.phase).toBe('fading-out')
    expect(t.locked).toBe(true)
    t.update(WARP_FADE_SECONDS / 4)
    expect(t.alpha).toBeCloseTo(0.25)
    t.update(WARP_FADE_SECONDS / 4)
    expect(t.alpha).toBeCloseTo(0.5)
    t.update(WARP_FADE_SECONDS / 4)
    expect(t.alpha).toBeCloseTo(0.75)
    expect(t.locked).toBe(true)
  })

  it('淡出结束恰好报告一次 switch;随后转入淡入(alpha 回落)', () => {
    const t = machine()
    t.update(WARP_FADE_SECONDS - 0.01)
    expect(t.update(0.005)).toBe('none') // 尚未走满
    expect(t.update(0.005)).toBe('switch') // 恰在走满帧
    expect(t.phase).toBe('fading-in')
    expect(t.alpha).toBeCloseTo(1)
    t.update(WARP_FADE_SECONDS / 2)
    expect(t.alpha).toBeCloseTo(0.5)
    expect(t.locked).toBe(true)
  })

  it('switch 后不再重复报告(组合根换图恰好一次)', () => {
    const t = machine()
    t.update(WARP_FADE_SECONDS + 0.01)
    expect(t.update(0)).toBe('none')
    expect(t.update(0)).toBe('none')
  })

  it('淡入结束报告 arrived,回 idle、alpha 归零、解锁,warp 清空(可再触发下一次)', () => {
    const t = machine()
    t.update(WARP_FADE_SECONDS + 0.01) // → switch
    expect(t.update(WARP_FADE_SECONDS + 0.01)).toBe('arrived')
    expect(t.phase).toBe('idle')
    expect(t.alpha).toBe(0)
    expect(t.locked).toBe(false)
    expect(t.warp).toBeNull()
    // 解锁后可再次触发(往返走通的前提)
    t.begin(WARP)
    expect(t.phase).toBe('fading-out')
  })

  it('大帧(dt 超过时长)不越过状态:一次 update 只推进一个相位边沿', () => {
    const t = machine()
    // 一帧吃掉淡出全程:本轮只报告 switch,淡入仍需下一帧
    expect(t.update(1)).toBe('switch')
    expect(t.phase).toBe('fading-in')
    expect(t.update(1)).toBe('arrived')
    expect(t.phase).toBe('idle')
  })

  it('过场进行中 begin 被忽略(不会中途改目标)', () => {
    const t = machine()
    t.begin({ ...WARP, target: 'lake' })
    expect(t.warp!.target).toBe('river')
  })

  it('idle 时空转:update 恒 none、alpha 恒 0', () => {
    const t = new SceneTransition()
    expect(t.update(0.5)).toBe('none')
    expect(t.alpha).toBe(0)
    expect(t.phase).toBe('idle')
  })
})
