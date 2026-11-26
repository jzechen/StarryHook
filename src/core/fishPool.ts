import { TUNE } from '../config'
import type { EnvState, FishDef } from './types'

/**
 * 出鱼权重修正引擎(纯函数,世界系统的唯一新逻辑接缝)。
 *
 * 输入 = 水域基底鱼池(鱼 id → 基底权重)× 环境状态(季节/昼夜/天气/水域)× 蓄力力度;
 * 输出 = 与传入鱼目录逐位对齐的权重表(供既有 rng.pick 消费)。
 *
 * 修正模型:
 * - 硬门(0/1):鱼的亲和水域/季节/昼夜不含当前值 → 权重归零;
 * - 软修正(不归零):季节/昼夜/天气倍率与蓄力乘子连乘(乘法交换,与次序无关);
 * - 蓄力偏向难鱼的乘子(现行 cast 公式 1 + power × poolBias × difficulty)并入引擎。
 */
export function computePoolWeights(
  fishes: readonly FishDef[],
  basePool: Readonly<Record<string, number>>,
  env: EnvState,
  power: number,
): number[] {
  return fishes.map(fish => {
    const base = basePool[fish.id] ?? 0
    if (base <= 0) return 0 // 不在基底鱼池:进不来
    const habitat = fish.habitat
    // 硬门:声明的亲和集合不含当前环境值 → 归零
    if (habitat?.areas && !habitat.areas.includes(env.area)) return 0
    if (habitat?.seasons && !habitat.seasons.includes(env.season)) return 0
    if (habitat?.daylight && !habitat.daylight.includes(env.daylight)) return 0
    // 软修正:各维倍率连乘(缺省 1,永不归零)
    const seasonMul = habitat?.seasonMul?.[env.season] ?? 1
    const daylightMul = habitat?.daylightMul?.[env.daylight] ?? 1
    const weatherMul = habitat?.weatherMul?.[env.weather] ?? 1
    // 蓄力乘子:越有力越偏向行为更难(更活泼)的鱼(现行公式并入)
    const chargeMul = 1 + power * TUNE.poolBias * fish.difficulty
    return base * seasonMul * daylightMul * weatherMul * chargeMul
  })
}
