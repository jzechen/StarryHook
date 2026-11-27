import type { Facing } from '../core/types'

/**
 * 人物程序化细节(票 #49,零新角色帧):行走相位 / bob 曲线 / 待机呼吸 /
 * 持竿朝向与抛竿前倾 / 脚下影子几何的纯函数单源。
 *
 * 全部「可测部分」在此;worldScene 只做贴图与精灵的应用(接线由
 * worldScene.test 的场景树测试钉住)。曲线一律输出**整数像素**偏移
 * (480×270 逻辑分辨率,亚像素偏移会读作抖动)。
 */

/** 判定「在移动」的每帧最小位移(逻辑像素;与 coreLoop/worldScene 的 MOVE_EPS 同阈) */
const MOVE_EPS = 0.1

/**
 * 每帧行走位移(像素)= 70px/s × 0.14s。
 *
 * 步频帧时序对齐移速的单源:行走相位按实际位移除以本步幅推进,70px/s
 * (TUNE.move.speed,票 #34)下帧周期恰为 0.14s(沿 pondScene 观感),
 * 一个 4 帧周期 = 0.56s——与脚步声步距(0.28s 半周期,票 #44)保持同相。
 * 移速再调时步频自动跟随,不另设可漂移的帧周期常数。
 */
export const WALK_STRIDE_PX = 9.8

/** 行走 bob 最大抬升(像素):1–2px 观感档 */
export const WALK_BOB_PX = 2

/**
 * 推进行走相位:按本帧实际位移(世界像素)换算步数;静止(≤ MOVE_EPS,
 * 被墙挡住/垂钓锁移动/过场锁定都位移 ≈ 0)归零回待机相位。
 */
export function advanceWalkPhase(phase: number, movedPx: number): number {
  if (!(movedPx > MOVE_EPS)) return 0
  return phase + movedPx / WALK_STRIDE_PX
}

/**
 * 行走 bob 竖直偏移(负 = 向上抬):相位每 2 步(4 帧周期的一半)一轮,
 * 着地帧(整数相位)回 0、步中抬到 -WALK_BOB_PX——与脚步声半周期同相,
 * 落脚踩地时人物最低、跨步时最高。
 */
export function walkBobOffset(phase: number): number {
  const step = phase % 2
  const lift = Math.round(Math.abs(Math.sin(Math.PI * step)) * WALK_BOB_PX)
  return lift === 0 ? 0 : -lift
}

/** 待机呼吸与持竿姿态的位姿(渲染层直接应用到角色精灵) */
export interface CharacterPose {
  /** 竖直偏移(整数像素,负 = 上抬) */
  dy: number
  /** 纵向缩放(锚在脚底,呼吸时头部微抬) */
  scaleY: number
  /** 旋转(弧度,绕脚底锚点;0 = 立直) */
  rotation: number
}

/**
 * 待机呼吸(帧 0 两态微循环):1.6s 一轮,半周期切态——放松(基线)与
 * 吸气(头部微抬 1px + 纵向微伸 6%),余弦缓动避免硬跳。
 */
export const BREATH_PERIOD_S = 1.6

export function breathPose(t: number): CharacterPose {
  const s = 0.5 - 0.5 * Math.cos((t / BREATH_PERIOD_S) * Math.PI * 2)
  const lift = Math.round(s)
  return { dy: lift === 0 ? 0 : -lift, scaleY: 1 + s * 0.06, rotation: 0 }
}

/**
 * 朝向 4 向量化:位移向量 → Facing(水平主轴优先;恰好 45° 取竖直)。
 * 持竿「朝水」即由「人物 → 水面瞄准点」的向量经此量化。
 */
export function facingToward(dx: number, dy: number): Facing {
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left'
  return dy > 0 ? 'down' : 'up'
}

/** 抛竿前倾峰值(弧度,约 7°):小幅,读作发力而非摔倒 */
export const CAST_LEAN_RAD = 0.12

/**
 * 抛竿前倾(castT 0..1 为抛竿飞行动画进度,与浮标飞行同源):
 * 中段前倾、两端回正——横向上 rotation 随朝向取号,竖向上以前倾读作
 * 重心前压(1px 下沉)。castT ≥ 1(已落水)完全恢复立直。
 */
export function castLeanPose(castT: number, facing: Facing): CharacterPose {
  const c = Math.min(1, Math.max(0, castT))
  const lean = c >= 1 ? 0 : Math.sin(Math.PI * c)
  if (facing === 'left') return { dy: 0, scaleY: 1, rotation: -lean * CAST_LEAN_RAD }
  if (facing === 'right') return { dy: 0, scaleY: 1, rotation: lean * CAST_LEAN_RAD }
  return { dy: Math.round(lean), scaleY: 1, rotation: 0 }
}

/** 影子几何(随抬升微缩淡;位置由渲染层钉在地面线) */
export interface ShadowPose {
  /** 半宽/半高(像素) */
  rx: number
  ry: number
  alpha: number
}

/** 影子基准几何(半宽 5 ≈ 肩宽一半,半高 2 = 贴地椭圆) */
export const SHADOW_REST = { rx: 5, ry: 2, alpha: 0.3 } as const

/**
 * 脚下影子随 bob 的几何:抬升 0..2px(离地最高点)时宽 -1.5、高 -0.5、
 * 透明度 -0.08——影子贴地不动,人抬起时影子读作略远略淡;越界钳制。
 */
export function shadowPose(liftPx: number): ShadowPose {
  const s = Math.min(1, Math.max(0, liftPx / WALK_BOB_PX))
  return {
    rx: SHADOW_REST.rx - 1.5 * s,
    ry: SHADOW_REST.ry - 0.5 * s,
    alpha: SHADOW_REST.alpha - 0.08 * s,
  }
}
