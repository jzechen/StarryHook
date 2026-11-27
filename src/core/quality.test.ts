import { describe, expect, it } from 'vitest'
import { Rng } from './rng'
import { QUALITIES, qualityOdds, rollQuality, sellPriceFor, sessionQualityRng } from './quality'

describe('品质概率表(接缝:qualityOdds,TUNE 基础表 + 蓄力加成,票 #39 spec §4.2)', () => {
  it('轻抛(蓄力 0)= 基础概率:金 3% / 银 12% / 普通 85%(独立字面量,余量归普通)', () => {
    const odds = qualityOdds(0)
    expect(odds.gold).toBeCloseTo(0.03, 12)
    expect(odds.silver).toBeCloseTo(0.12, 12)
    expect(odds.normal).toBeCloseTo(0.85, 12)
  })

  it('蓄满(蓄力 1):金 10% / 银 30% / 普通 60%', () => {
    const odds = qualityOdds(1)
    expect(odds.gold).toBeCloseTo(0.1, 12)
    expect(odds.silver).toBeCloseTo(0.3, 12)
    expect(odds.normal).toBeCloseTo(0.6, 12)
  })

  it('蓄力越高银/金星概率越高、普通相应下降(单调),三档恒归一', () => {
    let prevSilver = -1
    let prevGold = -1
    for (let i = 0; i <= 10; i++) {
      const odds = qualityOdds(i / 10)
      expect(odds.silver).toBeGreaterThan(prevSilver)
      expect(odds.gold).toBeGreaterThan(prevGold)
      expect(odds.normal + odds.silver + odds.gold).toBeCloseTo(1, 12)
      prevSilver = odds.silver
      prevGold = odds.gold
    }
  })
})

describe('品质 roll(接缝:rollQuality,捕获时刻对传入 Rng 抽一签)', () => {
  it('同种子同蓄力 → 同品质(可复现)', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const a = rollQuality(new Rng(seed), 1)
      const b = rollQuality(new Rng(seed), 1)
      expect(b).toBe(a)
    }
  })

  it('蓄力把同一抽抬档:种子 8 首抽 0.1563,轻抛 = 普通、蓄满 = 银星', () => {
    expect(rollQuality(new Rng(8), 0)).toBe('normal')
    expect(rollQuality(new Rng(8), 1)).toBe('silver')
  })

  it('蓄力把同一抽抬进金星:种子 19 首抽 0.0585,轻抛 = 银星、蓄满 = 金星', () => {
    expect(rollQuality(new Rng(19), 0)).toBe('silver')
    expect(rollQuality(new Rng(19), 1)).toBe('gold')
  })

  it('基础概率下限之下即金星:种子 7 首抽 0.0117,轻抛也是金星', () => {
    expect(rollQuality(new Rng(7), 0)).toBe('gold')
  })

  it('足够多种子下三档都会出现( QUALITIES 序:普通/银星/金星 )', () => {
    expect(QUALITIES).toEqual(['normal', 'silver', 'gold'])
    const seen = new Set(QUALITIES.map(() => '').slice(0, 0))
    for (let seed = 1; seed <= 60; seed++) seen.add(rollQuality(new Rng(seed), 1))
    expect(seen).toEqual(new Set(QUALITIES))
  })
})

describe('卖价(接缝:sellPriceFor,分值 × 品质倍率,spec §4.2 银 ×1.5 / 金 ×2 量级)', () => {
  it('普通 = 原分值;银 ×1.5;金 ×2(期望值独立字面量)', () => {
    expect(sellPriceFor(10, 'normal')).toBe(10)
    expect(sellPriceFor(10, 'silver')).toBe(15)
    expect(sellPriceFor(10, 'gold')).toBe(20)
    expect(sellPriceFor(50, 'gold')).toBe(100)
  })

  it('×1.5 的半数分值取整到整数金币(四舍五入):25 分银星 = 38、15 分银星 = 23', () => {
    expect(sellPriceFor(25, 'silver')).toBe(38)
    expect(sellPriceFor(15, 'silver')).toBe(23)
  })
})

describe('品质会话种子(接缝:sessionQualityRng,主种子派生独立 Rng,主序列一个 draw 不动)', () => {
  it('同主种子 → 同品质序列(多抽一致,?seed 可复现)', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const a = sessionQualityRng(seed)
      const b = sessionQualityRng(seed)
      for (let i = 0; i < 3; i++) expect(rollQuality(b, 1)).toBe(rollQuality(a, 1))
    }
  })
})
