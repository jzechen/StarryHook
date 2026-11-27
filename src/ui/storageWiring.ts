import type { BackpackStore } from '../core/backpack'
import type { FishQuality } from '../core/types'

/**
 * 一次转移的物品(储物箱面板两栏共用;渔获带品质维、收藏品不带):
 * fish = 渔获堆叠(按 鱼种 × 品质 整堆走);collectible = 收藏品堆叠。
 */
export type TransferItem =
  | { kind: 'fish'; fishId: string; quality: FishQuality }
  | { kind: 'collectible'; id: string }

/** 一次转移的语义结果:ok = 已转移;empty = 源侧无此堆叠(空取,状态原样) */
export type TransferOutcome = 'ok' | 'empty'

/**
 * 储物箱转移接线(组合根注入缝的工厂,票 #40 spec §4.4):
 * 转移 = 源 store 取出 + 目标 store 存入一体(复用背包 take/add 语义,
 * 整合缝笔记「储物箱转移面板可复用 entries()/addFish/take 语义」),一次调用
 * 完成,不存在中间态。点按 = 该堆叠当下余量整堆走(数量实时读取,与商店
 * 「全卖」同款纪律);双方无容量上限、无腐坏,v1 不需要确认步。
 * 空取/目录外条目 → 'empty'(不取货、不存入),由面板侧行为兜底
 * (行只按有货堆叠渲染,空取正常操作不可达,返回值只作守卫)。
 */
export function transferBetween(
  source: BackpackStore,
  target: BackpackStore,
): (item: TransferItem) => TransferOutcome {
  return item => {
    if (item.kind === 'fish') {
      const taken = source.take(item.fishId, item.quality, source.count(item.fishId, item.quality))
      if (taken <= 0) return 'empty'
      target.addFish(item.fishId, item.quality, taken)
      return 'ok'
    }
    const taken = source.takeCollectible(item.id, source.countCollectible(item.id))
    if (taken <= 0) return 'empty'
    target.addCollectible(item.id, taken)
    return 'ok'
  }
}
