import { readKvSnapshot, writeKvSnapshot, type KvStorage } from './kvSnapshot'

interface PersistedState {
  best: number
}

/** 独立键:限时单局最高纪录,与无限会话纪录(core.best,仅会话内)双轨隔离 */
const STORAGE_KEY = 'starryhook:timed-best'

/**
 * 限时单局最高纪录(票 #22/#23 纪录双轨):固定时长单局的最高得分,跨会话持久。
 * 纯逻辑,不依赖渲染;持久化经注入的 KvStorage + kvSnapshot 助手。
 * 与无限会话纪录完全隔离:core.best 仍是「会话累计得分」的会话内最大值,本 store 不触碰;
 * 两轨只在各自的读取方汇合(组合根),存储层面键名不同、互不读写。
 * 读写两侧都做降级:损坏/缺失按 0 处理,写入失败不抛错(状态留在内存)。
 */
export class TimedBestStore {
  private bestValue = 0

  constructor(private storage: KvStorage) {
    this.restore()
  }

  /** 当前限时单局最高纪录(0 = 还没有成绩) */
  best(): number {
    return this.bestValue
  }

  /**
   * 登记一局成绩:**严格更高才更新**并持久化,返回是否破纪录
   * (组合根结算提示「破纪录!」的判定源)。持平/更低不更新返回 false。
   */
  recordIfHigher(score: number): boolean {
    if (score <= this.bestValue) return false
    this.bestValue = score
    this.persist()
    return true
  }

  private restore(): void {
    const state = readKvSnapshot(this.storage, STORAGE_KEY, value => this.validatePersisted(value))
    if (!state) return
    this.bestValue = state.best
  }

  /** 逐字段校验降级:非负有限数以外一律 0(损坏 → 无纪录) */
  private validatePersisted(value: unknown): PersistedState {
    const state = (typeof value === 'object' && value !== null ? value : {}) as Partial<PersistedState>
    return {
      best:
        typeof state.best === 'number' && Number.isFinite(state.best) && state.best >= 0
          ? state.best
          : 0,
    }
  }

  private persist(): void {
    writeKvSnapshot(this.storage, STORAGE_KEY, { best: this.bestValue })
  }
}
