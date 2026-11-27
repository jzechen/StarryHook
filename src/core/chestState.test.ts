import { describe, expect, it } from 'vitest'
import { CHESTS } from './chests'
import type { KvStorage } from './kvSnapshot'
import { CHESTS_KEY, ChestOpenedStore } from './chestState'

/**
 * 宝箱已开态(票 #41,spec §4.5/§4.6):一次性开启 + kv 持久化(自开键,
 * 沿 readKvSnapshot 校验降级模式)。快照 = 已开 id 集合;restore 时目录外
 * id 逐条丢弃(宝箱表裁撤后旧档不残留幽灵键)。
 */

function memoryKv(): KvStorage & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    get: key => data.get(key) ?? null,
    set: (key, value) => void data.set(key, value),
  }
}

describe('ChestOpenedStore(接缝:KvStorage 注入,票 #41)', () => {
  it('首次 open = true 并落盘;isOpen 随之成立', () => {
    const kv = memoryKv()
    const store = new ChestOpenedStore(kv)
    expect(store.isOpen(CHESTS[0]!.id)).toBe(false)
    expect(store.open(CHESTS[0]!.id)).toBe(true)
    expect(store.isOpen(CHESTS[0]!.id)).toBe(true)
    expect(kv.data.get(CHESTS_KEY)).toContain(CHESTS[0]!.id)
  })

  it('一次性:再开同箱 = false(不重复结算的判定源)', () => {
    const store = new ChestOpenedStore(memoryKv())
    store.open(CHESTS[0]!.id)
    expect(store.open(CHESTS[0]!.id)).toBe(false)
  })

  it('跨会话保持已开态:新实例自同一 kv 恢复(跨会话验收)', () => {
    const kv = memoryKv()
    new ChestOpenedStore(kv).open(CHESTS[1]!.id)
    const next = new ChestOpenedStore(kv)
    expect(next.isOpen(CHESTS[1]!.id)).toBe(true)
    expect(next.open(CHESTS[1]!.id)).toBe(false)
  })

  it('未开箱不受他箱影响;目录外 id 开箱忽略(不落库)', () => {
    const kv = memoryKv()
    const store = new ChestOpenedStore(kv)
    store.open(CHESTS[2]!.id)
    expect(store.isOpen(CHESTS[0]!.id)).toBe(false)
    store.open('幽灵箱')
    expect(kv.data.get(CHESTS_KEY) ?? '').not.toContain('幽灵箱')
  })

  it('损坏 JSON → 按全未开降级(游戏不受影响)', () => {
    const kv = memoryKv()
    kv.data.set(CHESTS_KEY, '{broken')
    const store = new ChestOpenedStore(kv)
    expect(store.isOpen(CHESTS[0]!.id)).toBe(false)
    expect(store.open(CHESTS[0]!.id)).toBe(true)
  })

  it('快照里的目录外 id 逐条丢弃(宝箱表裁撤后旧档不残留幽灵键)', () => {
    const kv = memoryKv()
    kv.data.set(CHESTS_KEY, JSON.stringify({ opened: [CHESTS[0]!.id, 'retired-chest'] }))
    const store = new ChestOpenedStore(kv)
    expect(store.isOpen(CHESTS[0]!.id)).toBe(true)
    expect(store.isOpen('retired-chest')).toBe(false)
  })

  it('快照形态不是对象 / opened 不是数组 → 按无快照降级', () => {
    const kv = memoryKv()
    kv.data.set(CHESTS_KEY, JSON.stringify(['village-hedge']))
    expect(new ChestOpenedStore(kv).isOpen('village-hedge')).toBe(false)
    kv.data.set(CHESTS_KEY, JSON.stringify({ opened: 'village-hedge' }))
    expect(new ChestOpenedStore(kv).isOpen('village-hedge')).toBe(false)
  })

  it('写入失败静默吞(隐私模式):状态留在内存,游戏不受影响', () => {
    const store = new ChestOpenedStore({
      get: () => null,
      set: () => {
        throw new Error('quota')
      },
    })
    expect(store.open(CHESTS[0]!.id)).toBe(true)
    expect(store.isOpen(CHESTS[0]!.id)).toBe(true)
  })
})
