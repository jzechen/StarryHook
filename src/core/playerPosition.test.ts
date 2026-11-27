import { describe, expect, it } from 'vitest'
import { PLAYER_POSITION_KEY, PlayerPositionStore, type PlayerPositionSnapshot } from './playerPosition'
import type { KvStorage } from './kvSnapshot'

/**
 * 玩家位置快照(票 #35,spec §1.5):kv 新增 (mapId, x, y, 朝向) 快照,
 * 跨会话精确恢复;位置是唯一持久的世界状态——当前水域不落库(由位置推导)。
 * 读写两侧降级语义沿 kvSnapshot 先例:损坏/缺字段 → null(调用方按无快照处理),
 * 写入失败静默吞掉。本 store 只做形态校验;「mapId 是否入库/位置是否可行走」
 * 的语义校验归组合根(注册表与地图数据在 world/)。
 */

function memoryKv(): KvStorage & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    get: key => data.get(key) ?? null,
    set: (key, value) => void data.set(key, value),
  }
}

const SNAPSHOT: PlayerPositionSnapshot = { mapId: 'river', x: 88.5, y: 208, facing: 'right' }

describe('PlayerPositionStore(接缝:KvStorage 注入)', () => {
  it('save → load 往返:字段逐项一致(含浮点精确值)', () => {
    const kv = memoryKv()
    const store = new PlayerPositionStore(kv)
    store.save(SNAPSHOT)
    expect(kv.data.get(PLAYER_POSITION_KEY)).toBeTypeOf('string')
    expect(store.load()).toEqual(SNAPSHOT)
  })

  it('再次保存以最新为准(位置持续落盘)', () => {
    const store = new PlayerPositionStore(memoryKv())
    store.save(SNAPSHOT)
    const next: PlayerPositionSnapshot = { mapId: 'lake', x: 520, y: 264, facing: 'up' }
    store.save(next)
    expect(store.load()).toEqual(next)
  })

  it('无快照(新会话)→ null', () => {
    expect(new PlayerPositionStore(memoryKv()).load()).toBeNull()
  })

  it('损坏 JSON → null(按无快照降级)', () => {
    const kv = memoryKv()
    kv.data.set(PLAYER_POSITION_KEY, '{not json')
    expect(new PlayerPositionStore(kv).load()).toBeNull()
  })

  it('缺字段/类型不对/朝向非法 → null(逐字段校验)', () => {
    const cases: unknown[] = [
      { x: 88, y: 208, facing: 'right' }, // 缺 mapId
      { mapId: '', x: 88, y: 208, facing: 'right' }, // 空 mapId
      { mapId: 'river', y: 208, facing: 'right' }, // 缺 x
      { mapId: 'river', x: 88, y: 208 }, // 缺 facing
      { mapId: 'river', x: '88', y: 208, facing: 'right' }, // x 非数
      { mapId: 'river', x: Number.NaN, y: 208, facing: 'right' }, // x NaN
      { mapId: 'river', x: 88, y: Number.POSITIVE_INFINITY, facing: 'right' }, // y 无穷
      { mapId: 'river', x: 88, y: 208, facing: 'southeast' }, // 朝向非法
      { mapId: 42, x: 88, y: 208, facing: 'right' }, // mapId 非字符串
      [1, 2, 3, 4], // 非对象
    ]
    for (const bad of cases) {
      const kv = memoryKv()
      kv.data.set(PLAYER_POSITION_KEY, JSON.stringify(bad))
      expect(new PlayerPositionStore(kv).load(), JSON.stringify(bad)).toBeNull()
    }
  })

  it('写入失败(隐私模式/配额)静默吞掉,不抛错', () => {
    const store = new PlayerPositionStore({
      get: () => null,
      set: () => {
        throw new Error('quota')
      },
    })
    expect(() => store.save(SNAPSHOT)).not.toThrow()
  })
})
