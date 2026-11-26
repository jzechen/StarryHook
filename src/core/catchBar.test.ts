import { describe, expect, it } from 'vitest'
import { stepCatchBar } from './catchBar'
import { TUNE } from '../config'
import type { MinigameState } from './types'

function mg(): MinigameState {
  return { t: 0, timer: 0, barY: 0.5, barV: 0, fishY: 0.5, fishTarget: 0.5, progress: 0.35 }
}

describe('绿条物理 stepCatchBar(接缝:手感规格)', () => {
  it('高响应帧((response×dt)≥1)下一帧精确达到目标速度——松手即下沉', () => {
    const m = mg()
    stepCatchBar(m, 0.1, false, false) // 0.1 × 15 = 1.5 ≥ 1
    expect(m.barV).toBeCloseTo(-TUNE.bar.vDown, 10)
    // 独立手算:0.5 + (-1.15) × 0.1 = 0.385
    expect(m.barY).toBeCloseTo(0.385, 10)
  })

  it('普通帧(60fps)速度渐进逼近目标,不瞬时到达(保留惯性)', () => {
    const m = mg()
    stepCatchBar(m, 1 / 60, false, false) // response × dt = 0.25 < 1
    expect(m.barV).toBeLessThan(0)
    expect(m.barV).toBeGreaterThan(-TUNE.bar.vDown)
  })

  it('按住时向上加速,位置上升', () => {
    const m = mg()
    const y0 = m.barY
    stepCatchBar(m, 0.1, true, false)
    expect(m.barV).toBe(TUNE.bar.vUp)
    expect(m.barY).toBeGreaterThan(y0)
  })

  it('点按脉冲:同帧按下比不按获得可感知的额外上冲', () => {
    const a = mg()
    const b = mg()
    stepCatchBar(a, 1 / 60, false, false)
    stepCatchBar(b, 1 / 60, false, true)
    expect(b.barV).toBeGreaterThan(a.barV)
    expect(b.barV - a.barV).toBeGreaterThanOrEqual(TUNE.bar.tapBoost * 0.5)
  })

  it('撞底反弹:位置钉在 0,速度反向上', () => {
    const m = mg()
    m.barY = 0.001
    m.barV = -1
    stepCatchBar(m, 1 / 60, false, false)
    expect(m.barY).toBe(0)
    expect(m.barV).toBeGreaterThan(0)
  })

  it('顶部钳制:不超过轨道上沿,速度反转向下', () => {
    const m = mg()
    m.barY = 1 - TUNE.bar.height + 0.01
    m.barV = 1
    stepCatchBar(m, 0.1, true, false)
    expect(m.barY).toBe(1 - TUNE.bar.height)
    expect(m.barV).toBeLessThan(0)
  })
})

describe('绿条参数注入(接缝:竿档)', () => {
  it('缺省形参 = 显式传现行配置:逐帧结果完全一致(默认 = 现行手感)', () => {
    const implicit = mg()
    const explicit = mg()
    for (let i = 0; i < 120; i++) {
      const holding = i % 7 !== 0
      const pressed = i % 11 === 0
      stepCatchBar(implicit, 1 / 60, holding, pressed)
      stepCatchBar(explicit, 1 / 60, holding, pressed, TUNE.bar)
    }
    expect(explicit.barY).toBe(implicit.barY)
    expect(explicit.barV).toBe(implicit.barV)
  })

  it('注入更高绿条(height 0.5):顶部钳制按注入高度生效,现行高度下不触发', () => {
    const m = mg()
    const taller = { ...TUNE.bar, height: 0.5 }
    m.barY = 0.6 // 独立字面量:0.6 > 1 − 0.5,但 < 1 − 0.28(现行)
    stepCatchBar(m, 0.1, true, false, taller)
    expect(m.barY).toBe(0.5)
  })

  it('注入更快响应(response 30):同帧速度恰好到达目标的一半,比现行(1/4)更跟手', () => {
    const m = mg()
    const snappier = { ...TUNE.bar, response: 30 }
    stepCatchBar(m, 1 / 60, false, false, snappier)
    expect(m.barV).toBeCloseTo(-0.575, 10) // 独立手算:−1.15 × (30/60)
  })
})
