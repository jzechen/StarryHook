import { QUALITIES } from './quality'
import { Rng, deriveSeed } from './rng'
import type { FishQuality } from './types'
import { readKvSnapshot, writeKvSnapshot, type KvStorage } from './kvSnapshot'

/**
 * 公告板与订单(票 #55,spec 内容扩充「公告板与订单」):公告板发布的渔获
 * 征集 = {鱼种 × 品质门槛 × 数量}。纯核心 store + 纯函数校验,不依赖渲染、
 * 不感知金币与背包(交付 = 组合根接线扣背包 + wallet.earn,见 ui/economyWiring)。
 *
 * - 订单池:表驱动模板(6~8 条),交付后随机轮转出新单(排除刚交付的模板,
 *   轮转不空转);队列制 = 同一时间至多一单,交付不限时、垂钓中可积累;
 * - 酬金 = 鱼分值 × 数量 × 1.5(四舍五入;品质只影响卖价,订单按条收不按星溢价);
 * - 交付校验:数量与品质门槛判定产出「扣包计划」(从达标堆叠按 低品质优先
 *   贪心取),缺鱼 / 品质不足分列返回,不抛错;
 * - kv 持久化:构造可选注入 { storage, key },restore/persist 沿 wallet/collection
 *   样式(readKvSnapshot 校验降级,损坏/缺字段回默认后重出首单);未注入 = 纯内存。
 */

/** 一单订单(订单池模板与当前订单同形;GLOSSARY 订单:鱼种、品质门槛、数量) */
export interface OrderDef {
  fishId: string
  /** 品质门槛:该档及以上才计达标(normal = 不设星要求) */
  minQuality: FishQuality
  /** 征集数量(2~5,池表约束由 orderBoard.test 钉住) */
  count: number
}

/**
 * 订单池模板表(6~8 条,票面口径):覆盖全部既有鱼种,普通门槛为主、
 * 银星门槛做进阶变化。票 #53 扩鱼种时往表里加行即插即用(表驱动,零逻辑改动)。
 */
export const ORDER_TEMPLATES: readonly OrderDef[] = [
  { fishId: 'xiaobaitiao', minQuality: 'normal', count: 3 },
  { fishId: 'xiaobaitiao', minQuality: 'silver', count: 2 },
  { fishId: 'wenzhongji', minQuality: 'normal', count: 4 },
  { fishId: 'wenzhongji', minQuality: 'silver', count: 2 },
  { fishId: 'qianzhuinian', minQuality: 'normal', count: 2 },
  { fishId: 'qiqiuHetun', minQuality: 'normal', count: 3 },
  { fishId: 'shandiansuo', minQuality: 'normal', count: 2 },
  { fishId: 'shandiansuo', minQuality: 'silver', count: 2 },
]

/** 酬金倍率(票 #55:分值 × 数量 × 1.5) */
export const ORDER_REWARD_MUL = 1.5

/** 酬金 = 鱼分值 × 数量 × 1.5(四舍五入到整数金币;与品质无关) */
export function orderReward(score: number, count: number): number {
  return Math.round(score * count * ORDER_REWARD_MUL)
}

/** 品质序(低 → 高;与 QUALITIES 同序,达标判定用) */
const QUALITY_RANK: Readonly<Record<FishQuality, number>> = { normal: 0, silver: 1, gold: 2 }

/** 交付拒绝原因:missing = 缺鱼(全品质总数不足);quality = 品质不足(总数够、达标不够) */
export type OrderRejectReason = 'missing' | 'quality'

/** 一段扣包计划:从某品质堆叠取 n 条(达标堆叠按低品质在前的贪心序) */
export interface DeliveryTake {
  quality: FishQuality
  count: number
}

/** 交付计划:ok = 逐堆取货清单(交由调用方按序扣包);否 = 分列拒绝原因 */
export type DeliveryPlan =
  | { ok: true; takes: readonly DeliveryTake[] }
  | { ok: false; reason: OrderRejectReason }

/**
 * 交付校验(纯函数):订单 × 各品质持有量 → 扣包计划。
 * 达标堆 = 品质不低于门槛的堆叠(「以上」语义,金星计入银星门槛);
 * 总数不足 = missing,总数够但达标不足 = quality(普通堆再多也不补)。
 * 计划按 低品质 → 高品质 贪心取满(便宜堆先出,玩家不留贵鱼抵数)。
 */
export function deliveryPlan(
  order: OrderDef,
  counts: Readonly<Record<FishQuality, number>>,
): DeliveryPlan {
  const threshold = QUALITY_RANK[order.minQuality]
  const total = QUALITIES.reduce((sum, q) => sum + (counts[q] ?? 0), 0)
  const qualifying = qualifyingCount(order, counts)
  const takes: DeliveryTake[] = []
  let remaining = order.count
  for (const quality of QUALITIES) {
    if (QUALITY_RANK[quality] < threshold) continue
    const available = counts[quality] ?? 0
    if (available <= 0) continue
    const take = Math.min(available, remaining)
    if (take > 0) {
      takes.push({ quality, count: take })
      remaining -= take
    }
  }
  if (qualifying < order.count) {
    return { ok: false, reason: total < order.count ? 'missing' : 'quality' }
  }
  return { ok: true, takes }
}

/** 达标持有量:该鱼种品质达到门槛的堆叠总数(面板「持有 x/n」进度与校验同源) */
export function qualifyingCount(
  order: OrderDef,
  counts: Readonly<Record<FishQuality, number>>,
): number {
  const threshold = QUALITY_RANK[order.minQuality]
  return QUALITIES.reduce(
    (sum, quality) => (QUALITY_RANK[quality] >= threshold ? sum + (counts[quality] ?? 0) : sum),
    0,
  )
}

// —— 订单轮转与 kv 持久化(队列制同时仅一单) ——

/** kv 键(公告板当前订单;spec 内容扩充新键) */
export const ORDERS_KEY = 'starryhook:orders'

/** 订单旁路的派生盐:主种子经派生后喂独立 Rng,与主随机序列完全解耦(沿品质先例) */
export const ORDER_SEED_SALT = 0x0a6d3b77

/** 订单会话 Rng:同主种子 → 同订单序列(?seed 可复现),主序列一个 draw 不动 */
export function sessionOrderRng(mainSeed: number): Rng {
  return new Rng(deriveSeed(mainSeed, ORDER_SEED_SALT))
}

/** 落盘快照形态:当前订单一单(队列制同时仅一单) */
interface PersistedState {
  current: OrderDef | null
}

function sameOrder(a: OrderDef, b: OrderDef | null): boolean {
  return b !== null && a.fishId === b.fishId && a.minQuality === b.minQuality && a.count === b.count
}

/** 数量合法性:2~5 的整数(池表口径,快照同规) */
function isOrderCount(count: unknown): count is number {
  return typeof count === 'number' && Number.isInteger(count) && count >= 2 && count <= 5
}

export class OrderBoardStore {
  private currentOrder: OrderDef | null = null

  constructor(
    private rng: Rng,
    private persistence?: { storage: KvStorage; key: string },
  ) {
    this.restore()
    if (!this.currentOrder) this.draw()
  }

  /** 当前订单(构造起恒有一单:无档/损坏 → 立即出首单,队列不空转) */
  current(): OrderDef {
    return this.currentOrder!
  }

  /**
   * 交付完成:随即从池随机出新单(排除刚交付的模板,轮转不空转)并落盘。
   * 调用纪律:组合根在「扣包 + 入账」成功后恰好调用一次(见 ui/economyWiring)。
   */
  complete(): OrderDef {
    this.draw()
    this.persist()
    return this.currentOrder!
  }

  /** 从池抽新单(排除当前;排除后为空则全池兜底——池表 ≥2 时不可达,防御保留) */
  private draw(): void {
    const pool = ORDER_TEMPLATES.filter(t => !sameOrder(t, this.currentOrder))
    const choices = pool.length > 0 ? pool : ORDER_TEMPLATES
    this.currentOrder = this.rng.pick(choices, choices.map(() => 1))
  }

  /** 启动还原:无档/损坏/目录外鱼种 → 沿用 null(构造器随即重出首单) */
  private restore(): void {
    if (!this.persistence) return
    const state = readKvSnapshot(this.persistence.storage, this.persistence.key, value =>
      this.validatePersisted(value),
    )
    if (!state) return
    if (state.current) this.currentOrder = state.current
  }

  /** 逐字段校验降级:鱼种目录外 / 表外门槛 / 数量越界 → 整单丢弃(损坏 → 无单) */
  private validatePersisted(value: unknown): PersistedState {
    const state = (typeof value === 'object' && value !== null ? value : {}) as Partial<PersistedState>
    const raw = state.current as Partial<OrderDef> | null | undefined
    const current =
      raw &&
      typeof raw === 'object' &&
      typeof raw.fishId === 'string' &&
      ORDER_TEMPLATES.some(t => t.fishId === raw.fishId) &&
      (raw.minQuality === 'normal' || raw.minQuality === 'silver' || raw.minQuality === 'gold') &&
      isOrderCount(raw.count)
        ? { fishId: raw.fishId, minQuality: raw.minQuality, count: raw.count }
        : null
    return { current }
  }

  private persist(): void {
    if (!this.persistence) return
    const state: PersistedState = { current: this.currentOrder }
    writeKvSnapshot(this.persistence.storage, this.persistence.key, state)
  }
}
