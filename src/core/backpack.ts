import { QUALITIES } from './quality'
import type { FishQuality } from './types'
import { readKvSnapshot, writeKvSnapshot, type KvStorage } from './kvSnapshot'

/**
 * 背包(票 #39,spec §4.1–4.2):渔获的物品形态,按(鱼种 × 品质)堆叠。
 * 纯核心 store,不依赖渲染、不感知金币(卖鱼入账由组合根接线 wallet.earn);
 * 堆叠无容量上限(spec §4.4);目录外鱼种一律忽略(与图鉴同款纪律)。
 *
 * 票 #40 扩展(spec §4.4/§4.6):
 * - 收藏品区:背包的第二分区(渔获带品质、收藏品不带),堆叠语义与渔获同构;
 *   目录由构造注入(#41 宝箱内容表落地后传入真实目录,本票组合根传空表);
 * - kv 持久化:构造可选注入 { storage, key },restore/persist 沿 wallet/collection
 *   样式(readKvSnapshot 校验降级,损坏/缺字段逐条回默认;写入失败静默吞)。
 *   未注入 = 纯内存,票 #39 行为逐位不动。储物箱 = 同一 store 的第二实例
 *   (独立 kv 键),转移面板复用 add/take 语义(组合根接线,见 ui/storageWiring)。
 */

/** 一摞渔获:同鱼种同品质的堆叠(数量 ≥ 1 才成堆) */
export interface BackpackEntry {
  fishId: string
  quality: FishQuality
  count: number
}

/** 一摞收藏品:同 id 堆叠(数量 ≥ 1 才成堆;收藏品无品质维) */
export interface CollectibleEntry {
  id: string
  count: number
}

/** kv 持久化注入(键决定这份背包是谁:backpack / storage) */
export interface BackpackPersistence {
  storage: KvStorage
  key: string
}

/** 落盘快照形态:两个分区各一个条目数组(entries() 的原样形态,票面建议) */
interface PersistedState {
  fish: BackpackEntry[]
  collectibles: CollectibleEntry[]
}

/** 堆叠键 = (鱼种 × 品质)(spec §4.2) */
function stackKey(fishId: string, quality: FishQuality): string {
  return `${fishId}|${quality}`
}

/** 数量合法性:正整数才入账(0/负/非整数一律拒) */
function isPositiveInt(count: number): boolean {
  return Number.isInteger(count) && count > 0
}

export class BackpackStore {
  private counts = new Map<string, number>()
  private collectibleCounts = new Map<string, number>()

  constructor(
    private fishIds: readonly string[],
    private collectibleIds: readonly string[] = [],
    private persistence?: BackpackPersistence,
  ) {
    this.restore()
  }

  /** 登记一条渔获入包(非幂等,每次 +1);目录外鱼种忽略;count 缺省 1,非法数量无副作用 */
  addFish(fishId: string, quality: FishQuality, count = 1): void {
    if (!this.fishIds.includes(fishId)) return
    if (!isPositiveInt(count)) return
    const key = stackKey(fishId, quality)
    this.counts.set(key, (this.counts.get(key) ?? 0) + count)
    this.persist()
  }

  /** 某(鱼种,品质)堆叠的余量;无此堆叠恒 0 */
  count(fishId: string, quality: FishQuality): number {
    return this.counts.get(stackKey(fishId, quality)) ?? 0
  }

  /** 堆叠列表:目录序 × 品质序,只含有货堆叠(0 条目不留) */
  entries(): BackpackEntry[] {
    const entries: BackpackEntry[] = []
    for (const fishId of this.fishIds) {
      for (const quality of QUALITIES) {
        const count = this.count(fishId, quality)
        if (count > 0) entries.push({ fishId, quality, count })
      }
    }
    return entries
  }

  /**
   * 取出 n 条(摊位售卖的物品侧):返回实际取出数。
   * 余量不足取到空;取 0 条/非法数量无副作用;堆叠取空后不留 0 条目。
   */
  take(fishId: string, quality: FishQuality, count: number): number {
    if (!isPositiveInt(count)) return 0
    const key = stackKey(fishId, quality)
    const taken = Math.min(count, this.counts.get(key) ?? 0)
    if (taken <= 0) return 0
    const left = (this.counts.get(key) ?? 0) - taken
    if (left > 0) this.counts.set(key, left)
    else this.counts.delete(key)
    this.persist()
    return taken
  }

  /** 收藏品入包(非幂等,count 缺省 1);目录外 id 忽略;非法数量无副作用 */
  addCollectible(id: string, count = 1): void {
    if (!this.collectibleIds.includes(id)) return
    if (!isPositiveInt(count)) return
    this.collectibleCounts.set(id, (this.collectibleCounts.get(id) ?? 0) + count)
    this.persist()
  }

  /** 某收藏品的余量;未拥有恒 0 */
  countCollectible(id: string): number {
    return this.collectibleCounts.get(id) ?? 0
  }

  /** 收藏品堆叠列表:目录序,只含有货堆叠 */
  collectibleEntries(): CollectibleEntry[] {
    const entries: CollectibleEntry[] = []
    for (const id of this.collectibleIds) {
      const count = this.countCollectible(id)
      if (count > 0) entries.push({ id, count })
    }
    return entries
  }

  /** 收藏品取出(转移/消耗侧):语义与 take 同构,返回实际取出数 */
  takeCollectible(id: string, count: number): number {
    if (!isPositiveInt(count)) return 0
    const taken = Math.min(count, this.collectibleCounts.get(id) ?? 0)
    if (taken <= 0) return 0
    const left = (this.collectibleCounts.get(id) ?? 0) - taken
    if (left > 0) this.collectibleCounts.set(id, left)
    else this.collectibleCounts.delete(id)
    this.persist()
    return taken
  }

  /** 启动还原:无档/损坏 → 沿用默认空包(readKvSnapshot 的降级语义) */
  private restore(): void {
    if (!this.persistence) return
    const state = readKvSnapshot(this.persistence.storage, this.persistence.key, value =>
      this.validatePersisted(value),
    )
    if (!state) return
    for (const entry of state.fish) {
      this.counts.set(stackKey(entry.fishId, entry.quality), entry.count)
    }
    for (const entry of state.collectibles) {
      this.collectibleCounts.set(entry.id, entry.count)
    }
  }

  /** 逐字段校验降级:目录外 id / 表外品质 / 非正整数数量逐条丢弃(损坏 → 缺该条) */
  private validatePersisted(value: unknown): PersistedState {
    const state = (typeof value === 'object' && value !== null ? value : {}) as Partial<PersistedState>
    const fish: BackpackEntry[] = []
    if (Array.isArray(state.fish)) {
      for (const raw of state.fish) {
        const entry = raw as Partial<BackpackEntry>
        const quality = entry.quality
        if (!this.fishIds.includes(entry.fishId as string)) continue
        if (quality !== 'normal' && quality !== 'silver' && quality !== 'gold') continue
        if (!isPositiveInt(entry.count as number)) continue
        fish.push({ fishId: entry.fishId as string, quality, count: entry.count as number })
      }
    }
    const collectibles: CollectibleEntry[] = []
    if (Array.isArray(state.collectibles)) {
      for (const raw of state.collectibles) {
        const entry = raw as Partial<CollectibleEntry>
        if (!this.collectibleIds.includes(entry.id as string)) continue
        if (!isPositiveInt(entry.count as number)) continue
        collectibles.push({ id: entry.id as string, count: entry.count as number })
      }
    }
    return { fish, collectibles }
  }

  /** 变动即落盘(与 wallet/collection 同口径);未注入持久化则零开销跳过 */
  private persist(): void {
    if (!this.persistence) return
    const state: PersistedState = { fish: this.entries(), collectibles: this.collectibleEntries() }
    writeKvSnapshot(this.persistence.storage, this.persistence.key, state)
  }
}
