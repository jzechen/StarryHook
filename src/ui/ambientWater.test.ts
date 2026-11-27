import { describe, expect, it } from 'vitest'
import { AMBIENT_WATER_FULL_PX, AMBIENT_WATER_SILENCE_PX, ambientWaterLevel } from './ambientWater'

/**
 * 接缝:近水水声音量(纯函数,票 #44)。期望值为独立字面量/边界语义钉死:
 * 满距以内恒 1、静距以外恒 0、区间内线性衰减且单调不增。
 */
describe('ambientWaterLevel(接缝:水声随距离的音量)', () => {
  it('满距以内(含贴水/负值越界保护)恒为满音量', () => {
    expect(ambientWaterLevel(0)).toBe(1)
    expect(ambientWaterLevel(1)).toBe(1)
    expect(ambientWaterLevel(AMBIENT_WATER_FULL_PX)).toBe(1)
  })

  it('静距以外(含无水域的 Infinity)恒为静音', () => {
    expect(ambientWaterLevel(AMBIENT_WATER_SILENCE_PX)).toBe(0)
    expect(ambientWaterLevel(AMBIENT_WATER_SILENCE_PX + 1)).toBe(0)
    expect(ambientWaterLevel(Infinity)).toBe(0)
  })

  it('淡入淡出区间内线性衰减(中点取半,独立字面量)', () => {
    const mid = (AMBIENT_WATER_FULL_PX + AMBIENT_WATER_SILENCE_PX) / 2
    expect(ambientWaterLevel(mid)).toBeCloseTo(0.5, 10)
    expect(ambientWaterLevel(AMBIENT_WATER_FULL_PX + 20)).toBeCloseTo(0.75, 10)
    expect(ambientWaterLevel(AMBIENT_WATER_SILENCE_PX - 20)).toBeCloseTo(0.25, 10)
  })

  it('随距离单调不增(越远越安静,不回升)', () => {
    let prev = ambientWaterLevel(0)
    for (let d = 1; d <= 120; d++) {
      const level = ambientWaterLevel(d)
      expect(level).toBeLessThanOrEqual(prev)
      expect(level).toBeGreaterThanOrEqual(0)
      expect(level).toBeLessThanOrEqual(1)
      prev = level
    }
  })
})
