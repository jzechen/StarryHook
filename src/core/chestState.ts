import { chestDef } from './chests'
import { readKvSnapshot, writeKvSnapshot, type KvStorage } from './kvSnapshot'

/**
 * 宝箱已开态(票 #41,spec §4.5/§4.6):宝箱是**一次性**奖励交互点,
 * 已开状态跨会话持久(kv 自开键,沿 readKvSnapshot 校验降级模式)。
 *
 * `open` 是唯一写入点,也是一次性判定的单点:已开 = false(调用方不结算),
 * 首开 = true 并落盘——「检查再开」两步在同步块内原子完成,重复结算不可能。
 * 快照 = 已开 id 集合;restore 逐条校验目录(chestDef)后收录,目录外 id
 * 丢弃(宝箱表裁撤后旧档不残留幽灵键)。
 */
interface PersistedState {
  opened: string[]
}

/** kv 键(宝箱已开态;spec §4.6 新键) */
export const CHESTS_KEY = 'starryhook:chests'

export class ChestOpenedStore {
  private opened = new Set<string>()

  constructor(private storage: KvStorage) {
    this.restore()
  }

  /** 某宝箱是否已开(渲染空箱外观与「不可再开」门禁的单一来源) */
  isOpen(id: string): boolean {
    return this.opened.has(id)
  }

  /**
   * 开箱:首次 = true(调用方结算掉落并落盘);已开 = false 且状态原样不动。
   * 目录外 id 忽略(与 wallet/backpack「目录外忽略」同款纪律)。
   */
  open(id: string): boolean {
    if (!chestDef(id) || this.opened.has(id)) return false
    this.opened.add(id)
    this.persist()
    return true
  }

  private restore(): void {
    const state = readKvSnapshot(this.storage, CHESTS_KEY, value => this.validatePersisted(value))
    if (!state) return
    for (const id of state.opened) this.opened.add(id)
  }

  /** 逐条校验降级:opened 数组内的目录外 id 丢弃,其余原样收录 */
  private validatePersisted(value: unknown): PersistedState {
    const state = (typeof value === 'object' && value !== null ? value : {}) as Partial<PersistedState>
    const opened: string[] = []
    if (Array.isArray(state.opened)) {
      for (const id of state.opened) {
        if (typeof id === 'string' && chestDef(id)) opened.push(id)
      }
    }
    return { opened }
  }

  private persist(): void {
    const state: PersistedState = { opened: [...this.opened] }
    writeKvSnapshot(this.storage, CHESTS_KEY, state)
  }
}
