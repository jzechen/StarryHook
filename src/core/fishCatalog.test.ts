import { describe, expect, it } from 'vitest'
import { FISH } from './fishCatalog'

describe('鱼类目录(接缝:共识数据)', () => {
  it('v1 共 5 种鱼,id 唯一', () => {
    expect(FISH).toHaveLength(5)
    expect(new Set(FISH.map(f => f.id)).size).toBe(5)
  })

  it('五种行为各绑定一种', () => {
    expect([...FISH.map(f => f.behavior)].sort()).toEqual([
      'dart',
      'floater',
      'mixed',
      'sinker',
      'smooth',
    ])
  })

  it('难度与分值与共识表一致', () => {
    expect(FISH.map(f => f.name)).toEqual(['小白条', '稳重鲫', '铅坠鲶', '气球河豚', '闪电梭'])
    expect(FISH.map(f => f.difficulty)).toEqual([1, 2, 3, 3, 5])
    expect(FISH.map(f => f.score)).toEqual([10, 15, 25, 25, 50])
  })
})
