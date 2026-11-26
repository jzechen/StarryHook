import { describe, expect, it } from 'vitest'
import { FISH } from './fishCatalog'
import { computePoolWeights } from './fishPool'
import { Rng } from './rng'
import { WATER_AREAS } from './waterAreas'
import type { EnvState, FishDef } from './types'

/**
 * 引擎测试用合成鱼(独立于真实目录):字面量期望值全部手算,
 * 与 fishCatalog / waterAreas 的数据互不引用(测试不怕数据重构)。
 */
const SYNTH: FishDef[] = [
  {
    id: 'sa', name: '甲', behavior: 'mixed', difficulty: 1, score: 10, color: 0x1, shape: 'slim',
    habitat: { areas: ['pond'], seasonMul: { spring: 1.5 }, weatherMul: { rain: 0.5 } },
  },
  {
    id: 'sb', name: '乙', behavior: 'smooth', difficulty: 2, score: 15, color: 0x2, shape: 'round',
    habitat: { areas: ['pond', 'river'], seasons: ['summer'], daylightMul: { night: 2 } },
  },
  {
    id: 'sc', name: '丙', behavior: 'dart', difficulty: 5, score: 50, color: 0x3, shape: 'bolt',
    habitat: { daylight: ['night'], seasonMul: { winter: 2 } },
  },
  {
    id: 'sd', name: '丁', behavior: 'sinker', difficulty: 3, score: 25, color: 0x4, shape: 'heavy',
    habitat: { seasonMul: { winter: 2 }, daylightMul: { night: 1.5 }, weatherMul: { rain: 0.5 } },
  },
  {
    id: 'se', name: '戊', behavior: 'floater', difficulty: 3, score: 25, color: 0x5, shape: 'puff',
    habitat: { seasonMul: { winter: 0.5 }, daylightMul: { night: 1.5 }, weatherMul: { rain: 2 } },
  },
]

/** 基底鱼池:合成水域的基底权重(引擎输入之一) */
const SYNTH_POOL: Record<string, number> = { sa: 2, sb: 3, sc: 0.5, sd: 4, se: 4 }

function env(partial: Partial<EnvState>): EnvState {
  return { area: 'pond', season: 'spring', daylight: 'day', weather: 'sunny', ...partial }
}

describe('出鱼权重修正引擎(接缝:computePoolWeights)', () => {
  it('固定环境 + 固定蓄力 0 → 权重表等于「基底 × 各维倍率」的独立字面量', () => {
    // 春·日·晴·池塘,蓄力 0:甲 2×1.5(春)=3;乙 季节硬门(仅夏)→0;丙 昼夜硬门(仅夜)→0
    expect(computePoolWeights(SYNTH, SYNTH_POOL, env({ season: 'spring' }), 0)).toEqual([3, 0, 0, 4, 4])
    // 夏·夜·雨,蓄力 0:甲 2×0.5(雨)=1;乙 3×2(夜)=6;丙 夜可出但无修正 0.5;丁 4×1.5×0.5=3;戊 4×1.5×2=12
    expect(computePoolWeights(SYNTH, SYNTH_POOL, env({ season: 'summer', daylight: 'night', weather: 'rain' }), 0))
      .toEqual([1, 6, 0.5, 3, 12])
  })

  it('环境外鱼权重归零:水域硬门(亲和水域不含当前水域)', () => {
    // 甲亲和仅池塘 → 河流中归零;乙河流可达但季节门(仅夏)→0;丙昼夜门(仅夜)→0
    expect(computePoolWeights(SYNTH, SYNTH_POOL, env({ area: 'river', season: 'spring' }), 0)).toEqual([0, 0, 0, 4, 4])
  })

  it('季节/昼夜硬门:亲和集合不含当前值 → 归零(声明的维度才设门)', () => {
    // 丙声明仅夜:白天归零、夜晚可出;乙声明仅夏:春天归零、夏天可出
    const winter = env({ season: 'winter', daylight: 'night' })
    expect(computePoolWeights(SYNTH, SYNTH_POOL, winter, 0)[2]).toBe(1) // 0.5 × 2(冬)
    expect(computePoolWeights(SYNTH, SYNTH_POOL, env({ season: 'summer', daylight: 'night' }), 0)[1]).toBe(6)
  })

  it('不在基底鱼池的鱼权重为 0(亲和匹配也进不来)', () => {
    const withoutSe = { ...SYNTH_POOL, se: 0 }
    const w = computePoolWeights(SYNTH, withoutSe, env({ season: 'winter', daylight: 'night', weather: 'rain' }), 0)
    expect(w[4]).toBe(0)
  })

  it('蓄力叠加方向正确:难度越高,蓄力 1 相对蓄力 0 放大越多(独立字面量)', () => {
    // 冬·夜·晴:甲 2×1.9=3.8;丙(难度5)0.5×2×5.5=5.5;丁(难度3)4×2×1.5×3.7=44.4;戊 4×0.5×1.5×3.7=11.1
    const e = env({ season: 'winter', daylight: 'night' })
    const w1 = computePoolWeights(SYNTH, SYNTH_POOL, e, 1)
    ;[3.8, 0, 5.5, 44.4, 11.1].forEach((v, i) => expect(w1[i]).toBeCloseTo(v, 10))
    // 方向:难度 5 的放大倍率(5.5/1)高于难度 1 的(1.9/1)
    const w0 = computePoolWeights(SYNTH, SYNTH_POOL, e, 0)
    expect(w1[2] / w0[2]).toBeGreaterThan(w1[0] / w0[0])
  })

  it('多修正叠加 = 各维倍率连乘,与施加次序无关(乘法交换)', () => {
    // 丁:冬×2 × 夜×1.5 × 雨×0.5 → 4×2×1.5×0.5 = 6;戊:冬×0.5 × 夜×1.5 × 雨×2 → 4×0.5×1.5×2 = 6
    const e = env({ season: 'winter', daylight: 'night', weather: 'rain' })
    const w = computePoolWeights(SYNTH, SYNTH_POOL, e, 0)
    expect(w[3]).toBe(6)
    expect(w[4]).toBe(6)
    expect(w[3]).toBe(w[4]) // 倍率分配不同、乘积相同:叠加与次序无关
  })

  it('输出与鱼目录对齐:长度一致、零权重项永不被 pick 抽中(rng.pick 消费契约)', () => {
    const e = env({ season: 'spring' }) // 只有 甲/丁/戊 > 0
    const w = computePoolWeights(SYNTH, SYNTH_POOL, e, 0)
    expect(w).toHaveLength(SYNTH.length)
    const rng = new Rng(9)
    for (let i = 0; i < 30; i++) {
      const picked = rng.pick(SYNTH, w)
      expect(picked.id).not.toBe('sb')
      expect(picked.id).not.toBe('sc')
    }
  })
})

describe('浓饵修正入参(票 #21:第 5 参 richBait,难鱼权重提升)', () => {
  it('浓饵生效(第 5 参 true):固定环境字面量 = 现行权重 ×(1 + 0.2 × difficulty)', () => {
    // 春·日·晴·池塘,蓄力 0:甲(d1)3×1.2=3.6;乙/丙被季节/昼夜硬门挡住 → 仍为 0(浓饵不越硬门);
    // 丁(d3)4×1.6=6.4;戊(d3)4×1.6=6.4
    const w = computePoolWeights(SYNTH, SYNTH_POOL, env({ season: 'spring' }), 0, true)
    ;[3.6, 0, 0, 6.4, 6.4].forEach((v, i) => expect(w[i]).toBeCloseTo(v, 10))
  })

  it('浓饵与蓄力乘子叠乘(乘法交换,与次序无关):冬·夜·蓄满独立字面量', () => {
    // 冬·夜·晴,蓄力 1:甲(d1)2×1.9×1.2=4.56;丙(d5)0.5×2×5.5×2=11;
    // 丁(d3)4×2×1.5×3.7×1.6=71.04;戊(d3)4×0.5×1.5×3.7×1.6=17.76
    const e = env({ season: 'winter', daylight: 'night' })
    const w = computePoolWeights(SYNTH, SYNTH_POOL, e, 1, true)
    ;[4.56, 0, 11, 71.04, 17.76].forEach((v, i) => expect(w[i]).toBeCloseTo(v, 10))
  })

  it('方向与量级:难度越高提升越大(d5 ×2.0 > d1 ×1.2),可达鱼只增不减、不归零', () => {
    const e = env({ season: 'winter', daylight: 'night' })
    const plain = computePoolWeights(SYNTH, SYNTH_POOL, e, 0)
    const rich = computePoolWeights(SYNTH, SYNTH_POOL, e, 0, true)
    expect(rich[2] / plain[2]).toBeCloseTo(2, 10) // 丙 d5:×2.0
    expect(rich[0] / plain[0]).toBeCloseTo(1.2, 10) // 甲 d1:×1.2
    expect(rich[2] / plain[2]).toBeGreaterThan(rich[0] / plain[0])
    // 任意可达鱼(现行权重 > 0)在浓饵下仍 > 0,且权重不降
    plain.forEach((w, i) => {
      if (w > 0) {
        expect(rich[i]).toBeGreaterThan(0)
        expect(rich[i]).toBeGreaterThanOrEqual(w)
      }
    })
  })

  it('默认(不传第 5 参)与显式 false 逐位一致 = 现行权重(零回归锁)', () => {
    const envs = [
      env({ season: 'spring' }),
      env({ season: 'summer', daylight: 'night', weather: 'rain' }),
      env({ season: 'winter', daylight: 'night' }),
    ]
    for (const e of envs) {
      for (const power of [0, 1]) {
        const implied = computePoolWeights(SYNTH, SYNTH_POOL, e, power)
        const explicit = computePoolWeights(SYNTH, SYNTH_POOL, e, power, false)
        expect(implied).toEqual(explicit)
      }
    }
  })
})

describe('守护:真实数据环境穷举(4 季 × 2 昼夜 × 2 天气 × 3 水域 × 蓄力 0/1)', () => {
  const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const
  const DAYLIGHTS = ['day', 'night'] as const
  const WEATHERS = ['sunny', 'rain'] as const

  function combos(): { areaId: (typeof WATER_AREAS)[number]['id']; season: (typeof SEASONS)[number]; daylight: (typeof DAYLIGHTS)[number]; weather: (typeof WEATHERS)[number] }[] {
    const list = []
    for (const { id: areaId } of WATER_AREAS)
      for (const season of SEASONS)
        for (const daylight of DAYLIGHTS)
          for (const weather of WEATHERS) list.push({ areaId, season, daylight, weather })
    return list
  }

  it('任一(水域,季节,昼夜,天气)组合下至少 1 条鱼权重 > 0,且全表非负有限', () => {
    for (const { areaId, season, daylight, weather } of combos()) {
      for (const power of [0, 1]) {
        const w = computePoolWeights(FISH, baseOf(areaId), { area: areaId, season, daylight, weather }, power)
        expect(w.some(x => x > 0), `${areaId}/${season}/${daylight}/${weather}/power=${power}`).toBe(true)
        expect(w.every(x => Number.isFinite(x) && x >= 0), `${areaId}/${season}/${daylight}/${weather}/power=${power}`).toBe(true)
      }
    }
  })

  it('池塘红线:全部 5 种鱼在任意环境组合下权重 > 0(任意真实时间全可达,护既有 130 测)', () => {
    for (const { season, daylight, weather } of combos().filter(c => c.areaId === 'pond')) {
      for (const power of [0, 1]) {
        const w = computePoolWeights(FISH, baseOf('pond'), { area: 'pond', season, daylight, weather }, power)
        expect(w.every(x => x > 0), `${season}/${daylight}/${weather}/power=${power}`).toBe(true)
      }
    }
  })

  it('池塘红线:任意环境下蓄满时闪电梭份额高于轻抛(既有统计测试的引擎侧全环境等价)', () => {
    const stIndex = FISH.findIndex(f => f.id === 'shandiansuo')
    expect(stIndex).toBeGreaterThanOrEqual(0)
    for (const { season, daylight, weather } of combos().filter(c => c.areaId === 'pond')) {
      const e = { area: 'pond' as const, season, daylight, weather }
      const full = computePoolWeights(FISH, baseOf('pond'), e, 1)
      const light = computePoolWeights(FISH, baseOf('pond'), e, 0)
      const share = (w: number[]) => w[stIndex] / w.reduce((a, b) => a + b, 0)
      expect(share(full), `${season}/${daylight}/${weather}`).toBeGreaterThan(share(light))
    }
  })

  /** 从注册表按 id 取基底鱼池(测试辅助) */
  function baseOf(areaId: (typeof WATER_AREAS)[number]['id']): Record<string, number> {
    const area = WATER_AREAS.find(a => a.id === areaId)
    expect(area, `注册表缺少水域 ${areaId}`).toBeDefined()
    return area!.baseWeights
  }
})

describe('守护:浓饵生效下的环境穷举(票 #21,96 组合 × richBait=true)', () => {
  const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const
  const DAYLIGHTS = ['day', 'night'] as const
  const WEATHERS = ['sunny', 'rain'] as const

  function combos(): { areaId: (typeof WATER_AREAS)[number]['id']; season: (typeof SEASONS)[number]; daylight: (typeof DAYLIGHTS)[number]; weather: (typeof WEATHERS)[number] }[] {
    const list = []
    for (const { id: areaId } of WATER_AREAS)
      for (const season of SEASONS)
        for (const daylight of DAYLIGHTS)
          for (const weather of WEATHERS) list.push({ areaId, season, daylight, weather })
    return list
  }

  /** 从注册表按 id 取基底鱼池(测试辅助) */
  function baseOf(areaId: (typeof WATER_AREAS)[number]['id']): Record<string, number> {
    const area = WATER_AREAS.find(a => a.id === areaId)
    expect(area, `注册表缺少水域 ${areaId}`).toBeDefined()
    return area!.baseWeights
  }

  it('任一(水域,季节,昼夜,天气)组合下至少 1 条鱼权重 > 0,且全表非负有限(浓饵不破坏可达性)', () => {
    for (const { areaId, season, daylight, weather } of combos()) {
      for (const power of [0, 1]) {
        const w = computePoolWeights(FISH, baseOf(areaId), { area: areaId, season, daylight, weather }, power, true)
        expect(w.some(x => x > 0), `${areaId}/${season}/${daylight}/${weather}/power=${power}`).toBe(true)
        expect(w.every(x => Number.isFinite(x) && x >= 0), `${areaId}/${season}/${daylight}/${weather}/power=${power}`).toBe(true)
      }
    }
  })

  it('池塘红线:全部 5 种鱼在任意环境组合下权重 > 0(浓饵下仍全可达,护图鉴进度)', () => {
    for (const { season, daylight, weather } of combos().filter(c => c.areaId === 'pond')) {
      for (const power of [0, 1]) {
        const w = computePoolWeights(FISH, baseOf('pond'), { area: 'pond', season, daylight, weather }, power, true)
        expect(w.every(x => x > 0), `${season}/${daylight}/${weather}/power=${power}`).toBe(true)
      }
    }
  })

  it('池塘红线:任意环境下闪电梭(d5,唯一最高难)浓饵份额高于现行份额(难鱼方向全环境等价)', () => {
    // 数学保证:浓饵倍率随难度单调,d5 = 2.0 严格大于其余鱼的加权平均倍率 → 份额必增
    const stIndex = FISH.findIndex(f => f.id === 'shandiansuo')
    expect(stIndex).toBeGreaterThanOrEqual(0)
    for (const { season, daylight, weather } of combos().filter(c => c.areaId === 'pond')) {
      const e = { area: 'pond' as const, season, daylight, weather }
      const plain = computePoolWeights(FISH, baseOf('pond'), e, 0)
      const rich = computePoolWeights(FISH, baseOf('pond'), e, 0, true)
      const share = (w: number[]) => w[stIndex] / w.reduce((a, b) => a + b, 0)
      expect(share(rich), `${season}/${daylight}/${weather}`).toBeGreaterThan(share(plain))
    }
  })
})
