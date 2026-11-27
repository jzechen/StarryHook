import type { LoopPhase } from '../core/types'

/**
 * 背包面板开关策略(纯函数,票 #40;口径与图鉴 collectionPanelAllowed 同一族):
 * 待机、蓄力、等待阶段可开——背包是只读总览,等鱼间隙翻包不打扰垂钓;
 * 咬钩、钓鱼小游戏、结算(捕获、脱钩)期间禁用——对抗与响应时刻不被面板
 * 遮挡与误触。入口置灰与「已打开面板自动收起」都以此为准。
 */
export function backpackPanelAllowed(phase: LoopPhase): boolean {
  return phase === 'idle' || phase === 'charging' || phase === 'waiting'
}
