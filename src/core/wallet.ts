import { BAITS } from '../config'
import { readKvSnapshot, writeKvSnapshot, type KvStorage } from './kvSnapshot'

interface PersistedState {
  coins: number
  baits: Record<string, number>
  equipped: string | null
}

const STORAGE_KEY = 'starryhook:wallet'

/** 一次消费的结果:成功,或失败原因(余额不足/金额非法——返回值表达,不抛错) */
export type SpendResult = { ok: true } | { ok: false; reason: 'insufficient' | 'invalid' }

/** 一次购饵的结果:失败原因多一种「目录外饵 id」 */
export type BuyBaitResult =
  | { ok: true }
  | { ok: false; reason: 'insufficient' | 'unknown-bait' | 'invalid' }

/**
 * 钱包(经济地基):金币余额/入账/消费与鱼饵库存/装备槽/抛竿消耗,跨会话持久。
 * 纯逻辑,不依赖渲染;持久化经注入的 KvStorage,独立键名(与图鉴/成长互不干扰)。
 * 消费不足**拒绝并反馈**——用返回值表达,不抛错。
 * 读写两侧都做降级:空/损坏/越界逐字段降级(金币非负数、饵计数非负整数),不抛错。
 */
export class WalletStore {
  private coinsValue = 0
  private baitCounts = new Map<string, number>()
  private equippedValue: string | null = null

  constructor(private storage: KvStorage) {
    for (const bait of BAITS) this.baitCounts.set(bait.id, 0)
    this.restore()
  }

  coins(): number {
    return this.coinsValue
  }

  /** 登记一次捕获入账(入参 = 鱼分值,非幂等,每次都加) */
  earn(amount: number): void {
    if (!Number.isFinite(amount) || amount <= 0) return
    this.coinsValue += amount
    this.persist()
  }

  /**
   * 消费金币:余额足够则扣款并反馈成功;不足或金额非法则拒绝且状态原样不动。
   * 不抛错——失败原因用返回值表达,由调用方(UI)反馈给玩家。
   */
  spend(amount: number): SpendResult {
    if (!Number.isFinite(amount) || amount <= 0) return { ok: false, reason: 'invalid' }
    if (this.coinsValue < amount) return { ok: false, reason: 'insufficient' }
    this.coinsValue -= amount
    this.persist()
    return { ok: true }
  }

  /** 某种鱼饵的余量(竿数);未知饵 id 恒为 0 */
  baitCount(baitId: string): number {
    return this.baitCounts.get(baitId) ?? 0
  }

  /**
   * 购买鱼饵:按饵表价格扣金币,余量加该饵的单次购买竿数。
   * 余额不足 / 目录外饵 id / 金额非法一律拒绝且状态原样不动,不抛错。
   */
  buyBait(baitId: string): BuyBaitResult {
    const bait = BAITS.find(b => b.id === baitId)
    if (!bait) return { ok: false, reason: 'unknown-bait' }
    const paid = this.spend(bait.price)
    if (!paid.ok) return paid
    this.baitCounts.set(baitId, this.baitCount(baitId) + bait.charges)
    this.persist()
    return { ok: true }
  }

  /** 当前装备的鱼饵;未装备为 null */
  equippedBait(): string | null {
    return this.equippedValue
  }

  /**
   * 装备鱼饵:同一时间只装备一种,切换不清双方余量。
   * 目录外饵 id 忽略(不抛错);余量为 0 也允许装备——耗尽由计数状态表达。
   */
  equip(baitId: string): void {
    if (!BAITS.some(b => b.id === baitId)) return
    this.equippedValue = baitId
    this.persist()
  }

  /**
   * 抛竿消耗:装备的饵有余量才消耗一支并反馈生效(true);未装备或已耗尽则
   * 反馈未生效(false),状态原样不动。返回值即「本次抛竿鱼饵是否生效」,
   * 由调用方(核心循环接线,属后续票)据此应用等待减半等效果。
   */
  consumeBaitForCast(): boolean {
    const baitId = this.equippedValue
    if (!baitId || this.baitCount(baitId) <= 0) return false
    this.baitCounts.set(baitId, this.baitCount(baitId) - 1)
    this.persist()
    return true
  }

  private restore(): void {
    const state = readKvSnapshot(this.storage, STORAGE_KEY, value => this.validatePersisted(value))
    if (!state) return
    this.coinsValue = state.coins
    for (const [id, count] of Object.entries(state.baits)) this.baitCounts.set(id, count)
    this.equippedValue = state.equipped
  }

  /** 逐字段校验降级:金币取非负有限数(否则 0);饵计数取非负整数(否则 0);未知饵 id 忽略 */
  private validatePersisted(value: unknown): PersistedState {
    const state = (typeof value === 'object' && value !== null ? value : {}) as Partial<PersistedState>
    const baits: Record<string, number> = {}
    for (const bait of BAITS) {
      const count = state.baits?.[bait.id]
      if (typeof count === 'number' && Number.isInteger(count) && count >= 0) baits[bait.id] = count
    }
    const equipped =
      typeof state.equipped === 'string' && BAITS.some(b => b.id === state.equipped)
        ? state.equipped
        : null
    return {
      coins:
        typeof state.coins === 'number' && Number.isFinite(state.coins) && state.coins >= 0
          ? state.coins
          : 0,
      baits,
      equipped,
    }
  }

  private persist(): void {
    const baits: Record<string, number> = {}
    for (const bait of BAITS) baits[bait.id] = this.baitCounts.get(bait.id) ?? 0
    const state: PersistedState = {
      coins: this.coinsValue,
      baits,
      equipped: this.equippedValue,
    }
    writeKvSnapshot(this.storage, STORAGE_KEY, state)
  }
}
