import { RODS } from '../config'
import type { RodDef } from '../config'
import { readKvSnapshot, writeKvSnapshot, type KvStorage } from './kvSnapshot'

interface PersistedState {
  xp: number
  level: number
}

const STORAGE_KEY = 'starryhook:progression'

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

/**
 * 成长(经验/等级/竿):登记捕获经验并返回升级增量,等级自动解锁更高竿档。
 * 纯逻辑,不依赖渲染;持久化经注入的 KvStorage,只存 {经验, 等级}(竿由等级推导)。
 * 经验登记**非幂等**:每次捕获都累加,与图鉴的幂等语义不同。
 * 读写两侧都做降级:损坏/缺失按初始状态(1 级/0 经验/竹竿)处理,写入失败不抛错。
 */
export class ProgressionStore {
  private xpValue = 0
  private levelValue = 1

  constructor(private storage: KvStorage) {
    this.restore()
  }

  xp(): number {
    return this.xpValue
  }

  level(): number {
    return this.levelValue
  }

  /** 当前竿,由等级实时推导 */
  rod(): RodDef {
    return rodForLevel(this.levelValue)
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
}
