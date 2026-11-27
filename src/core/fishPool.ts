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
 * - 蓄力偏向难鱼的乘子(现行 cast 公式 1 + power × poolBias × difficulty)并入引擎;
 * - 浓饵修正(票 #21):richBait 为 true 时难鱼权重提升——与蓄力乘子同形的线性难度
 *   倍率 1 + TUNE.richBaitBias × difficulty(难度 1 ×1.2、难度 5 ×2.0,恒 > 1 永不归零),
 *   不越硬门(被门挡住的鱼不复活);缺省 false = 现行权重逐位一致。
 * - 钓位微差(票 #38,spec §3):spotMul = {鱼id: 倍率} 的 per-fish 倍率表,乘在
 *   基底权重上、硬门判定之前的基底段——不在基底鱼池的鱼仍归零(不引新鱼种),
 *   被硬门挡住的鱼不复活(不越硬门);倍率 ≥ 1 只增不减(解析期校验),
 *   缺省(无表/该鱼无键)= ×1,现行权重逐位一致。
 */
export function computePoolWeights(
  fishes: readonly FishDef[],
  basePool: Readonly<Record<string, number>>,
  env: EnvState,
  power: number,
  /** 浓饵生效标记(票 #21):组合根在抛竿时刻产出;缺省 false = 现行权重 */
  richBait = false,
  /** 钓位微差倍率表(票 #38):抛竿时刻按当前钓位读入;缺省无修饰 = 现行权重 */
  spotMul?: Readonly<Record<string, number>>,
): number[] {
  return fishes.map(fish => {
    // 钓位微差乘子:乘在基底段(×1 缺省不改变任何乘积的浮点位)
    const base = (basePool[fish.id] ?? 0) * (spotMul?.[fish.id] ?? 1)
    if (base <= 0) return 0 // 不在基底鱼池:进不来(钓位倍率不引新鱼种)
    const habitat = fish.habitat
    // 硬门:声明的亲和集合不含当前环境值 → 归零
    if (habitat?.areas && !habitat.areas.includes(env.area)) return 0
    if (habitat?.seasons && !habitat.seasons.includes(env.season)) return 0
    if (habitat?.daylight && !habitat.daylight.includes(env.daylight)) return 0
    if (habitat?.weather && !habitat.weather.includes(env.weather)) return 0 // 票 #53:天气门(雾影鲈/霜枪狗鱼首用)
    // 软修正:各维倍率连乘(缺省 1,永不归零)
    const seasonMul = habitat?.seasonMul?.[env.season] ?? 1
    const daylightMul = habitat?.daylightMul?.[env.daylight] ?? 1
    const weatherMul = habitat?.weatherMul?.[env.weather] ?? 1
    // 蓄力乘子:越有力越偏向行为更难(更活泼)的鱼(现行公式并入)
    const chargeMul = 1 + power * TUNE.poolBias * fish.difficulty
    // 浓饵乘子:难度越高提升越大,恒 > 1(易鱼只增不减,任何可达鱼不归零)
    const richMul = richBait ? 1 + TUNE.richBaitBias * fish.difficulty : 1
    return base * seasonMul * daylightMul * weatherMul * chargeMul * richMul
  })
}
