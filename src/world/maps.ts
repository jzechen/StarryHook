import type { MapId, WaterAreaId } from '../core/types'
import { parseWorldMap, type WorldMapData } from './worldMap'
import riverJson from './river.json'
import lakeJson from './lake.json'
import { village } from './village'

/**
 * 世界场景注册表(票 #35,spec §1.1):三张场景图的单一直接来源。
 * 各图 = Tiled 兼容 JSON 随包构建(Vite JSON import,免运行时 fetch)+ 纯函数解析;
 * 组合根经 WORLD_MAPS 取图、经 mapId 读写存档快照。
 */
export const WORLD_MAPS: Record<MapId, WorldMapData> = {
  village,
  river: parseWorldMap(riverJson),
  lake: parseWorldMap(lakeJson),
}

/** 场景 id 是否已入库(存档快照语义校验用:未知 mapId 按无快照处理) */
export function isKnownMapId(mapId: string): mapId is MapId {
  return Object.prototype.hasOwnProperty.call(WORLD_MAPS, mapId)
}

/**
 * 位置 → 当前水域的单一推导函数(票 #35,spec §1.5:当前水域不落库,由位置推导)。
 *
 * v1 口径 = 图级映射(每图一水域:村舍池塘→pond、河谷→river、湖畔→lake),
 * x/y 暂不参与推导——签名为票 #36 钓位级细化预留接缝(「位置 ↔ 最近钓位所属水域」),
 * 届时只改本函数实现,组合根调用点不动。未知 mapId 抛错(挡住坏键流入核心)。
 */
export function deriveWaterArea(mapId: MapId, _x: number, _y: number): WaterAreaId {
  switch (mapId) {
    case 'village':
      return 'pond'
    case 'river':
      return 'river'
    case 'lake':
      return 'lake'
    default:
      throw new Error(`未知场景:${String(mapId)}`)
  }
}
