import { describe, expect, it } from 'vitest'
import { TimedBestStore } from './timedBest'
import { memoryStorage } from '../testing/memoryStorage'
import { CollectionStore } from './collection'
import { ProgressionStore } from './progression'
import { WalletStore } from './wallet'
import { FISH } from './fishCatalog'

describe('限时单局最高纪录(接缝:TimedBestStore,票 #23 纪录双轨)', () => {
  it('空存储:初始纪录 0', () => {
    expect(new TimedBestStore(memoryStorage()).best()).toBe(0)
  })

  it('更高才更新,返回是否破纪录(结算「破纪录!」提示的判定源)', () => {
    const store = new TimedBestStore(memoryStorage())
    expect(store.recordIfHigher(100)).toBe(true) // 0 → 100 破纪录
    expect(store.best()).toBe(100)
    expect(store.recordIfHigher(80)).toBe(false) // 更低不更新
    expect(store.best()).toBe(100)
    expect(store.recordIfHigher(100)).toBe(false) // 持平不更新(严格更高)
    expect(store.best()).toBe(100)
    expect(store.recordIfHigher(120)).toBe(true)
    expect(store.best()).toBe(120)
  })

  it('跨会话持久:同一存储重建 store,纪录还在', () => {
    const storage = memoryStorage()
    new TimedBestStore(storage).recordIfHigher(150)
    expect(new TimedBestStore(storage).best()).toBe(150)
  })

  it('损坏降级:非 JSON / 非对象 / 负数 / 非有限数 / 非数字 → 按 0,不抛错', () => {
    for (const raw of ['not-json', '["array"]', '"str"', 'null', '{"best":-5}', '{"best":Infinity}', '{"best":"x"}', '{}']) {
      const storage = memoryStorage()
      storage.set('starryhook:timed-best', raw === 'null' ? 'null' : raw)
      expect(new TimedBestStore(storage).best(), `raw=${raw}`).toBe(0)
    }
  })

  it('损坏后照常可写:降级 0 起更新并落盘干净数据', () => {
    const storage = memoryStorage()
    storage.set('starryhook:timed-best', 'not-json')
    const store = new TimedBestStore(storage)
    expect(store.recordIfHigher(60)).toBe(true)
    expect(new TimedBestStore(storage).best()).toBe(60)
  })

  it('写入失败不抛错:状态留在内存,游戏不受影响(同既有 store 纪律)', () => {
    const store = new TimedBestStore({
      get: () => null,
      set: () => {
        throw new Error('quota')
      },
    })
    expect(store.recordIfHigher(90)).toBe(true)
    expect(store.best()).toBe(90)
  })

  it('独立键双轨隔离:与图鉴/成长/钱包同存一储互不干扰;无限会话纪录(core.best)不受限时纪录影响', () => {
    const storage = memoryStorage()
    const timed = new TimedBestStore(storage)
    new CollectionStore(FISH.map(f => f.id), storage)
    new ProgressionStore(storage)
    new WalletStore(storage)
    expect(timed.recordIfHigher(200)).toBe(true)
    // 各既有键原样,新增键独立存在
    expect(storage.get('starryhook:collection')).toBeNull()
    expect(storage.get('starryhook:progression')).toBeNull()
    expect(storage.get('starryhook:purchased-rods')).toBeNull()
    expect(storage.get('starryhook:wallet')).toBeNull()
    expect(JSON.parse(storage.get('starryhook:timed-best')!)).toEqual({ best: 200 })
    // 再建各 store:互不读脏
    expect(new TimedBestStore(storage).best()).toBe(200)
    expect(new ProgressionStore(storage).level()).toBe(1)
    expect(new WalletStore(storage).coins()).toBe(0)
  })
})
