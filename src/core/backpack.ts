import { QUALITIES } from './quality'
import type { FishQuality } from './types'

/**
 * 背包(票 #39,spec §4.1–4.2):渔获的物品形态,按(鱼种 × 品质)堆叠。
 * 纯核心 store,不依赖渲染、不感知金币(卖鱼入账由组合根接线 wallet.earn);
 * 持久化(kv 键)与背包/储物箱面板归票 #40,本票只做堆叠与取出语义。
 * 堆叠无容量上限(spec §4.4);目录外鱼种一律忽略(与图鉴同款纪律)。
 */

/** 一摞渔获:同鱼种同品质的堆叠(数量 ≥ 1 才成堆) */
export interface BackpackEntry {
  fishId: string
  quality: FishQuality
  count: number
}

/** 堆叠键 = (鱼种 × 品质)(spec §4.2) */
function stackKey(fishId: string, quality: FishQuality): string {
  return `${fishId}|${quality}`
}

export class BackpackStore {
  private counts = new Map<string, number>()

  constructor(private fishIds: readonly string[]) {}

  /** 登记一条渔获入包(非幂等,每次 +1);目录外鱼种忽略 */
  addFish(fishId: string, quality: FishQuality): void {
    if (!this.fishIds.includes(fishId)) return
    const key = stackKey(fishId, quality)
    this.counts.set(key, (this.counts.get(key) ?? 0) + 1)
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
    if (!Number.isInteger(count) || count <= 0) return 0
    const key = stackKey(fishId, quality)
    const taken = Math.min(count, this.counts.get(key) ?? 0)
    if (taken <= 0) return 0
    const left = (this.counts.get(key) ?? 0) - taken
    if (left > 0) this.counts.set(key, left)
    else this.counts.delete(key)
    return taken
  }
}
