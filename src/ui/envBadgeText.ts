import type { EnvState } from '../core/types'

/**
 * 环境徽章文案(纯函数,票 #15):核心环境状态 → 顶栏「春 · 日 · 晴」。
 * 标签依 GLOSSARY 世界与环境用语,单字紧凑(顶栏 12px 像素字体):
 * 季节 春/夏/秋/冬、昼夜 日/夜、天气 晴/雨;水域不进徽章——换水域面板可见。
 */

/** 季节标签(Record 兜底:季节全集新增时编译期即报缺项) */
const SEASON_LABELS: Record<EnvState['season'], string> = {
  spring: '春',
  summer: '夏',
  autumn: '秋',
  winter: '冬',
}

/** 昼夜标签 */
const DAYLIGHT_LABELS: Record<EnvState['daylight'], string> = {
  day: '日',
  night: '夜',
}

/** 天气标签 */
const WEATHER_LABELS: Record<EnvState['weather'], string> = {
  sunny: '晴',
  rain: '雨',
}

/** 环境状态 → 顶栏徽章文案;Hud 以输出串做「内容变化才重写」的判等键 */
export function envBadgeText(env: EnvState): string {
  return `${SEASON_LABELS[env.season]} · ${DAYLIGHT_LABELS[env.daylight]} · ${WEATHER_LABELS[env.weather]}`
}
