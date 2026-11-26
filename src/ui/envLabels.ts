import type { Daylight, Season, Weather } from '../core/types'

/**
 * 环境标签单源(票 #d-world-review-fixes):季节/昼夜/天气的规范序与基础标签表,
 * 顶栏环境徽章与图鉴出没条件共用。此前两处各自维护标签表,易漂移——现基础字只在这里出现,
 * 各消费方自行派生展示文案:
 * - 徽章(envBadgeText)直用单字根字——顶栏 12px 像素字体,单字紧凑「春 · 日 · 晴」;
 * - 图鉴(collectionPanelHabitat)派生长文案——昼夜根字 +「间」(日间/夜间)、
 *   天气根字 +「天」(晴天/雨天),季节硬门单字连写按规范序(「仅春冬」)。
 * 维度取值新增时只改这里:Record 兜底,漏项编译期即报。
 */

/** 季节规范序(春夏秋冬):图鉴硬门连写与软修正段排序的单源 */
export const SEASON_ORDER: readonly Season[] = ['spring', 'summer', 'autumn', 'winter']

/** 昼夜规范序 */
export const DAYLIGHT_ORDER: readonly Daylight[] = ['day', 'night']

/** 天气规范序 */
export const WEATHER_ORDER: readonly Weather[] = ['sunny', 'rain']

/** 季节基础标签(单字根字,徽章与图鉴连写同字,无需派生) */
export const SEASON_ROOT: Record<Season, string> = {
  spring: '春',
  summer: '夏',
  autumn: '秋',
  winter: '冬',
}

/** 昼夜基础标签(单字根字):徽章直用;图鉴派生「日间/夜间」(根字 + 间) */
export const DAYLIGHT_ROOT: Record<Daylight, string> = {
  day: '日',
  night: '夜',
}

/** 天气基础标签(单字根字):徽章直用;图鉴派生「晴天/雨天」(根字 + 天) */
export const WEATHER_ROOT: Record<Weather, string> = {
  sunny: '晴',
  rain: '雨',
}
