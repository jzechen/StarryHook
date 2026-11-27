import { FISH } from '../core/fishCatalog'
import type { WaterAreaId } from '../core/types'
import { WATER_AREAS } from '../core/waterAreas'
import type { WorldMapObject } from './worldMap'

/**
 * 交互点系统(票 #36,spec §2.1):地图物件层 kind 声明的可交互物件。
 *
 * 解析为纯函数:物件层条目(kind/name/坐标/属性)→ 交互点定义;
 * 触发判定为纯函数:玩家脚部点 → 范围内最近交互点(重叠取最近,平局取先声明)。
 * 票 #37 追加叙事物 sign(路牌)/note(井石台,spec §2.5):彩蛋文案走物件
 * text 属性,交互 = 动作键弹一句静态文案,零奖励、不持久化已读;
 * 票 #38 追加钓位微差(spec §3):spot 物件可选 spotMul 属性(per-fish 倍率表),
 * 抛竿时随当前钓位进入权重引擎;
 * 票 #40 追加 storage(村舍储物箱,spec §4.4):交互 = 动作键开两栏转移面板;
 * chest 由后续票按同一物件层声明扩展(kind 表 + 动作短词表即插即用)。
 */

/** 本票落地的交互 kind(spec §2.1 全集的子集;后续票追加) */
export type InteractionKind = 'spot' | 'stall' | 'sign' | 'note' | 'storage'

/** 默认触发半径(tile;spec §2.1「统一 1.5 tile」) */
export const DEFAULT_RADIUS_TILES = 1.5

/** 交互点定义(解析产物,纯数据) */
export interface InteractionSpotDef {
  readonly kind: InteractionKind
  /** 物件层 name(浮签主语/调试;钓位名亦是 #38 微差的数据键) */
  readonly name: string
  /** 世界像素坐标(物件点) */
  readonly x: number
  readonly y: number
  /** 触发半径(世界像素;默认 1.5 tile,物件 radius 属性可覆盖,tile 单位) */
  readonly radiusPx: number
  /** 钓位所属水域(spot 专用;走近自动 setWater 的来源;stall 无) */
  readonly area?: WaterAreaId
  /**
   * 钓位微差倍率表(票 #38,spot 专用;物件 spotMul 属性):
   * 键 = 鱼目录 id,值 = 倍率(≥ 1 只增不减);缺省无修饰 = 现行权重。
   */
  readonly spotMul?: Readonly<Record<string, number>>
  /** 叙事物彩蛋文案(sign/note 专用;物件 text 属性,交互时整句弹出,不入玩法状态) */
  readonly text?: string
}

/** 叙事物 kind(spec §2.5:路牌 sign / 井与石台 note;零奖励,不持久化已读) */
const NARRATIVE_KINDS: ReadonlySet<InteractionKind> = new Set(['sign', 'note'])

/** 叙事物判定(动作键意图策略消费;未注册 kind 非叙事物) */
export function isNarrativeKind(kind: string): boolean {
  return (NARRATIVE_KINDS as ReadonlySet<string>).has(kind)
}

/** 动作短词表(浮签文案;chest = 开启等后续票按 kind 扩表) */
const ACTION_LABELS: Readonly<Record<InteractionKind, string>> = {
  spot: '抛竿',
  stall: '商店',
  sign: '查看',
  note: '查看',
  storage: '储物箱',
}

/** 交互点动作短词(未知 kind = 空串:浮签不渲染无主文案) */
export function interactionLabel(kind: string): string {
  const label = (ACTION_LABELS as Readonly<Record<string, string>>)[kind]
  return label ?? ''
}

/**
 * 浮签文案(票 #38,spec §3 呈现):钓位名进浮签(「深湾 · 抛竿」);
 * 其余 kind 沿动作短词不加名(摊位「商店」、叙事物「查看」)。
 * kind 取 string(沿 interactionLabel 的扩表先例:未注册 kind = 空串)。
 */
export function interactionPromptText(spot: { readonly kind: string; readonly name: string }): string {
  const label = interactionLabel(spot.kind)
  return spot.kind === 'spot' ? `${spot.name} · ${label}` : label
}

/** 水域 id 校验(注册表单源;拼错的 area 在解析期抛错,不流入 setWater) */
function isWaterAreaId(value: unknown): value is WaterAreaId {
  return typeof value === 'string' && WATER_AREAS.some(a => a.id === value)
}

/**
 * 钓位微差倍率表解析(票 #38,spec §3):物件 spotMul 属性 → {鱼id: 倍率}。
 * Tiled 自定义属性无映射类型,JSON 串承载;手写地图也接受直接物件形态。
 * 纪律进解析器:键必须是鱼目录 id(不引新鱼种,拼写错挡在解析期),
 * 值必须是 ≥ 1 的有限数(只增不减)。
 */
function parseSpotMul(o: WorldMapObject, raw: unknown): Record<string, number> {
  let table: unknown = raw
  if (typeof raw === 'string') {
    try {
      table = JSON.parse(raw)
    } catch {
      throw new Error(`交互点「${o.name}」的 spotMul 不是合法 JSON:${String(raw)}`)
    }
  }
  if (typeof table !== 'object' || table === null || Array.isArray(table)) {
    throw new Error(`交互点「${o.name}」的 spotMul 必须是 {鱼id: 倍率} 物件(现 ${String(raw)})`)
  }
  const mul: Record<string, number> = {}
  for (const [fishId, value] of Object.entries(table as Record<string, unknown>)) {
    if (!FISH.some(f => f.id === fishId)) {
      throw new Error(`交互点「${o.name}」的 spotMul 键不是鱼目录 id:「${fishId}」(不引新鱼种)`)
    }
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) {
      throw new Error(`交互点「${o.name}」的 spotMul[${fishId}] 必须是 ≥ 1 的数(只增不减,现 ${String(value)})`)
    }
    mul[fishId] = value
  }
  return mul
}

/** 物件层条目 → 交互点定义;kind 非交互返回 null(调用方过滤) */
function toInteractionSpot(o: WorldMapObject, tileWidth: number): InteractionSpotDef | null {
  if (o.type !== 'spot' && o.type !== 'stall' && o.type !== 'sign' && o.type !== 'note' && o.type !== 'storage') {
    return null
  }
  const kind = o.type as InteractionKind
  const radiusTiles = o.properties['radius']
  let radiusPx = DEFAULT_RADIUS_TILES * tileWidth
  if (radiusTiles !== undefined) {
    if (typeof radiusTiles !== 'number' || !Number.isFinite(radiusTiles) || radiusTiles <= 0) {
      throw new Error(`交互点「${o.name}」的 radius 必须是正数(tile 单位,现 ${String(radiusTiles)})`)
    }
    radiusPx = radiusTiles * tileWidth
  }
  const area = o.properties['area']
  if (area !== undefined && !isWaterAreaId(area)) {
    throw new Error(`交互点「${o.name}」的 area 不是注册表水域:${String(area)}`)
  }
  const text = o.properties['text']
  if (isNarrativeKind(kind) && (typeof text !== 'string' || text.length === 0)) {
    throw new Error(`叙事物「${o.name}」的 text 必须是非空字符串(彩蛋文案,现 ${String(text)})`)
  }
  // 钓位微差(票 #38):属性存在即校验格式(与 area 同款),只挂到钓位上
  const spotMulRaw = o.properties['spotMul']
  const spotMul = spotMulRaw !== undefined ? parseSpotMul(o, spotMulRaw) : undefined
  return {
    kind,
    name: o.name,
    x: o.x,
    y: o.y,
    radiusPx,
    ...(kind === 'spot' && area !== undefined ? { area: area as WaterAreaId } : {}),
    ...(kind === 'spot' && spotMul !== undefined ? { spotMul } : {}),
    ...(isNarrativeKind(kind) && text !== undefined ? { text: text as string } : {}),
  }
}

/** 解析物件层条目为交互点列表(保留声明序;非交互 kind 过滤) */
export function parseInteractionSpots(objects: readonly WorldMapObject[], tileWidth: number): InteractionSpotDef[] {
  const spots: InteractionSpotDef[] = []
  for (const o of objects) {
    const spot = toInteractionSpot(o, tileWidth)
    if (spot) spots.push(spot)
  }
  return spots
}

/**
 * 触发判定:玩家脚部点 (px,py) → 半径内最近交互点;范围外 = null。
 * 重叠取最近(距离最小;平局取先声明者——遍历用严格小于即保序)。
 */
export function nearestInteraction(
  spots: readonly InteractionSpotDef[],
  px: number,
  py: number,
): InteractionSpotDef | null {
  let best: InteractionSpotDef | null = null
  let bestDist = Infinity
  for (const spot of spots) {
    const dist = Math.hypot(spot.x - px, spot.y - py)
    if (dist <= spot.radiusPx && dist < bestDist) {
      best = spot
      bestDist = dist
    }
  }
  return best
}
