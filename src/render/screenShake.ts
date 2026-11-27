import type { LoopPhase } from '../core/types'

/**
 * 咬钩屏幕 shake(票 #43,spec §5.2):现有浮标下沉(biteDip)+ 30Hz 摆动之上的
 * 短促屏幕级抖动。实现位 = 相机偏移(像素取整,渲染层把偏移加到世界/覆盖 UI
 * 两容器的平移上,ADR-0002 整数平移纪律不破)。
 *
 * 强度口径:克制(幅度 ≤3 逻辑像素)、单次 <1s;触发点仅咬钩/捕获两处
 * (spec 唯二屏幕级反馈)——策略由 shakeTrigger 纯函数钉死,渲染层只消费。
 */

/** shake 档位:咬钩(短促提示)与捕获(结算确认) */
export type ShakeKind = 'bite' | 'catch'

export interface ShakeSpec {
  /** 单次时长(秒;<1s 口径) */
  duration: number
  /** 峰值幅度(逻辑像素;整数偏移的界) */
  amplitude: number
}

/** 咬钩:提示性抖一下,比捕获更短更轻(响应窗口只有 0.45–0.85s,不能糊住「!」) */
export const BITE_SHAKE: ShakeSpec = { duration: 0.22, amplitude: 2 }
/** 捕获:结算瞬间的落实感,略重略长(仍远小于结算停留 1.1s) */
export const CATCH_SHAKE: ShakeSpec = { duration: 0.32, amplitude: 3 }

/** 换向步长(秒):约 25Hz 换向,叠加线性衰减读作「短促抖动」而非持续震动 */
const SHAKE_STEP = 0.04

/** 确定性伪随机 ∈ [0,1):同入参同输出(可测);整型哈希走正弦混叠 */
function hash01(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}

/**
 * shake 触发策略(纯函数):相位转移 → shake 档位;仅「进入 bite」与
 * 「进入 caught」两边沿给档,其余转移(收竿/脱钩/回待机/过场)一律 null。
 * 渲染层在相位边沿消费本函数,触发点因此不可能超出 spec 两处。
 */
export function shakeTrigger(prev: LoopPhase, next: LoopPhase): ShakeKind | null {
  if (prev === next) return null
  if (next === 'bite') return 'bite'
  if (next === 'caught') return 'catch'
  return null
}

/** 寿命内某时刻的偏移(纯函数):幅度线性衰减,方向按步长换向,整数像素 */
export function shakeOffset(kind: ShakeKind, elapsed: number): { x: number; y: number } {
  const spec = kind === 'bite' ? BITE_SHAKE : CATCH_SHAKE
  if (elapsed < 0 || elapsed >= spec.duration) return { x: 0, y: 0 }
  const decay = 1 - elapsed / spec.duration
  const step = Math.floor(elapsed / SHAKE_STEP)
  return {
    x: Math.round((hash01(step * 2 + 1) * 2 - 1) * spec.amplitude * decay),
    y: Math.round((hash01(step * 2 + 2) * 2 - 1) * spec.amplitude * decay),
  }
}

const ZERO = { x: 0, y: 0 } as const

/**
 * shake 状态壳:trigger 置档并归零计时,update 推进并产出本帧整数偏移;
 * 寿命尽自动停。演出中再触发 = 重新计时(bite 未平息即捕获时,捕获档完整播放)。
 */
export class ScreenShake {
  private kind: ShakeKind | null = null
  private elapsed = 0

  get active(): boolean {
    return this.kind !== null
  }

  trigger(kind: ShakeKind): void {
    this.kind = kind
    this.elapsed = 0
  }

  update(dt: number): { x: number; y: number } {
    if (!this.kind) return ZERO
    this.elapsed += dt
    const kind = this.kind
    if (this.elapsed >= (kind === 'bite' ? BITE_SHAKE.duration : CATCH_SHAKE.duration)) {
      this.kind = null
      return ZERO
    }
    return shakeOffset(kind, this.elapsed)
  }
}
