import type { LoopPhase } from '../core/types'

/**
 * 商店入口策略(纯函数,票 #20):仅待机(idle)可开。
 * 蓄力/等待/咬钩/小游戏/结算(捕获、脱钩)期间禁用——垂钓进行中不开店,
 * 与换水域入口(waterSwitchAllowed)同规则;入口置灰与「已打开面板自动收起」
 * 都以此为准。打开时核心循环照常推进,与图鉴面板同一套不打扰规则。
 */
export function shopPanelAllowed(phase: LoopPhase): boolean {
  return phase === 'idle'
}
