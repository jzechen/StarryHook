import { describe, expect, it } from 'vitest'
import { BackpackStore } from './backpack'
import { FISH } from './fishCatalog'

const ids = FISH.map(f => f.id)

describe('背包 store(接缝:BackpackStore,渔获按(鱼种 × 品质)堆叠,票 #39 spec §4.1–4.2)', () => {
  it('捕获入包:同(鱼种,品质)堆叠累加,不同品质分堆', () => {
    const bp = new BackpackStore(ids)
    bp.addFish('xiaobaitiao', 'normal')
    bp.addFish('xiaobaitiao', 'normal')
    bp.addFish('xiaobaitiao', 'silver')
    expect(bp.count('xiaobaitiao', 'normal')).toBe(2)
    expect(bp.count('xiaobaitiao', 'silver')).toBe(1)
    expect(bp.count('xiaobaitiao', 'gold')).toBe(0)
  })

  it('目录外鱼种忽略(与图鉴同款纪律),空包 entries 为空', () => {
    const bp = new BackpackStore(ids)
    bp.addFish('幽灵鱼', 'normal')
    expect(bp.count('幽灵鱼', 'normal')).toBe(0)
    expect(bp.entries()).toEqual([])
  })

  it('entries 堆叠列表按目录序 × 品质序,只含有货堆叠(不出现 0 条目)', () => {
    const bp = new BackpackStore(ids)
    bp.addFish('shandiansuo', 'gold')
    bp.addFish('xiaobaitiao', 'normal')
    bp.addFish('shandiansuo', 'normal')
    expect(bp.entries().map(e => `${e.fishId}:${e.quality}×${e.count}`)).toEqual([
      'xiaobaitiao:normal×1',
      'shandiansuo:normal×1',
      'shandiansuo:gold×1',
    ])
  })

  it('取出(售卖):取 n 条扣 n;余量不足取到空;空堆叠不留 0 条目', () => {
    const bp = new BackpackStore(ids)
    for (let i = 0; i < 3; i++) bp.addFish('wenzhongji', 'silver')
    expect(bp.take('wenzhongji', 'silver', 2)).toBe(2)
    expect(bp.count('wenzhongji', 'silver')).toBe(1)
    expect(bp.take('wenzhongji', 'silver', 5)).toBe(1)
    expect(bp.count('wenzhongji', 'silver')).toBe(0)
    expect(bp.entries()).toEqual([])
    expect(bp.take('wenzhongji', 'silver', 1)).toBe(0)
  })

  it('非法数量(0/负/非整数)取出 0 条,状态原样不动', () => {
    const bp = new BackpackStore(ids)
    bp.addFish('xiaobaitiao', 'normal')
    expect(bp.take('xiaobaitiao', 'normal', 0)).toBe(0)
    expect(bp.take('xiaobaitiao', 'normal', -1)).toBe(0)
    expect(bp.take('xiaobaitiao', 'normal', 1.5)).toBe(0)
    expect(bp.count('xiaobaitiao', 'normal')).toBe(1)
  })
})
