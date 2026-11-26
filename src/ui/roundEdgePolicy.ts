import type { GameMode } from '../core/coreLoop'

/**
 * 限时局边沿快照(结构最小面,票 #24 review 去重):局进行中 + 当前模式。
 * CoreLoop 公开只读 getter(roundActive/mode)结构满足此形,调用点直接传核心即可。
 */
export interface RoundEdgeSnapshot {
  /** 限时局是否进行中 */
  roundActive: boolean
  /** 当前模式 */
  mode: GameMode
}

/**
 * 限时局毕边沿(纯函数,票 #24 review 去重):上一帧限时局进行中、本帧已结束、
 * 且模式仍为限时 = 归零强制结算恰好完成一次。此判定原先在组合根(main.ts 结算
 * 反馈)与模式面板(modePanel.ts 局毕自动回面板)各写一份,现抽单源两处消费。
 *
 * 模式只读本帧:切回无限同样会置否 roundActive,但 mode 已变且 setMode 已把
 * 定格分清零——那是玩家在面板里主动放弃,不算「一局结束」;上一帧的模式不参与
 * 判定(上一帧必然处于限时局中,不存在跨模式歧义),故入参只带上帧的局标志。
 */
export function roundJustEnded(prevRoundActive: boolean, curr: RoundEdgeSnapshot): boolean {
  return prevRoundActive && !curr.roundActive && curr.mode === 'timed'
}
