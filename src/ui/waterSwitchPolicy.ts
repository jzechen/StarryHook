import type { LoopPhase } from '../core/types'

/**
 * 换水域入口策略(纯函数,票 #15):仅待机(idle)可开。
 * 蓄力/等待/咬钩/小游戏/结算(捕获、脱钩)期间禁用——垂钓进行中换水有误操作
 * 丢竿的风险;入口置灰与「已打开面板自动收起」都以此为准。
 * 与核心层 setWater(仅 idle 接受)同刻双保险:UI 挡误触,核心挡漏网。
 */
export function waterSwitchAllowed(phase: LoopPhase): boolean {
  return phase === 'idle'
}
