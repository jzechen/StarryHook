import { readKvSnapshot, writeKvSnapshot, type KvStorage } from './kvSnapshot'
import type { Facing, MapId } from './types'

/**
 * 玩家位置快照(票 #35,spec §1.5):kv 新增玩家位置快照,跨会话精确恢复。
 * 口径 = (mapId, x, y, 朝向)——位置是唯一持久的世界状态:当前水域不落库,
 * 由「位置 → 水域」在运行时推导(推导单一来源见 world/maps.deriveWaterArea)。
 *
 * 仅 idle 落盘的时机门禁归组合根(worldDirector:垂钓/过场中不写);
 * 本 store 只负责形态校验与读写降级:
 * - 读:无原始值 / JSON 损坏 / 字段非法 → null(调用方按无快照处理,回到出生点);
 *   「mapId 是否入库、坐标是否可行走」属语义校验,由组合根结合注册表判定;
 * - 写:序列化写入失败(隐私模式/配额)静默吞掉,状态留在内存。
 */
export interface PlayerPositionSnapshot {
  mapId: MapId
  /** 世界像素(脚部点) */
  x: number
  y: number
  facing: Facing
}

export const PLAYER_POSITION_KEY = 'starryhook:player-position'

const FACINGS: readonly Facing[] = ['down', 'up', 'left', 'right']

function validate(value: unknown): PlayerPositionSnapshot {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('玩家位置快照:顶层必须是对象')
  }
  const v = value as Record<string, unknown>
  const mapId = v['mapId']
  if (typeof mapId !== 'string' || mapId.length === 0) throw new Error('玩家位置快照:mapId 非法')
  const x = v['x']
  const y = v['y']
  if (typeof x !== 'number' || !Number.isFinite(x) || typeof y !== 'number' || !Number.isFinite(y)) {
    throw new Error('玩家位置快照:坐标必须是有限数')
  }
  const facing = v['facing']
  if (typeof facing !== 'string' || !FACINGS.includes(facing as Facing)) {
    throw new Error(`玩家位置快照:朝向非法(${String(facing)})`)
  }
  return { mapId: mapId as MapId, x, y, facing: facing as Facing }
}

/** 玩家位置快照存取(键 starryhook:player-position) */
export class PlayerPositionStore {
  constructor(private storage: KvStorage) {}

  /** 读快照;无/损坏/字段非法 → null */
  load(): PlayerPositionSnapshot | null {
    return readKvSnapshot(this.storage, PLAYER_POSITION_KEY, validate)
  }

  /** 写快照;写入失败静默吞掉 */
  save(snapshot: PlayerPositionSnapshot): void {
    writeKvSnapshot(this.storage, PLAYER_POSITION_KEY, snapshot)
  }
}

