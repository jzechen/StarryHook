import { TUNE } from '../config'
import { Rng, deriveSeed } from './rng'
import type { FishQuality } from './types'

/**
 * 渔获品质(票 #39,spec §4.2):普通/银星/金星三档。
 * 捕获时刻 roll(结算沿),走独立派生种子的 Rng(沿 sessionWeather 先例,
 * 主随机序列一个 draw 都不动);概率受蓄力力度驱动(基础表在 TUNE.quality);
 * 卖价 = 鱼分值 × 品质倍率。纯函数,不持有状态——品质 Rng 由调用方持有。
 */

/** 品质遍历序:背包/卖鱼列表的堆叠序(普通在前,星标在后) */
export const QUALITIES: readonly FishQuality[] = ['normal', 'silver', 'gold']

/**
 * 品质概率(蓄力驱动):银/金星概率 = 基础概率 + 蓄力 × 加成,普通 = 余量。
 * 蓄力越高银/金星概率越高(线性,无上限钳制——TUNE 表内组合恒 ≤ 1)。
 */
export function qualityOdds(power: number): Readonly<Record<FishQuality, number>> {
  const gold = TUNE.quality.goldBase + power * TUNE.quality.goldChargeBonus
  const silver = TUNE.quality.silverBase + power * TUNE.quality.silverChargeBonus
  return { normal: 1 - gold - silver, silver, gold }
}

/**
 * 品质 roll:对传入 Rng 抽一签,按(金星, 银星)先到先得切分 [0,1) 区间。
 * 调用方须喂独立派生种子的 Rng(sessionQualityRng),不动主随机序列。
 */
export function rollQuality(rng: Rng, power: number): FishQuality {
  const odds = qualityOdds(power)
  const r = rng.float()
  if (r < odds.gold) return 'gold'
  if (r < odds.gold + odds.silver) return 'silver'
  return 'normal'
}

/** 卖价 = 鱼分值 × 品质倍率(四舍五入到整数金币;普通 = 原分值) */
export function sellPriceFor(score: number, quality: FishQuality): number {
  return Math.round(score * TUNE.quality.sellMul[quality])
}

/** 品质旁路的派生盐:主种子经派生后喂独立 Rng,与主随机序列完全解耦(沿天气先例) */
export const QUALITY_SEED_SALT = 0x2b7e5a11

/**
 * 品质会话 Rng:会话开始由主种子派生一次,此后每次捕获在结算沿抽一签。
 * 同主种子 → 同品质序列(?seed 可复现);主序列抽取次数不增不减。
 */
export function sessionQualityRng(mainSeed: number): Rng {
  return new Rng(deriveSeed(mainSeed, QUALITY_SEED_SALT))
}
