import type { GameMode } from '../core/coreLoop'

/**
 * 限时局倒计时快照(结构最小面,roundEdgePolicy 的 RoundEdgeSnapshot 同款纪律):
 * CoreLoop 公开只读 getter(mode/roundActive/timeRemaining)结构满足此形,
 * 调用点直接传核心即可,测试用字面量顶替。
 */
export interface CountdownSnapshot {
  /** 当前模式 */
  mode: GameMode
  /** 限时局是否进行中(归零强制结算后置否) */
  roundActive: boolean
  /** 限时剩余秒数(非限时恒 0) */
  timeRemaining: number
}

/** 倒计时 tick 的窗口:剩余 ≤ 该秒数时进入每秒一响(票面「最后 10 秒」) */
export const COUNTDOWN_TICK_SECONDS = 10

/**
 * 限时局倒计时 tick(纯函数,票 #44):上一帧剩余 → 本帧剩余向下跨整秒边沿
 * 且本帧仍在最后 10 秒内 = 本帧响一次。判定单源,组合根每帧调用:
 *
 * - 只看向下穿越(Math.ceil 递减):时间不倒流、同秒内推进都不响;
 * - 归零帧(timeRemaining = 0,强制结算完成)不响——「归零不新增音效」,
 *   结算反馈由既有捕获/脱钩音与结算文案承担;
 * - 单帧大跳(掉帧)跨多个整秒也至多一响:tick 是提示不是音符,不补响。
 *
 * 剩余恰为 10.0 属「宣布 10 秒」,算最后 10 秒的第一响(<= 判定)。
 */
export function countdownTick(prevRemaining: number, curr: CountdownSnapshot): boolean {
  if (curr.mode !== 'timed' || !curr.roundActive) return false
  const next = curr.timeRemaining
  if (next <= 0 || next > COUNTDOWN_TICK_SECONDS) return false
  return Math.ceil(prevRemaining) > Math.ceil(next)
}
