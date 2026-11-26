import { describe, expect, it } from 'vitest'
import { memoryStorage } from '../testing/memoryStorage'
import { MuteStore } from './muteStore'

/**
 * 接缝:静音状态的持久化存取(注入 KvStorage,独立键)。
 * 降级语义与核心两个 store 同型:无快照/损坏/字段非法 → 默认非静音;
 * 写入失败静默(状态留在内存,游戏不受影响)。
 */
describe('MuteStore(接缝:静音开关持久化)', () => {
  it('无快照:默认非静音', () => {
    const store = new MuteStore(memoryStorage())
    expect(store.muted()).toBe(false)
  })

  it('toggle:开 → 关,返回新状态并落库', () => {
    const storage = memoryStorage()
    const store = new MuteStore(storage)
    expect(store.toggle()).toBe(true)
    expect(store.muted()).toBe(true)
    expect(JSON.parse(storage.get('starryhook:muted')!)).toEqual({ muted: true })
    expect(store.toggle()).toBe(false)
    expect(store.muted()).toBe(false)
  })

  it('跨会话恢复:上次静音,构造后仍静音', () => {
    const storage = memoryStorage()
    storage.set('starryhook:muted', JSON.stringify({ muted: true }))
    expect(new MuteStore(storage).muted()).toBe(true)
  })

  it('损坏 JSON:按默认非静音降级', () => {
    const storage = memoryStorage()
    storage.set('starryhook:muted', '{broken json')
    expect(new MuteStore(storage).muted()).toBe(false)
  })

  it('字段非法(非布尔):按默认非静音降级', () => {
    const storage = memoryStorage()
    storage.set('starryhook:muted', JSON.stringify({ muted: 'yes' }))
    expect(new MuteStore(storage).muted()).toBe(false)
    storage.set('starryhook:muted', JSON.stringify({ muted: 1 }))
    expect(new MuteStore(storage).muted()).toBe(false)
  })
})
