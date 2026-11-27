import type { LoopPhase } from '../core/types'

/**
 * 储物箱面板开关策略(纯函数,票 #40;口径与商店 shopPanelAllowed 同一族):
 * 仅待机(idle)可开。蓄力/等待/咬钩/小游戏/结算(捕获、脱钩)期间禁用
 * ——垂钓进行中不开箱;打开请求(储物箱交互)与「已打开面板自动收起」都
 * 以此为准。打开时核心循环照常推进,与图鉴面板同一套不打扰规则。
 */
export function storagePanelAllowed(phase: LoopPhase): boolean {
  return phase === 'idle'
}
