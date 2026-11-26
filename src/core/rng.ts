/**
 * 派生种子:同一种子 + 盐 → 稳定的独立种子。
 * 供天气等旁路会话使用:各旁路用不同盐派生自己的 Rng,互不消费主随机序列。
 */
export function deriveSeed(seed: number, salt: number): number {
  let s = (seed ^ salt) >>> 0
  s = Math.imul(s ^ (s >>> 16), 0x21f0aaad)
  s = Math.imul(s ^ (s >>> 15), 0x735a2d97)
  return (s ^ (s >>> 15)) >>> 0
}

/** mulberry32 可复现随机数:整局随机序列由种子决定,?seed=123 可复现。 */
export class Rng {
  private s: number
  /** 构造时的初始种子(只读暴露供派生旁路会话;不影响抽取序列) */
  readonly seed: number

  constructor(seed: number) {
    this.seed = seed >>> 0
    this.s = this.seed
  }

  /** [0, 1) */
  float(): number {
    this.s = (this.s + 0x6d2b79f5) | 0
    let t = this.s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.float()
  }

  /** 按权重抽取一项(权重不必归一化) */
  pick<T>(items: readonly T[], weights: readonly number[]): T {
    let sum = 0
    for (const w of weights) sum += w
    let r = this.float() * sum
    for (let i = 0; i < items.length; i++) {
      r -= weights[i]
      if (r <= 0) return items[i]
    }
    return items[items.length - 1]
  }
}
