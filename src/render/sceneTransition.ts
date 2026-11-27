import type { WarpZone } from '../world/warps'

/**
 * 过场状态机(票 #35,spec §1.4):走到出口 → 淡黑约 300ms → 对侧入口出现,
 * 朝向保持行进方向;过场中输入锁定、不写存档。
 *
 * 归属(票面口径):过场在组合根/渲染层实现,核心循环不感知——本模块是纯
 * 状态机(不 import PixiJS / 地图解析,只消费出口几何);Pixi 遮罩与换图落位
 * 由 worldDirector 持有。时序契约:
 * - fading-out:alpha 线性升到 1,走满报告一次 'switch' → 组合根此刻换图、
 *   落位对侧入口(朝向不动),随后进入 fading-in;
 * - fading-in:alpha 线性降回 0,走满报告一次 'arrived' → 解锁输入、可再触发;
 * - 一次 update 至多跨过一个相位边沿(大帧不吞状态)。
 */

/** 淡出/淡入时长(秒;票面「约 300ms」) */
export const WARP_FADE_SECONDS = 0.3

export type TransitionPhase = 'idle' | 'fading-out' | 'fading-in'

/** 一帧动作:组合根据此换图('switch')/恢复常态('arrived') */
export type TransitionAction = 'none' | 'switch' | 'arrived'

export class SceneTransition {
  phase: TransitionPhase = 'idle'
  /** 遮罩不透明度 0..1(渲染层每帧直接消费) */
  alpha = 0
  private pendingWarp: WarpZone | null = null
  private t = 0

  /** 过场进行中 = 输入锁定 + 不写存档(组合根唯一判定口) */
  get locked(): boolean {
    return this.phase !== 'idle'
  }

  /** 正在前往的出口(过场中非 null;仅供渲染/调试,组合根换图时消费一次) */
  get warp(): WarpZone | null {
    return this.pendingWarp
  }

  /** 触发过场:开始淡出。过场进行中忽略(不会中途改目标) */
  begin(warp: WarpZone): void {
    if (this.phase !== 'idle') return
    this.pendingWarp = warp
    this.phase = 'fading-out'
    this.t = 0
    this.alpha = 0
  }

  /** 每帧推进;返回本帧动作(见时序契约) */
  update(dt: number): TransitionAction {
    if (this.phase === 'idle') return 'none'
    this.t += dt
    if (this.phase === 'fading-out') {
      this.alpha = Math.min(1, this.t / WARP_FADE_SECONDS)
      if (this.t >= WARP_FADE_SECONDS) {
        this.phase = 'fading-in'
        this.t = 0
        return 'switch'
      }
      return 'none'
    }
    this.alpha = Math.max(0, 1 - this.t / WARP_FADE_SECONDS)
    if (this.t >= WARP_FADE_SECONDS) {
      this.phase = 'idle'
      this.alpha = 0
      this.pendingWarp = null
      return 'arrived'
    }
    return 'none'
  }
}
