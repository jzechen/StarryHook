import { describe, expect, it } from 'vitest'
import { FISH } from './fishCatalog'
import type { FishDef } from './types'

/** 池塘红线鱼(票 #53):既有 5 种「任意真实时间全可达」,新鱼只加不减 */
const POND_V1_IDS = ['xiaobaitiao', 'wenzhongji', 'qianzhuinian', 'qiqiuHetun', 'shandiansuo']

/** 名册 13 条新鱼(票 #53 评论区钉定):id → 水域/行为/难度摘要 */
const ROSTER: Record<string, { area: string; behavior: string; difficulty: number }> = {
  niquQiu: { area: 'pond', behavior: 'sinker', difficulty: 2 },
  denglongNian: { area: 'pond', behavior: 'floater', difficulty: 3 },
  cuilinTaiyangyu: { area: 'pond', behavior: 'smooth', difficulty: 1 },
  tongxuJi: { area: 'pond', behavior: 'mixed', difficulty: 3 },
  yuyingZun: { area: 'river', behavior: 'smooth', difficulty: 3 },
  tiejiaLing: { area: 'river', behavior: 'sinker', difficulty: 4 },
  jiliuHongzun: { area: 'river', behavior: 'dart', difficulty: 3 },
  yexingzheNian: { area: 'river', behavior: 'mixed', difficulty: 4 },
  woliuShen: { area: 'river', behavior: 'smooth', difficulty: 2 },
  yueyingMan: { area: 'lake', behavior: 'mixed', difficulty: 4 },
  jinlinLi: { area: 'lake', behavior: 'floater', difficulty: 2 },
  wuyingLu: { area: 'lake', behavior: 'smooth', difficulty: 3 },
  shuangqiangGouyu: { area: 'lake', behavior: 'dart', difficulty: 5 },
}

function byId(): Map<string, FishDef> {
  return new Map(FISH.map(f => [f.id, f]))
}

describe('鱼类目录(接缝:共识数据)', () => {
  it('共 18 种鱼(5 既有 + 13 新),id 唯一(票 #53)', () => {
    expect(FISH).toHaveLength(18)
    expect(new Set(FISH.map(f => f.id)).size).toBe(18)
  })

  it('既有 5 种原样保留(新鱼只做加法:行为/难度/分值/鱼形逐位不动)', () => {
    const v1 = FISH.filter(f => POND_V1_IDS.includes(f.id))
    expect(v1.map(f => f.id)).toEqual(POND_V1_IDS)
    expect(v1.map(f => [f.behavior, f.difficulty, f.score, f.shape])).toEqual([
      ['mixed', 1, 10, 'slim'],
      ['smooth', 2, 15, 'round'],
      ['sinker', 3, 25, 'heavy'],
      ['floater', 3, 25, 'puff'],
      ['dart', 5, 50, 'bolt'],
    ])
  })

  it('行为五型全覆盖(既有测试改向:18 种不再一型一条,改为行为集合相等)', () => {
    expect(new Set(FISH.map(f => f.behavior))).toEqual(
      new Set(['dart', 'floater', 'mixed', 'sinker', 'smooth']),
    )
  })

  it('难度 1~5 梯度完整(名册:难度 4 由铁甲鲮/夜行者鲶/月影鳗补齐)', () => {
    expect(new Set(FISH.map(f => f.difficulty))).toEqual(new Set([1, 2, 3, 4, 5]))
  })

  it('18 种鱼名称/难度/分值与名册一致(目录序)', () => {
    expect(FISH.map(f => f.name)).toEqual([
      '小白条', '稳重鲫', '铅坠鲶', '气球河豚', '闪电梭',
      '泥趣鳅', '灯笼鲇', '翠鳞太阳鱼', '铜须鲫',
      '雨影鳟', '铁甲鲮', '急流虹鳟', '夜行者鲶', '涡流鲹',
      '月影鳗', '金鳞鲤', '雾影鲈', '霜枪狗鱼',
    ])
    expect(FISH.map(f => f.difficulty)).toEqual([1, 2, 3, 3, 5, 2, 3, 1, 3, 3, 4, 3, 4, 2, 4, 2, 3, 5])
    expect(FISH.map(f => f.score)).toEqual([10, 15, 25, 25, 50, 15, 25, 10, 25, 25, 35, 25, 35, 15, 35, 15, 25, 50])
  })

  it('13 条新鱼的水域/行为/难度按名册落表', () => {
    const catalog = byId()
    for (const [id, row] of Object.entries(ROSTER)) {
      const fish = catalog.get(id)
      expect(fish, `名册鱼 ${id} 缺席`).toBeDefined()
      expect(fish!.habitat?.areas, `${id} 水域`).toEqual([row.area])
      expect(fish!.behavior, `${id} 行为`).toBe(row.behavior)
      expect(fish!.difficulty, `${id} 难度`).toBe(row.difficulty)
    }
  })

  it('硬门钉定:灯笼鲇/月影鳗仅夜、铁甲鲮仅冬、雾影鲈雨+夜、霜枪狗鱼冬+夜(名册双硬门压轴)', () => {
    const catalog = byId()
    expect(catalog.get('denglongNian')!.habitat!.daylight).toEqual(['night'])
    expect(catalog.get('yueyingMan')!.habitat!.daylight).toEqual(['night'])
    expect(catalog.get('tiejiaLing')!.habitat!.seasons).toEqual(['winter'])
    expect(catalog.get('wuyingLu')!.habitat!.weather).toEqual(['rain'])
    expect(catalog.get('wuyingLu')!.habitat!.daylight).toEqual(['night'])
    expect(catalog.get('shuangqiangGouyu')!.habitat!.seasons).toEqual(['winter'])
    expect(catalog.get('shuangqiangGouyu')!.habitat!.daylight).toEqual(['night'])
  })

  it('池塘红线(目录侧):既有 5 种无季节/昼夜硬门(任意真实时间全可达)', () => {
    const catalog = byId()
    for (const id of POND_V1_IDS) {
      const habitat = catalog.get(id)!.habitat
      expect(habitat?.seasons, id).toBeUndefined()
      expect(habitat?.daylight, id).toBeUndefined()
    }
  })

  it('同形鱼目录色两两不同(色相变体的数据侧基底,票 #53 验收「同形不同色」)', () => {
    const byShape = new Map<string, FishDef[]>()
    for (const fish of FISH) byShape.set(fish.shape, [...(byShape.get(fish.shape) ?? []), fish])
    for (const [shape, group] of byShape) {
      expect(new Set(group.map(f => f.color)).size, `鱼形 ${shape} 存在同色鱼`).toBe(group.length)
    }
  })
})
