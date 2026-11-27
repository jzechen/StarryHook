import { describe, expect, it } from 'vitest'
import { CollectionStore } from '../core/collection'
import { FISH } from '../core/fishCatalog'
import { memoryStorage } from '../testing/memoryStorage'
import { collectionToasts, snapshotOf } from './collectionToastPolicy'

const IDS = FISH.map(f => f.id)

/**
 * 接缝:图鉴提示决策(纯函数,固定输入,期望值为独立字面量)。
 * 输入是捕获前后的收集册快照;输出决定弹哪些轻提示。
 */
describe('collectionToasts(接缝:图鉴提示决策)', () => {
  it('首次收录某鱼种:弹"新收录!",此时图鉴未集齐,不弹大满贯', () => {
    const decision = collectionToasts(
      { hasFish: false, complete: false, acknowledged: false },
      { hasFish: true, complete: false, acknowledged: false },
    )
    expect(decision).toEqual({ newEntry: true, grandSlam: false })
  })

  it('同种类重复捕获:捕获前已收录,不弹"新收录!"', () => {
    const decision = collectionToasts(
      { hasFish: true, complete: false, acknowledged: false },
      { hasFish: true, complete: false, acknowledged: false },
    )
    expect(decision).toEqual({ newEntry: false, grandSlam: false })
  })

  it('最后一条鱼:既首次收录又集齐,两类提示同时弹', () => {
    const decision = collectionToasts(
      { hasFish: false, complete: false, acknowledged: false },
      { hasFish: true, complete: true, acknowledged: false },
    )
    expect(decision).toEqual({ newEntry: true, grandSlam: true })
  })

  it('已集齐后再钓到鱼:捕获前已集齐,不重复弹大满贯', () => {
    const decision = collectionToasts(
      { hasFish: true, complete: true, acknowledged: true },
      { hasFish: true, complete: true, acknowledged: true },
    )
    expect(decision).toEqual({ newEntry: false, grandSlam: false })
  })

  it('刷新/重开后标记生效:捕获前后都集齐且标记已确认,不再弹', () => {
    const decision = collectionToasts(
      { hasFish: true, complete: true, acknowledged: true },
      { hasFish: true, complete: true, acknowledged: true },
    )
    expect(decision).toEqual({ newEntry: false, grandSlam: false })
  })

  it('标记已确认后再次跨过集齐边沿(如存储恢复出的边沿):仍不弹', () => {
    const decision = collectionToasts(
      { hasFish: true, complete: false, acknowledged: true },
      { hasFish: true, complete: true, acknowledged: true },
    )
    expect(decision).toEqual({ newEntry: false, grandSlam: false })
  })
})

describe('snapshotOf(接缝:收集册快照读取,组合根链路冒烟)', () => {
  it('先读 → 登记 → 再读:最后一条鱼同时触发新收录与大满贯(最后一条 = 目录末条,随目录扩容跟随)', () => {
    const s = new CollectionStore(IDS, memoryStorage())
    const last = IDS[IDS.length - 1]!
    for (const id of IDS.slice(0, -1)) s.recordCatch(id)
    const before = snapshotOf(s, last)
    s.recordCatch(last)
    const after = snapshotOf(s, last)
    expect(collectionToasts(before, after)).toEqual({ newEntry: true, grandSlam: true })
  })

  it('先读 → 登记 → 再读:重复捕获两次快照一致,不弹任何提示', () => {
    const s = new CollectionStore(IDS, memoryStorage())
    s.recordCatch('xiaobaitiao')
    const before = snapshotOf(s, 'xiaobaitiao')
    s.recordCatch('xiaobaitiao')
    const after = snapshotOf(s, 'xiaobaitiao')
    expect(collectionToasts(before, after)).toEqual({ newEntry: false, grandSlam: false })
  })
})
