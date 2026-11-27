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

describe('钓位微差乘子入参(票 #38:第 6 参 spotMul,per-fish 倍率表)', () => {
  it('指定鱼权重 ×2,其余鱼逐位不变(春·日·晴·池塘,现行基线 [3,0,0,4,4])', () => {
    const w = computePoolWeights(SYNTH, SYNTH_POOL, env({ season: 'spring' }), 0, false, { sa: 2 })
    expect(w).toEqual([6, 0, 0, 4, 4])
  })

  it('硬门交互:被季节/昼夜门挡住的鱼,倍率再大也不复活(不越硬门)', () => {
    // 乙季节门(仅夏)、丙昼夜门(仅夜):春天·白天双双归零,倍率不改变判定
    const w = computePoolWeights(SYNTH, SYNTH_POOL, env({ season: 'spring' }), 0, false, { sb: 3, sc: 2 })
    expect(w).toEqual([3, 0, 0, 4, 4])
    // 对照:门内(夏·夜·晴)倍率正常生效 —— 乙现行 6 ×2 = 12
    const open = computePoolWeights(SYNTH, SYNTH_POOL, env({ season: 'summer', daylight: 'night' }), 0, false, { sb: 2 })
    expect(open).toEqual([2, 12, 0.5, 6, 6])
  })

  it('不引新鱼种:不在基底鱼池的鱼,倍率再大也归零', () => {
    const withoutSe = { ...SYNTH_POOL, se: 0 }
    const w = computePoolWeights(SYNTH, withoutSe, env({ season: 'winter', daylight: 'night', weather: 'rain' }), 0, false, { se: 9 })
    expect(w[4]).toBe(0)
  })

  it('与浓饵同形叠乘(乘法交换):冬·夜,丁 = 4×2(冬)×1.5(夜)×1.6(浓)×2(钓位)', () => {
    const w = computePoolWeights(SYNTH, SYNTH_POOL, env({ season: 'winter', daylight: 'night' }), 0, true, { sd: 2 })
    expect(w[3]).toBeCloseTo(38.4, 10)
  })

  it('缺省(不传第 6 参)/ 显式 undefined / 空表 —— 三者与现行权重逐位一致(零回归锁)', () => {
    const envs = [
      env({ season: 'spring' }),
      env({ season: 'summer', daylight: 'night', weather: 'rain' }),
      env({ season: 'winter', daylight: 'night' }),
    ]
    for (const e of envs) {
      for (const power of [0, 1]) {
        for (const rich of [false, true]) {
          const plain = computePoolWeights(SYNTH, SYNTH_POOL, e, power, rich)
          expect(computePoolWeights(SYNTH, SYNTH_POOL, e, power, rich, undefined)).toEqual(plain)
          expect(computePoolWeights(SYNTH, SYNTH_POOL, e, power, rich, {})).toEqual(plain)
          // 显式 ×1 = 恒等乘子:整表逐位一致(无键同 ×1)
          expect(computePoolWeights(SYNTH, SYNTH_POOL, e, power, rich, { sa: 1 })).toEqual(plain)
        }
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

  /** 池塘红线鱼(票 #53):既有 5 种「任意真实时间全可达」,新鱼只加不减 */
  const POND_V1_IDS = ['xiaobaitiao', 'wenzhongji', 'qianzhuinian', 'qiqiuHetun', 'shandiansuo']

  it('池塘红线:既有 5 种在任意环境组合下权重 > 0(票 #53 改向:红线收窄到既有 5 种,新鱼按名册挂条件)', () => {
    const v1 = POND_V1_IDS.map(id => ({ id, index: FISH.findIndex(f => f.id === id) }))
    for (const { season, daylight, weather } of combos().filter(c => c.areaId === 'pond')) {
      for (const power of [0, 1]) {
        const w = computePoolWeights(FISH, baseOf('pond'), { area: 'pond', season, daylight, weather }, power)
        for (const { id, index } of v1) {
          expect(w[index], `${id}/${season}/${daylight}/${weather}/power=${power}`).toBeGreaterThan(0)
        }
      }
    }
  })

  /**
   * 条件矩阵覆盖(票 #53,spec #52 用户故事 2/3):每个(季节 × 昼夜 × 天气)
   * 组合至少一种「专属目标」鱼。专属 = 三条同时成立:
   * 1) 该组合下可达——在其亲和水域的基底鱼池中权重 > 0(硬门由引擎归零体现);
   * 2) 显式亲和命中——至少一个维度对组合值声明了硬门(含该值)或软倍率 > 1
   *    (全无声明的万金油鱼如小白条不算专属);
   * 3) 无减益——组合值不落在该鱼任何 mul < 1 上(被该环境压制的鱼不算专属)。
   */
  it('条件矩阵覆盖:每个(季节×昼夜×天气)组合至少一种专属目标鱼', () => {
    for (const { season, daylight, weather } of combos()) {
      const dedicated = FISH.filter(fish => {
        const h = fish.habitat
        const hit =
          h?.seasons?.includes(season) === true ||
          h?.daylight?.includes(daylight) === true ||
          h?.weather?.includes(weather) === true ||
          (h?.seasonMul?.[season] ?? 1) > 1 ||
          (h?.daylightMul?.[daylight] ?? 1) > 1 ||
          (h?.weatherMul?.[weather] ?? 1) > 1
        const penalized =
          (h?.seasonMul?.[season] ?? 1) < 1 ||
          (h?.daylightMul?.[daylight] ?? 1) < 1 ||
          (h?.weatherMul?.[weather] ?? 1) < 1
        if (!hit || penalized) return false
        const areas = h?.areas ?? WATER_AREAS.map(a => a.id)
        return areas.some(areaId => {
          const w = computePoolWeights(FISH, baseOf(areaId), { area: areaId, season, daylight, weather }, 0)
          return w[FISH.findIndex(f => f.id === fish.id)]! > 0
        })
      })
      expect(dedicated.map(f => f.id), `${season}/${daylight}/${weather} 无专属目标鱼`).not.toHaveLength(0)
    }
  })

  it('维度专属:每个季节/昼夜/天气取值都有显式亲和鱼(雨天/夜晚/冬季各有专属目标,spec #52)', () => {
    const seasonHit = (season: (typeof SEASONS)[number]) =>
      FISH.filter(f => f.habitat?.seasons?.includes(season) || (f.habitat?.seasonMul?.[season] ?? 1) > 1)
    const daylightHit = (daylight: (typeof DAYLIGHTS)[number]) =>
      FISH.filter(f => f.habitat?.daylight?.includes(daylight) || (f.habitat?.daylightMul?.[daylight] ?? 1) > 1)
    const weatherHit = (weather: (typeof WEATHERS)[number]) =>
      FISH.filter(f => f.habitat?.weather?.includes(weather) || (f.habitat?.weatherMul?.[weather] ?? 1) > 1)
    for (const season of SEASONS) expect(seasonHit(season).map(f => f.id), `季节 ${season}`).not.toHaveLength(0)
    for (const daylight of DAYLIGHTS) expect(daylightHit(daylight).map(f => f.id), `昼夜 ${daylight}`).not.toHaveLength(0)
    for (const weather of WEATHERS) expect(weatherHit(weather).map(f => f.id), `天气 ${weather}`).not.toHaveLength(0)
  })

  it('稀有组合挂双硬门:雾影鲈(雨天+夜晚)与霜枪狗鱼(冬季+夜晚)各挂两道硬门(图鉴压轴)', () => {
    const byId = (id: string) => FISH.find(f => f.id === id)!
    expect(byId('wuyingLu').habitat?.weather).toEqual(['rain'])
    expect(byId('wuyingLu').habitat?.daylight).toEqual(['night'])
    expect(byId('shuangqiangGouyu').habitat?.seasons).toEqual(['winter'])
    expect(byId('shuangqiangGouyu').habitat?.daylight).toEqual(['night'])
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

  it('池塘红线:既有 5 种在任意环境组合下权重 > 0(浓饵下仍全可达,护图鉴进度;票 #53 改向同上)', () => {
    const v1 = ['xiaobaitiao', 'wenzhongji', 'qianzhuinian', 'qiqiuHetun', 'shandiansuo'].map(id => ({
      id,
      index: FISH.findIndex(f => f.id === id),
    }))
    for (const { season, daylight, weather } of combos().filter(c => c.areaId === 'pond')) {
      for (const power of [0, 1]) {
        const w = computePoolWeights(FISH, baseOf('pond'), { area: 'pond', season, daylight, weather }, power, true)
        for (const { id, index } of v1) {
          expect(w[index], `${id}/${season}/${daylight}/${weather}/power=${power}`).toBeGreaterThan(0)
        }
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
