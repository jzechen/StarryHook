import { describe, expect, it } from 'vitest'
import { Rng, deriveSeed } from './rng'
import { daylightOf, sampleWeather, seasonOf, sessionWeather } from './worldEnv'

describe('季节(接缝:真实月份 → 春夏秋冬)', () => {
  it('3/4/5 月 = 春,6/7/8 月 = 夏,9/10/11 月 = 秋', () => {
    expect(seasonOf(new Date(2026, 2, 15, 12))).toBe('spring')
    expect(seasonOf(new Date(2026, 3, 1, 12))).toBe('spring')
    expect(seasonOf(new Date(2026, 4, 31, 12))).toBe('spring')
    expect(seasonOf(new Date(2026, 5, 1, 12))).toBe('summer')
    expect(seasonOf(new Date(2026, 7, 15, 12))).toBe('summer')
    expect(seasonOf(new Date(2026, 8, 1, 12))).toBe('autumn')
    expect(seasonOf(new Date(2026, 10, 30, 12))).toBe('autumn')
  })

  it('12/1/2 月 = 冬(跨年冬季)', () => {
    expect(seasonOf(new Date(2026, 11, 1, 12))).toBe('winter')
    expect(seasonOf(new Date(2027, 0, 15, 12))).toBe('winter')
    expect(seasonOf(new Date(2026, 1, 28, 12))).toBe('winter')
  })

  it('季节边界:2 月末仍冬,3 月 1 日即春', () => {
    expect(seasonOf(new Date(2026, 1, 28, 23, 59))).toBe('winter')
    expect(seasonOf(new Date(2026, 2, 1, 0, 0))).toBe('spring')
  })
})

describe('昼夜(接缝:真实小时 → 白天/夜晚)', () => {
  it('6:00–17:59 = 白天', () => {
    expect(daylightOf(new Date(2026, 5, 15, 6, 0))).toBe('day')
    expect(daylightOf(new Date(2026, 5, 15, 12, 0))).toBe('day')
    expect(daylightOf(new Date(2026, 5, 15, 17, 59))).toBe('day')
  })

  it('18:00–5:59 = 夜晚', () => {
    expect(daylightOf(new Date(2026, 5, 15, 18, 0))).toBe('night')
    expect(daylightOf(new Date(2026, 5, 15, 23, 30))).toBe('night')
    expect(daylightOf(new Date(2026, 5, 16, 0, 0))).toBe('night')
    expect(daylightOf(new Date(2026, 5, 16, 5, 59))).toBe('night')
  })
})

describe('天气抽样(接缝:独立 Rng 一次定会话天气)', () => {
  it('同一种子抽样结果恒定(?seed 可复现)', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const a = sampleWeather(new Rng(deriveSeed(seed, 0x5eed)))
      const b = sampleWeather(new Rng(deriveSeed(seed, 0x5eed)))
      expect(b).toBe(a)
    }
  })

  it('足够多的种子下晴/雨都会出现(两种天气都可能)', () => {
    const seen = new Set<string>()
    for (let seed = 1; seed <= 50; seed++) {
      seen.add(sampleWeather(new Rng(deriveSeed(seed, 0x5eed))))
    }
    expect(seen.has('sunny')).toBe(true)
    expect(seen.has('rain')).toBe(true)
  })
})

describe('会话天气 sessionWeather(接缝:主种子派生独立 Rng,主序列一个 draw 都不动)', () => {
  it('同主种子 → 同会话天气(?seed 可复现)', () => {
    for (let seed = 1; seed <= 30; seed++) {
      expect(sessionWeather(seed)).toBe(sessionWeather(seed))
    }
  })

  it('足够多主种子下晴/雨都会出现', () => {
    const seen = new Set(Array.from({ length: 60 }, (_, i) => sessionWeather(i + 1)))
    expect(seen.has('sunny')).toBe(true)
    expect(seen.has('rain')).toBe(true)
  })
})

describe('派生种子 deriveSeed(接缝:旁路会话不动主随机序列)', () => {
  it('同种子同盐 → 同派生种子;同种子不同盐 → 不同派生种子', () => {
    expect(deriveSeed(42, 1)).toBe(deriveSeed(42, 1))
    expect(deriveSeed(42, 1)).not.toBe(deriveSeed(42, 2))
    expect(deriveSeed(42, 1)).not.toBe(deriveSeed(43, 1))
  })

  it('派生种子是非负 32 位整数,可直接喂给 Rng', () => {
    for (let seed = 0; seed < 100; seed++) {
      const d = deriveSeed(seed, 0x9e3779b9)
      expect(Number.isInteger(d)).toBe(true)
      expect(d).toBeGreaterThanOrEqual(0)
      expect(d).toBeLessThanOrEqual(0xffffffff)
      expect(() => new Rng(d)).not.toThrow()
    }
  })
})
