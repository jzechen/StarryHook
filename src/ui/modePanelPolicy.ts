import type { LoopPhase } from '../core/types'

/**
 * 模式入口策略(纯函数,票 #24):仅待机(idle)可开。
 * 蓄力/等待/咬钩/小游戏/结算(捕获、脱钩)期间禁用——垂钓进行中切模式有误触
 * 丢竿的风险,与商店(shopPanelAllowed)同规则;
 * 入口置灰与「已打开面板自动收起」都以此为准。
 * 与核心层 setMode(仅 idle 接受)同刻双保险:UI 挡误触,核心挡漏网。
 */
export function modePanelAllowed(phase: LoopPhase): boolean {
  return phase === 'idle'
}
