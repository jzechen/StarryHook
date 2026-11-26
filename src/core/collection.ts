import { readKvSnapshot, writeKvSnapshot, type KvStorage } from './kvSnapshot'

// KvStorage 定义上移至 kvSnapshot.ts,此处再导出保持既有导入点('./core/collection')兼容
export type { KvStorage }

interface PersistedState {
  collected: string[]
  completionAcknowledged: boolean
}

const STORAGE_KEY = 'starryhook:collection'

/**
 * 收集册(图鉴地基):登记已捕获鱼种、查询收集状态,跨会话持久。
 * 纯逻辑,不依赖渲染;持久化经注入的 KvStorage。
 * 条目集合由构造传入的目录 id 界定——目录外的 id 一律忽略(含损坏数据中的)。
 * 读写两侧都做降级:损坏/缺失按空册处理,写入失败不抛错。
 */
export class CollectionStore {
  private collected = new Set<string>()
  private acknowledged = false

  constructor(
    private fishIds: readonly string[],
    private storage: KvStorage,
  ) {
    this.restore()
  }

  /** 登记一次捕获;同种鱼重复登记幂等,目录外 id 忽略 */
  recordCatch(fishId: string): void {
    if (!this.fishIds.includes(fishId)) return
    this.collected.add(fishId)
    this.persist()
  }

  has(fishId: string): boolean {
    return this.collected.has(fishId)
  }

  /** 已收集列表,按目录顺序 */
  collectedIds(): readonly string[] {
    return this.fishIds.filter(id => this.collected.has(id))
  }

  progress(): { collected: number; total: number } {
    return { collected: this.collected.size, total: this.fishIds.length }
  }

  isComplete(): boolean {
    return this.fishIds.length > 0 && this.collected.size >= this.fishIds.length
  }

  /** "池塘大满贯"是否已经提示过(幂等标记,持久化) */
  completionAcknowledged(): boolean {
    return this.acknowledged
  }

  acknowledgeCompletion(): void {
    if (this.acknowledged) return
    this.acknowledged = true
    this.persist()
  }

  private restore(): void {
    const state = readKvSnapshot(this.storage, STORAGE_KEY, value => this.validatePersisted(value))
    if (!state) return
    for (const id of state.collected) this.collected.add(id)
    if (state.completionAcknowledged) this.acknowledged = true
  }

  /** 逐字段校验降级:非字符串/目录外 id 过滤,标记非 true 归 false(损坏 → 空收集册) */
  private validatePersisted(value: unknown): PersistedState {
    const state = (typeof value === 'object' && value !== null ? value : {}) as Partial<PersistedState>
    return {
      collected: Array.isArray(state.collected)
        ? state.collected.filter(
            (id): id is string => typeof id === 'string' && this.fishIds.includes(id),
          )
        : [],
      completionAcknowledged: state.completionAcknowledged === true,
    }
  }

  private persist(): void {
    const state: PersistedState = {
      collected: [...this.collected],
      completionAcknowledged: this.acknowledged,
    }
    writeKvSnapshot(this.storage, STORAGE_KEY, state)
  }
}
