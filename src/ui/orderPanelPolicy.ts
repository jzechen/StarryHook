import type { LoopPhase } from '../core/types'

/**
 * 公告板面板开关策略(纯函数,票 #55;口径与商店 shopPanelAllowed 同一族):
 * 仅待机(idle)可开。蓄力/等待/咬钩/小游戏/结算(捕获、脱钩)期间禁用
 * ——垂钓进行中不开公告板;打开请求(公告板交互)与「已打开面板自动收起」
 * 都以此为准。打开时核心循环照常推进,与商店/储物箱同一套不打扰规则。
 */
export function orderPanelAllowed(phase: LoopPhase): boolean {
  return phase === 'idle'
}
