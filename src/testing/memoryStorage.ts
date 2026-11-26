import type { KvStorage } from '../core/collection'

/**
 * 共享测试替身:内存键值存储,顶替 localStorage 系统边界(仓库测试规范)。
 * 供核心与 UI 各测试文件共用,勿在用例内再复制本地版本。
 */
export function memoryStorage(): KvStorage {
  const map = new Map<string, string>()
  return {
    get: key => map.get(key) ?? null,
    set: (key, value) => {
      map.set(key, value)
    },
  }
}
