import { readKvSnapshot, writeKvSnapshot, type KvStorage } from '../core/kvSnapshot'

interface PersistedState {
  muted: boolean
}

const STORAGE_KEY = 'starryhook:muted'

/**
 * 静音开关(纯 UI 层状态):跨会话持久,注入 KvStorage(与收集册/成长同一存储边界)。
 * 降级语义与核心 store 同型:无快照/损坏/字段非法 → 默认非静音;
 * 写入失败(隐私模式/配额)静默吞掉,状态留在内存,游戏不受影响。
 */
export class MuteStore {
  private isMuted = false

  constructor(private storage: KvStorage) {
    this.restore()
  }

  muted(): boolean {
    return this.isMuted
  }

  /** 切换静音并持久化,返回切换后的状态(顶栏按钮据此换图标) */
  toggle(): boolean {
    this.isMuted = !this.isMuted
    writeKvSnapshot(this.storage, STORAGE_KEY, { muted: this.isMuted })
    return this.isMuted
  }

  private restore(): void {
    const state = readKvSnapshot(this.storage, STORAGE_KEY, value => this.validatePersisted(value))
    if (state) this.isMuted = state.muted
  }

  /** 逐字段校验降级:muted 非布尔一律按默认非静音处理 */
  private validatePersisted(value: unknown): PersistedState {
    const state = (typeof value === 'object' && value !== null ? value : {}) as Partial<PersistedState>
    return { muted: typeof state.muted === 'boolean' ? state.muted : false }
  }
}
