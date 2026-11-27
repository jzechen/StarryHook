/**
 * 行走脚步步频(纯函数,票 #44):移动中按步距逐次触发脚步声,停止即停。
 * 「是否在移动」的地面真值 = 本帧实际位移(世界像素)——被墙挡住/垂钓锁移动/
 * 过场锁定时位移 ≈ 0,视同静止;输入意图(按着方向键)不作为触发依据。
 *
 * 步距与行走动画对齐:步幅单源 = characterMotion 的 WALK_STRIDE_PX(9.8px =
 * 70px/s × 0.14s),4 帧行走周期 0.56s,每半周期落一脚 = 0.28s(左右脚节奏)。
 * FOOTSTEP_INTERVAL_S = 0.28 是 70px/s(TUNE.move.speed)下 2×步幅(0.14s × 2)
 * 的调定值——改移速需重调本值,否则脚步声与行走脚步帧错相。
 */

/** 步距(秒):两次脚步声的间隔(70px/s 下 2×步幅,见上) */
export const FOOTSTEP_INTERVAL_S = 0.28

/** 判定「在移动」的每帧最小位移(像素;与 coreLoop/worldScene 的 MOVE_EPS 同阈) */
const STEP_MOVE_EPS = 0.1

/** 一步钟推进结果:accum = 下一步相位;fire = 本帧是否落一脚 */
export interface StepClockResult {
  accum: number
  fire: boolean
}

/**
 * 推进一步钟:accum + dt(仅移动中),跨过步距即触发一次并保留余量
 * (余量制在变帧率下步频稳定);静止/掉帧大步长都至多一响(不补响)。
 */
export function advanceStepClock(accum: number, dt: number, moveDelta: number, interval = FOOTSTEP_INTERVAL_S): StepClockResult {
  if (!(moveDelta > STEP_MOVE_EPS)) return { accum: 0, fire: false }
  const next = accum + dt
  if (next < interval) return { accum: next, fire: false }
  return { accum: next % interval, fire: true }
}
