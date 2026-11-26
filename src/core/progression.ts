import { RODS } from '../config'
import type { RodDef } from '../config'
import { readKvSnapshot, writeKvSnapshot, type KvStorage } from './kvSnapshot'

interface PersistedState {
  xp: number
  level: number
}

/** 已购竿集合的落盘形态:独立键,缺键/缺字段 = 空集(向后兼容旧存档) */
interface PurchasedRodsState {
  purchased: string[]
}

const STORAGE_KEY = 'starryhook:progression'
const PURCHASED_RODS_KEY = 'starryhook:purchased-rods'

/** 一次经验登记的升级增量:连升次数与竿档变化时的新竿(否则 null) */
export interface ProgressResult {
  levelsGained: number
  rodUnlocked: RodDef | null
}

/** 升到 level 的下一级所需经验:150 × 当前等级(起步值) */
function xpNeed(level: number): number {
  return 150 * level
}

/** 由等级推导当前竿:解锁等级 ≤ 当前等级的最高档 */
function rodForLevel(level: number): RodDef {
  let found = RODS[0]
  for (const rod of RODS) {
    if (rod.unlockLevel <= level && rod.unlockLevel > found.unlockLevel) found = rod
  }
  return found
}

/** 竿是否在竿表中 */
function isKnownRod(rodId: string): boolean {
  return RODS.some(rod => rod.id === rodId)
}

/**
 * 成长(经验/等级/竿):登记捕获经验并返回升级增量,等级自动解锁更高竿档。
 * 纯逻辑,不依赖渲染;持久化经注入的 KvStorage,主键只存 {经验, 等级}(竿由等级推导)。
 * 经验登记**非幂等**:每次捕获都累加,与图鉴的幂等语义不同。
 * 竿的第二解锁路径(spec #17 经济系统):已购竿集合走独立键,竿可用性 = 等级解锁 ∪ 已购;
 * 购买 = 立即解锁并切换为当前竿,此后等级解锁更高竿仍自动切换(现行语义不变)。
 * 无购买时可用性与旧版逐帧一致(空集并集不改变推导结果)。
 * 读写两侧都做降级:损坏/缺失按初始状态(1 级/0 经验/竹竿/空集)处理,写入失败不抛错。
 */
export class ProgressionStore {
  private xpValue = 0
  private levelValue = 1
  private purchased = new Set<string>()

  constructor(private storage: KvStorage) {
    this.restore()
    this.restorePurchased()
  }

  xp(): number {
    return this.xpValue
  }

  level(): number {
    return this.levelValue
  }

  /** 当前竿:由等级与已购集合实时推导(两者并集中解锁等级最高的档) */
  rod(): RodDef {
    let found = rodForLevel(this.levelValue)
    for (const rodId of this.purchased) {
      const rod = RODS.find(r => r.id === rodId)
      if (rod && rod.unlockLevel > found.unlockLevel) found = rod
    }
    return found
  }

  /** 竿可用性:等级解锁 ∪ 已购 */
  isRodUnlocked(rodId: string): boolean {
    const rod = RODS.find(r => r.id === rodId)
    if (!rod) return false
    return rod.unlockLevel <= this.levelValue || this.purchased.has(rodId)
  }

  /**
   * 购买鱼竿(金币扣款由钱包侧组合,属后续商店票):写入已购集合并立即切换为当前竿。
   * 级不够亦可购买;仅当目标竿的解锁等级**高于当前竿**时才可购——已等级解锁或
   * 已购的竿拒绝(购买无意义,商店标"已拥有"),更低档的竿也拒绝(购买不降档,
   * 成功即换竿的不变式)。目录外竿 id 拒绝。成功返回该竿,失败返回 null,不抛错。
   */
  purchaseRod(rodId: string): RodDef | null {
    const rod = RODS.find(r => r.id === rodId)
    if (!rod || rod.unlockLevel <= this.rod().unlockLevel) return null
    this.purchased.add(rodId)
    this.persistPurchased()
    return rod
  }

  /** 登记一次捕获经验(入参 = 捕获分值,非幂等);循环判级,升后扣除 */
  recordCatch(score: number): ProgressResult {
    const rodBefore = this.rod()
    this.xpValue += score
    let levelsGained = 0
    while (this.xpValue >= xpNeed(this.levelValue)) {
      this.xpValue -= xpNeed(this.levelValue)
      this.levelValue += 1
      levelsGained += 1
    }
    const rodAfter = this.rod()
    this.persist()
    return { levelsGained, rodUnlocked: rodAfter.id !== rodBefore.id ? rodAfter : null }
  }

  private restore(): void {
    const state = readKvSnapshot(this.storage, STORAGE_KEY, value => this.validatePersisted(value))
    if (!state) return
    this.xpValue = state.xp
    this.levelValue = state.level
  }

  /** 逐字段校验降级:非法/越界字段取默认值(xp 非负有限数归 0,level ≥ 1 整数归 1;损坏 → 初始状态) */
  private validatePersisted(value: unknown): PersistedState {
    const state = (typeof value === 'object' && value !== null ? value : {}) as Partial<PersistedState>
    return {
      xp:
        typeof state.xp === 'number' && Number.isFinite(state.xp) && state.xp >= 0 ? state.xp : 0,
      level:
        typeof state.level === 'number' && Number.isInteger(state.level) && state.level >= 1
          ? state.level
          : 1,
    }
  }

  private persist(): void {
    const state: PersistedState = { xp: this.xpValue, level: this.levelValue }
    writeKvSnapshot(this.storage, STORAGE_KEY, state)
  }

  private restorePurchased(): void {
    const state = readKvSnapshot(this.storage, PURCHASED_RODS_KEY, value =>
      this.validatePurchased(value),
    )
    if (!state) return
    for (const rodId of state.purchased) this.purchased.add(rodId)
  }

  /** 已购集合逐字段校验降级:非数组 → 空集;目录外竿 id 过滤(与图鉴同款) */
  private validatePurchased(value: unknown): PurchasedRodsState {
    const state = (typeof value === 'object' && value !== null ? value : {}) as Partial<PurchasedRodsState>
    return {
      purchased: Array.isArray(state.purchased)
        ? state.purchased.filter((rodId): rodId is string => typeof rodId === 'string' && isKnownRod(rodId))
        : [],
    }
  }

  private persistPurchased(): void {
    writeKvSnapshot(this.storage, PURCHASED_RODS_KEY, { purchased: [...this.purchased] })
  }
}
