import { describe, expect, it } from 'vitest'
import { BackpackStore } from '../core/backpack'
import { FISH } from '../core/fishCatalog'
import { transferBetween, type TransferItem } from './storageWiring'

const ids = FISH.map(f => f.id)

/** 转移面板两栏(票 #40 spec §4.4:左背包/右储物箱,点按转移,双方无容量上限) */
function pair(): { backpack: BackpackStore; box: BackpackStore } {
  return {
    backpack: new BackpackStore(ids, ['luozi']),
    box: new BackpackStore(ids, ['luozi']),
  }
}

describe('储物箱转移接线(接缝:transferBetween,票 #40 spec §4.4)', () => {
  it('渔获整堆转移:背包 → 储物箱,源堆清空、目标堆累加', () => {
    const { backpack, box } = pair()
    backpack.addFish('xiaobaitiao', 'normal', 3)
    backpack.addFish('xiaobaitiao', 'silver')
    const toStorage = transferBetween(backpack, box)

    const outcome = toStorage({ kind: 'fish', fishId: 'xiaobaitiao', quality: 'normal' })

    expect(outcome).toBe('ok')
    expect(backpack.count('xiaobaitiao', 'normal')).toBe(0)
    expect(box.count('xiaobaitiao', 'normal')).toBe(3)
    // 其他堆不动(整堆语义,按 (鱼种 × 品质) 分堆各自动)
    expect(backpack.count('xiaobaitiao', 'silver')).toBe(1)
  })

  it('渔获反向取回:储物箱 → 背包,同一条接线两方向复用', () => {
    const { backpack, box } = pair()
    box.addFish('wenzhongji', 'gold', 2)
    const toBackpack = transferBetween(box, backpack)

    toBackpack({ kind: 'fish', fishId: 'wenzhongji', quality: 'gold' })

    expect(backpack.count('wenzhongji', 'gold')).toBe(2)
    expect(box.count('wenzhongji', 'gold')).toBe(0)
  })

  it('收藏品同样可存可取(渔获与收藏品皆可存,spec §4.4)', () => {
    const { backpack, box } = pair()
    backpack.addCollectible('luozi')
    const toStorage = transferBetween(backpack, box)
    expect(toStorage({ kind: 'collectible', id: 'luozi' })).toBe('ok')
    expect(backpack.countCollectible('luozi')).toBe(0)
    expect(box.countCollectible('luozi')).toBe(1)

    const toBackpack = transferBetween(box, backpack)
    expect(toBackpack({ kind: 'collectible', id: 'luozi' })).toBe('ok')
    expect(backpack.countCollectible('luozi')).toBe(1)
    expect(box.countCollectible('luozi')).toBe(0)
  })

  it('无货堆可转:返回 empty,双方状态原样(空取不产生负数/幽灵堆)', () => {
    const { backpack, box } = pair()
    const toStorage = transferBetween(backpack, box)
    expect(toStorage({ kind: 'fish', fishId: 'xiaobaitiao', quality: 'normal' })).toBe('empty')
    expect(toStorage({ kind: 'collectible', id: 'luozi' })).toBe('empty')
    expect(backpack.entries()).toEqual([])
    expect(box.entries()).toEqual([])
  })

  it('转移数量实时读取:点击时按当下余量整堆走(不依赖面板建行时的快照)', () => {
    const { backpack, box } = pair()
    backpack.addFish('shandiansuo', 'silver', 1)
    const toStorage = transferBetween(backpack, box)
    // 建行后又钓了 2 条:点击时余量 = 3,整堆 3 条走
    backpack.addFish('shandiansuo', 'silver', 2)
    toStorage({ kind: 'fish', fishId: 'shandiansuo', quality: 'silver' })
    expect(box.count('shandiansuo', 'silver')).toBe(3)
  })

  it('目录外条目(防御):empty 且零副作用', () => {
    const { backpack, box } = pair()
    const toStorage = transferBetween(backpack, box)
    const ghost: TransferItem = { kind: 'fish', fishId: '幽灵鱼', quality: 'normal' }
    expect(toStorage(ghost)).toBe('empty')
    expect(box.count('幽灵鱼', 'normal')).toBe(0)
  })
})
