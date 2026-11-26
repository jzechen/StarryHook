import type { Daylight, FishHabitat, Season, WaterAreaId, Weather } from '../core/types'
import { WATER_AREAS, waterAreaOf } from '../core/waterAreas'
import {
  DAYLIGHT_ORDER,
  DAYLIGHT_ROOT,
  SEASON_ORDER,
  SEASON_ROOT,
  WEATHER_ORDER,
  WEATHER_ROOT,
} from './envLabels'

/**
 * 图鉴条目「出没条件」文案派生(纯函数,依 GLOSSARY「出没条件」)。
 * 由鱼的亲和字段(FishHabitat,数据先例见 src/core/fishCatalog.ts)派生人话文案,
 * 供图鉴条目小字次行展示——玩家据此规划去哪钓没收集的鱼(spec #13 用户故事 9)。
 *
 * 入参只吃亲和字段:类型上就不含名称/配色,结构上保证文案不泄剪影之外的信息;
 * 已捕获/未捕获行共用同一文案(只泄「去哪钓」,不泄「长什么样」)。
 *
 * 文案规则(各维度显示/隐藏判定,详见各 segment 函数):
 * - 水域必显;季节/昼夜仅当该维度有硬门或修正才显示;天气仅当有 weatherMul 区分才显示;
 * - 同维度硬门优先于软修正:有硬门只显「仅…」,软倍率不再展开(门已决定何时可得);
 * - 软修正显示增益值(mul > 1)「…加成」;无增益只有减益(mul < 1)时「…较少」;
 * - 全维度都无修饰 → 汇总文案「任何时间 · 任何水域」;否则按 水域 · 季节 · 昼夜 · 天气
 *   以「 · 」连接(与顶栏环境徽章「春 · 日 · 晴」同构,spec #13)。
 */

/** 水域规范序(池塘/河流/湖)= 水域注册表声明序;水域名亦以注册表为单源(只读) */
const AREA_ORDER: readonly WaterAreaId[] = WATER_AREAS.map(a => a.id)

/** 季节显示名 = 单字根字(与徽章「春」同源同字,连写「仅春冬」「春秋季加成」) */
const SEASON_LABELS: Record<Season, string> = SEASON_ROOT

/** 昼夜/天气长文案在单源根字上派生:根字 +「间」/「天」(GLOSSARY 术语白天/夜晚,显示从徽章根字) */
const DAYLIGHT_LABELS: Record<Daylight, string> = {
  day: `${DAYLIGHT_ROOT.day}间`,
  night: `${DAYLIGHT_ROOT.night}间`,
}
const WEATHER_LABELS: Record<Weather, string> = {
  sunny: `${WEATHER_ROOT.sunny}天`,
  rain: `${WEATHER_ROOT.rain}天`,
}

/** 按规范序重排声明的取值(确定性:不依赖目录书写顺序) */
function canonicalOf<K>(order: readonly K[], declared: readonly K[]): K[] {
  return order.filter(v => declared.includes(v))
}

/** 水域段:声明 areas 且为真子集 → 按规范序「/」连接;未声明/覆盖全部/空(防御)→「任何水域」 */
function waterSegment(habitat: FishHabitat): string {
  const declared = habitat.areas
  if (!declared || declared.length === 0 || declared.length >= AREA_ORDER.length) {
    return '任何水域'
  }
  return AREA_ORDER.filter(id => declared.includes(id))
    .map(id => waterAreaOf(id).name)
    .join('/')
}

/**
 * 软修正段(季节/昼夜/天气共用):只看倍率 ≠ 1 的项;
 * 有增益(mul > 1)→「<增益值><增益后缀>」;只有减益(mul < 1)→「<减益值><减益后缀>」。
 * 倍率全为 1 或未声明 → null(该维度无修饰,不显示)。
 */
function softSegment<K extends string>(
  order: readonly K[],
  mul: Partial<Record<K, number>> | undefined,
  labels: Record<K, string>,
  joiner: string,
  gainSuffix: string,
  lossSuffix: string,
): string | null {
  if (!mul) return null
  const changed = order.filter(k => mul[k] !== undefined && mul[k] !== 1)
  if (changed.length === 0) return null
  const gains = changed.filter(k => (mul[k] as number) > 1)
  const values = canonicalOf(order, gains.length > 0 ? gains : changed.filter(k => (mul[k] as number) < 1))
    .map(k => labels[k])
  return values.join(joiner) + (gains.length > 0 ? gainSuffix : lossSuffix)
}

/**
 * 季节段:硬门(seasons 真子集)→「仅」+ 单字季连写(「仅春冬」);
 * 否则看 seasonMul(增益「秋季加成」,纯减益「夏季较少」);均无 → null。
 */
function seasonSegment(habitat: FishHabitat): string | null {
  const gate = habitat.seasons
  if (gate && gate.length > 0 && gate.length < SEASON_ORDER.length) {
    return '仅' + canonicalOf(SEASON_ORDER, gate).map(s => SEASON_LABELS[s]).join('')
  }
  return softSegment(SEASON_ORDER, habitat.seasonMul, SEASON_LABELS, '', '季加成', '季较少')
}

/**
 * 昼夜段:硬门(daylight 真子集)→「仅夜间」;否则看 daylightMul(「夜间加成」);均无 → null。
 * 双字值用「、」连接(合成数据才会出现多值增益;覆盖两值 = 不设限,不显示)。
 */
function daylightSegment(habitat: FishHabitat): string | null {
  const gate = habitat.daylight
  if (gate && gate.length > 0 && gate.length < DAYLIGHT_ORDER.length) {
    return '仅' + canonicalOf(DAYLIGHT_ORDER, gate).map(d => DAYLIGHT_LABELS[d]).join('、')
  }
  return softSegment(DAYLIGHT_ORDER, habitat.daylightMul, DAYLIGHT_LABELS, '、', '加成', '较少')
}

/** 天气段:无硬门域,仅看 weatherMul(「雨天加成」);无区分 → null */
function weatherSegment(habitat: FishHabitat): string | null {
  return softSegment(WEATHER_ORDER, habitat.weatherMul, WEATHER_LABELS, '、', '加成', '较少')
}

export function habitatLabel(habitat: FishHabitat | undefined): string {
  if (!habitat) return '任何时间 · 任何水域'
  const segments = [
    waterSegment(habitat),
    seasonSegment(habitat),
    daylightSegment(habitat),
    weatherSegment(habitat),
  ]
  // 水域不限且其余维度全无修饰 → 汇总文案(小白条类万金油鱼)
  const [, season, daylight, weather] = segments
  if (segments[0] === '任何水域' && season === null && daylight === null && weather === null) {
    return '任何时间 · 任何水域'
  }
  return segments.filter(s => s !== null).join(' · ')
}
