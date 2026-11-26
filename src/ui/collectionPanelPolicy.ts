import type { LoopPhase } from '../core/types'

/**
 * 图鉴面板开关策略(纯函数):哪些核心循环阶段允许打开 / 保持面板。
 * 待机、蓄力、等待阶段可开;咬钩、钓鱼小游戏、结算(捕获、脱钩)期间禁用——
 * 对抗与响应时刻不被面板遮挡与误触。入口置灰与"已打开面板自动收起"都以此为准。
 */
export function collectionPanelAllowed(phase: LoopPhase): boolean {
  return phase === 'idle' || phase === 'charging' || phase === 'waiting'
}
