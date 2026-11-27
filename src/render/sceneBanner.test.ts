import { describe, expect, it, vi } from 'vitest'
import { SceneBanner, SCENE_BANNER_SECONDS, sceneBannerAlpha } from './sceneBanner'

vi.mock('pixi.js', async (importOriginal) => {
  const pixi = await importOriginal<typeof import('pixi.js')>()
  // 桩只替代「画字」能力(测试环境无 canvas;沿 worldScene.test.ts 先例)
  class StubText extends pixi.Container {
    anchor = { set: () => {} }
  }
  return { ...pixi, Text: StubText }
})

/**
 * 入图场景名横幅(票 #46,spec 术语「场景横幅」):进入场景时短暂显示场景名
 * 演出——确认切换已发生,并赋予场景身份。时间线 = 淡入 → 保持 → 淡出,总时长
 * 约 2.5s(票面口径,与叙事物轻提示 2.5s 同族)。
 */
describe('sceneBannerAlpha(时间线纯函数)', () => {
  it('未开演(负)与开演帧 = 0;时长走满 = 0', () => {
    expect(sceneBannerAlpha(-1)).toBe(0)
    expect(sceneBannerAlpha(0)).toBe(0)
    expect(sceneBannerAlpha(SCENE_BANNER_SECONDS)).toBe(0)
  })

  it('淡入升到 1 → 保持 → 末段线性淡出(总时长约 2.5s,票面口径)', () => {
    expect(SCENE_BANNER_SECONDS).toBe(2.5)
    expect(sceneBannerAlpha(0.25)).toBe(1) // 淡入完成
    expect(sceneBannerAlpha(1.9)).toBe(1) // 保持段
    expect(sceneBannerAlpha(2.25)).toBe(0.5) // 淡出半程
    expect(sceneBannerAlpha(2.49)).toBeCloseTo(0.02, 5)
  })
})

describe('SceneBanner(屏空间底部横幅:begin → update → 自动收场)', () => {
  it('锚点底部居中,且横幅底缘在常驻帮助行上方(实机验收:不与 #hint 同位互叠)', () => {
    // 逻辑屏 480×270(ADR-0002);原锚点 y=260(底缘距屏底 10)与 DOM 帮助行
    // (#hint bottom 34px、字号 24px,2x 缩放下占屏底约 17–32 逻辑 px 带)
    // 同位互叠——上移 40 逻辑 px:锚点 220,底缘距屏底 50,2x 下即屏底上方
    // 100 CSS px,整条帮助行(顶缘约 63 CSS px)露出不受遮。
    const banner = new SceneBanner()
    expect(banner.container.position.x).toBe(240)
    expect(banner.container.position.y).toBe(220)
  })

  it('begin 后进入演出并显示;update 推进到时长尽自动收场(容器隐藏)', () => {
    const banner = new SceneBanner()
    expect(banner.playing).toBe(false)
    banner.begin('村舍池塘')
    expect(banner.playing).toBe(true)
    banner.update(0.016)
    expect(banner.playing).toBe(true)
    let elapsed = 0.016
    for (let i = 0; i < 200 && banner.playing; i++) {
      banner.update(1 / 60)
      elapsed += 1 / 60
    }
    expect(banner.playing).toBe(false)
    expect(elapsed).toBeGreaterThanOrEqual(SCENE_BANNER_SECONDS)
  })

  it('演出中再次 begin 重新计时并换词(换图即换名,不幂等——与大满贯演出语义不同)', () => {
    const banner = new SceneBanner()
    banner.begin('村舍池塘')
    banner.update(2.0)
    banner.begin('河谷')
    banner.update(0.016)
    expect(banner.playing).toBe(true)
    // 重开后仍在演出段(未因旧计时走到收场)
    for (let i = 0; i < 100; i++) banner.update(1 / 60)
    expect(banner.playing).toBe(true)
  })

  it('未开演 update 是空操作(不推进、不抛错)', () => {
    const banner = new SceneBanner()
    expect(() => banner.update(0.016)).not.toThrow()
    expect(banner.playing).toBe(false)
  })

  it('演出名可读(组合根/测试经此断言当前横幅词;未开演 = null)', () => {
    const banner = new SceneBanner()
    expect(banner.label).toBeNull()
    banner.begin('河谷')
    expect(banner.label).toBe('河谷')
  })
})
