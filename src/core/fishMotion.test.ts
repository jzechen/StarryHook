import { describe, expect, it } from 'vitest'
import { stepFish } from './fishMotion'
import { FISH } from './fishCatalog'
import { Rng } from './rng'
import type { MinigameState } from './types'

function mg(): MinigameState {
  return { t: 0, timer: 0, barY: 0.5, barV: 0, fishY: 0.5, fishTarget: 0.5, progress: 0.35 }
}

function byBehavior(behavior: string) {
  return FISH.find(f => f.behavior === behavior)!
}

interface Swim {
  min: number
  max: number
  maxStep: number
  first: number
  tailMin: number
  tailMax: number
}

/** 以 60fps 游 seconds 秒,收集轨迹统计 */
function swim(behavior: string, seconds: number, seed = 11): Swim {
  const m = mg()
  const fish = byBehavior(behavior)
  const rng = new Rng(seed)
  const steps = Math.round(seconds * 60)
  const tailFrom = steps - 120 // 最后 2 秒
  let min = 1
  let max = 0
  let maxStep = 0
  let tailMin = 1
  let tailMax = 0
  let prev = m.fishY
  let first = 0
  for (let i = 0; i < steps; i++) {
    m.t += 1 / 60
    stepFish(m, 1 / 60, fish, rng)
    if (i === 0) first = m.fishY
    min = Math.min(min, m.fishY)
    max = Math.max(max, m.fishY)
    maxStep = Math.max(maxStep, Math.abs(m.fishY - prev))
    if (i >= tailFrom) {
      tailMin = Math.min(tailMin, m.fishY)
      tailMax = Math.max(tailMax, m.fishY)
    }
    prev = m.fishY
  }
  return { min, max, maxStep, first, tailMin, tailMax }
}

describe('鱼类行为 stepFish(接缝:五种行为特征)', () => {
  it('任意行为下鱼图标始终留在轨道内 [0.02, 0.98]', () => {
    for (const b of ['mixed', 'smooth', 'sinker', 'floater', 'dart']) {
      const s = swim(b, 10)
      expect(s.min).toBeGreaterThanOrEqual(0.02)
      expect(s.max).toBeLessThanOrEqual(0.98)
    }
  })

  it('混合:全轨道游走(上下半区都到过)', () => {
    const s = swim('mixed', 10)
    expect(s.min).toBeLessThan(0.3)
    expect(s.max).toBeGreaterThan(0.7)
  })

  it('平滑:双正弦漂移,幅度有界,首帧值与手算一致', () => {
    const s = swim('smooth', 10)
    expect(s.min).toBeGreaterThanOrEqual(0.15)
    expect(s.max).toBeLessThanOrEqual(0.85)
    // 0.5 + 0.24×sin(1/60×2) + 0.1×sin(1/60×4.7 + 1.3) ≈ 0.6062
    expect(s.first).toBeCloseTo(0.6062, 3)
  })

  it('沉底:热身后始终贴底', () => {
    const s = swim('sinker', 5)
    expect(s.tailMax).toBeLessThanOrEqual(0.21)
  })

  it('漂浮:热身后始终贴顶', () => {
    const s = swim('floater', 5)
    expect(s.tailMin).toBeGreaterThanOrEqual(0.76)
  })

  it('急冲:单帧最大位移显著大于混合(突进特征)', () => {
    const dart = swim('dart', 10)
    const mixed = swim('mixed', 10)
    expect(dart.maxStep).toBeGreaterThan(mixed.maxStep * 3)
  })
})
