import { describe, expect, it } from 'vitest'
import { CollectionStore, type KvStorage } from './collection'
import { FISH } from './fishCatalog'

const IDS = FISH.map(f => f.id)

/** 内存替身:localStorage 属系统边界,按仓库测试规范用替身 */
function memoryStorage(): KvStorage {
  const map = new Map<string, string>()
  return {
    get: key => map.get(key) ?? null,
    set: (key, value) => {
      map.set(key, value)
    },
  }
}

describe('CollectionStore(接缝:收集册)', () => {
  it('初始为空册:逐条未收集,进度 0/目录长度,未集齐', () => {
    const s = new CollectionStore(IDS, memoryStorage())
    for (const id of IDS) expect(s.has(id)).toBe(false)
    expect(s.progress()).toEqual({ collected: 0, total: 5 })
    expect(s.collectedIds()).toEqual([])
    expect(s.isComplete()).toBe(false)
  })

  it('登记捕获:该鱼标记为已收集,进度前进', () => {
    const s = new CollectionStore(IDS, memoryStorage())
    s.recordCatch('xiaobaitiao')
    expect(s.has('xiaobaitiao')).toBe(true)
    expect(s.progress()).toEqual({ collected: 1, total: 5 })
  })

  it('登记幂等:同种鱼重复捕获,进度与列表不变', () => {
    const s = new CollectionStore(IDS, memoryStorage())
    s.recordCatch('xiaobaitiao')
    s.recordCatch('xiaobaitiao')
    s.recordCatch('xiaobaitiao')
    expect(s.progress()).toEqual({ collected: 1, total: 5 })
    expect(s.collectedIds()).toEqual(['xiaobaitiao'])
  })

  it('已收集列表始终按目录顺序返回(与登记顺序无关)', () => {
    const s = new CollectionStore(IDS, memoryStorage())
    s.recordCatch('shandiansuo')
    s.recordCatch('xiaobaitiao')
    expect(s.collectedIds()).toEqual(['xiaobaitiao', 'shandiansuo'])
  })

  it('目录外的未知 id 被忽略:不进册、不影响进度、不抛错', () => {
    const s = new CollectionStore(IDS, memoryStorage())
    expect(() => s.recordCatch('幽灵鱼')).not.toThrow()
    expect(s.progress()).toEqual({ collected: 0, total: 5 })
    expect(s.collectedIds()).toEqual([])
  })

  it('集齐:全部登记后 isComplete 为真', () => {
    const s = new CollectionStore(IDS, memoryStorage())
    for (const id of IDS) s.recordCatch(id)
    expect(s.isComplete()).toBe(true)
  })
})

describe('CollectionStore 持久化与降级', () => {
  it('持久化往返:登记与集齐标记在新实例上完整恢复', () => {
    const storage = memoryStorage()
    const a = new CollectionStore(IDS, storage)
    a.recordCatch('qianzhuinian')
    a.recordCatch('qiqiuHetun')
    a.acknowledgeCompletion()
    const b = new CollectionStore(IDS, storage)
    expect(b.has('qianzhuinian')).toBe(true)
    expect(b.has('qiqiuHetun')).toBe(true)
    expect(b.has('xiaobaitiao')).toBe(false)
    expect(b.progress()).toEqual({ collected: 2, total: 5 })
    expect(b.completionAcknowledged()).toBe(true)
  })

  it('空存储:按空收集册处理,不抛错', () => {
    const s = new CollectionStore(IDS, memoryStorage())
    expect(s.progress()).toEqual({ collected: 0, total: 5 })
    expect(s.completionAcknowledged()).toBe(false)
  })

  it('存储数据损坏(非法 JSON):按空收集册处理,不抛错', () => {
    const storage = memoryStorage()
    storage.set('starryhook:collection', '{{{not json')
    const s = new CollectionStore(IDS, storage)
    expect(s.progress()).toEqual({ collected: 0, total: 5 })
    expect(() => s.recordCatch('xiaobaitiao')).not.toThrow()
    expect(s.has('xiaobaitiao')).toBe(true) // 损坏被覆盖,重新可用
  })

  it('损坏数据中的目录外 id 被过滤,目录内的照常恢复', () => {
    const storage = memoryStorage()
    storage.set(
      'starryhook:collection',
      JSON.stringify({ collected: ['幽灵鱼', 'wenzhongji'], completionAcknowledged: false }),
    )
    const s = new CollectionStore(IDS, storage)
    expect(s.has('wenzhongji')).toBe(true)
    expect(s.progress()).toEqual({ collected: 1, total: 5 })
  })

  it('集齐标记幂等:重复 acknowledge 无副作用,且被持久化', () => {
    const storage = memoryStorage()
    const s = new CollectionStore(IDS, storage)
    s.acknowledgeCompletion()
    s.acknowledgeCompletion()
    const b = new CollectionStore(IDS, storage)
    expect(b.completionAcknowledged()).toBe(true)
  })
})
