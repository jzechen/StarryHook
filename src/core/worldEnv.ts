import { TUNE } from '../config'
import { Rng, deriveSeed } from './rng'
import type { Weather } from './types'

/**
 * 环境状态源:季节/昼夜从注入的时钟(真实时间)派生,天气由独立种子 Rng 抽样。
 * 纯函数,不持有状态——时钟由调用方(核心循环)注入,便于测试固定环境。
 */

/**
 * 季节 = 真实月份(气象季节):3–5 月春、6–8 月夏、9–11 月秋、12/1/2 月冬。
 */
export function seasonOf(date: Date): 'spring' | 'summer' | 'autumn' | 'winter' {
  const month = date.getMonth() + 1
  if (month >= 3 && month <= 5) return 'spring'
  if (month >= 6 && month <= 8) return 'summer'
  if (month >= 9 && month <= 11) return 'autumn'
  return 'winter'
}

/** 昼夜 = 真实小时:6:00–17:59 白天,其余(18:00–5:59)夜晚。 */
export function daylightOf(date: Date): 'day' | 'night' {
  const hour = date.getHours()
  return hour >= 6 && hour < 18 ? 'day' : 'night'
}

/**
 * 会话天气:对传入 Rng 抽样一次定整个会话——调用方须喂独立派生种子的 Rng
 * (不动主随机序列),会话内恒定由调用方持有结果保证。
 */
export function sampleWeather(rng: Rng): Weather {
  return rng.float() < TUNE.world.rainChance ? 'rain' : 'sunny'
}

/** 天气会话的派生盐:主种子经派生后喂独立 Rng,与主随机序列完全解耦 */
const WEATHER_SEED_SALT = 0x51ab3e7d

/**
 * 会话天气:由主种子派生独立 Rng 抽样一次(不动主随机序列,既有固定种子
 * 测试的抽取序列逐位不变);同主种子 → 同天气(?seed 可复现)。
 */
export function sessionWeather(mainSeed: number): Weather {
  return sampleWeather(new Rng(deriveSeed(mainSeed, WEATHER_SEED_SALT)))
}
