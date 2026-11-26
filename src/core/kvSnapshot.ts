/**
 * 键值存储适配器:系统边界(真实实现为浏览器 localStorage,测试用内存替身)。
 * 定义自 collection.ts 上移至此(读写助手以它为参数),collection.ts 保留同名再导出,既有导入点不受影响。
 */
export interface KvStorage {
  get(key: string): string | null
  set(key: string, value: string): void
}

/**
 * 键值快照读写助手:收集册(collection.ts)与成长(progression.ts)共用的
 * 持久化骨架,消除两处同型的 restore/persist 样板(try 读 → JSON.parse →
 * 逐字段校验降级;try/catch 序列化写入)。
 *
 * 降级语义(与两 store 原实现逐点一致):
 * - 读:无原始值、JSON 解析失败或校验抛错 → 返回 null,调用方沿用当前(默认)状态;
 *   字段级合法性由调用方传入的校验函数逐字段判定,非法字段取各自默认值。
 * - 写:序列化写入失败(隐私模式/配额)静默吞掉,状态留在内存,游戏不受影响。
 */
export function readKvSnapshot<T>(
  storage: KvStorage,
  key: string,
  validate: (value: unknown) => T,
): T | null {
  try {
    const raw = storage.get(key)
    if (!raw) return null
    return validate(JSON.parse(raw))
  } catch {
    return null // 数据损坏 → 按无快照处理
  }
}

/** 序列化写入快照;写入失败不抛错(见上方降级语义) */
export function writeKvSnapshot(storage: KvStorage, key: string, state: unknown): void {
  try {
    storage.set(key, JSON.stringify(state))
  } catch {
    // 写入失败(隐私模式/配额)→ 状态留在内存
  }
}
