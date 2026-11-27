import type { EnvState } from '../core/types'
import { DAYLIGHT_ROOT, SEASON_ROOT, WEATHER_ROOT } from './envLabels'

/**
 * 环境徽章文案(纯函数,票 #15):核心环境状态 → 顶栏「春 · 日 · 晴」。
 * 标签依 GLOSSARY 世界与环境用语,单字紧凑(顶栏 12px 像素字体):
 * 季节 春/夏/秋/冬、昼夜 日/夜、天气 晴/雨;水域不进徽章(换水域面板已随票 #36 退役)。
 * 标签字面取自环境标签单源(envLabels):徽章直用单字根字,不另维护表。
 */

/** 环境状态 → 顶栏徽章文案;Hud 以输出串做「内容变化才重写」的判等键 */
export function envBadgeText(env: EnvState): string {
  return `${SEASON_ROOT[env.season]} · ${DAYLIGHT_ROOT[env.daylight]} · ${WEATHER_ROOT[env.weather]}`
}
