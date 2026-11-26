import { describe, expect, it } from 'vitest'
import { FISH } from './fishCatalog'
import { DEFAULT_AREA, WATER_AREAS, waterAreaOf } from './waterAreas'

describe('三水域注册表(接缝:纯数据)', () => {
  it('三片水域 = 池塘/河流/湖,id 唯一,池塘为默认', () => {
    expect(WATER_AREAS.map(a => a.id)).toEqual(['pond', 'river', 'lake'])
    expect(WATER_AREAS.map(a => a.name)).toEqual(['池塘', '河流', '湖'])
    expect(new Set(WATER_AREAS.map(a => a.id)).size).toBe(3)
    expect(DEFAULT_AREA).toBe('pond')
  })

  it('池塘 = 全部 5 种鱼且权重全为正(既有统计测试红线:任意真实时间全可达的基底)', () => {
    const pond = WATER_AREAS.find(a => a.id === 'pond')!
    expect(Object.keys(pond.baseWeights).sort()).toEqual(FISH.map(f => f.id).sort())
    expect(Object.values(pond.baseWeights).every(w => w > 0)).toBe(true)
  })

  it('每片水域:鱼池非空、权重全为正、鱼 id 均在目录中、代表鱼在鱼池内', () => {
    const catalogIds = new Set(FISH.map(f => f.id))
    for (const area of WATER_AREAS) {
      const entries = Object.entries(area.baseWeights)
      expect(entries.length).toBeGreaterThan(0)
      expect(entries.every(([, w]) => w > 0)).toBe(true)
      for (const [id] of entries) expect(catalogIds.has(id)).toBe(true)
      expect(catalogIds.has(area.signatureFishId)).toBe(true)
      expect(area.baseWeights[area.signatureFishId]).toBeGreaterThan(0)
    }
  })

  it('三片并集覆盖图鉴全集(用户故事 14 守护:没收集的鱼不因环境凭空不可得)', () => {
    const union = new Set(WATER_AREAS.flatMap(a => Object.keys(a.baseWeights)))
    for (const fish of FISH) expect(union.has(fish.id)).toBe(true)
  })

  it('水域硬门与基底鱼池互锁:亲和含该水域 ⟺ 在该水域基底鱼池中(两处数据不漂移)', () => {
    for (const area of WATER_AREAS) {
      for (const fish of FISH) {
        const inHabitat = (fish.habitat?.areas ?? ['pond', 'river', 'lake']).includes(area.id)
        const inPool = area.baseWeights[fish.id] !== undefined
        expect(inPool, `${fish.id} × ${area.id}`).toBe(inHabitat)
      }
    }
  })

  it('硬门差异集中在河流/湖:气球河豚不进河流,铅坠鲶与闪电梭不进湖', () => {
    const river = WATER_AREAS.find(a => a.id === 'river')!
    const lake = WATER_AREAS.find(a => a.id === 'lake')!
    expect(river.baseWeights['qiqiuHetun']).toBeUndefined()
    expect(lake.baseWeights['qianzhuinian']).toBeUndefined()
    expect(lake.baseWeights['shandiansuo']).toBeUndefined()
  })

  it('设计意图:河流以铅坠鲶/闪电梭为主,湖以气球河豚/稳重鲫为主(基底权重压过通用鱼)', () => {
    const river = WATER_AREAS.find(a => a.id === 'river')!
    const lake = WATER_AREAS.find(a => a.id === 'lake')!
    expect(river.baseWeights['qianzhuinian']).toBeGreaterThan(river.baseWeights['xiaobaitiao']!)
    expect(river.baseWeights['shandiansuo']).toBeGreaterThan(river.baseWeights['wenzhongji']!)
    expect(lake.baseWeights['qiqiuHetun']).toBeGreaterThan(lake.baseWeights['xiaobaitiao']!)
    expect(lake.baseWeights['wenzhongji']).toBeGreaterThan(lake.baseWeights['xiaobaitiao']!)
  })

  it('waterAreaOf:按 id 查表;未知 id 抛错(挡住拼错的水域 id)', () => {
    expect(waterAreaOf('river').name).toBe('河流')
    expect(() => waterAreaOf('ocean' as never)).toThrow()
  })
})
