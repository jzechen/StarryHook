import { describe, expect, it } from 'vitest'
import {
  advanceWalkPhase,
  breathPose,
  castLeanPose,
  facingToward,
  shadowPose,
  walkBobOffset,
} from './characterMotion'

/**
 * 人物程序化细节(票 #49):纯函数规格。
 *
 * 步频对齐:行走相位按**实际位移**推进(像素驱动),帧时序 = 步幅/移速——
 * 70px/s(TUNE.move.speed,票 #34)下每帧恰好 9.8px = 70 × 0.14(沿 pondScene
 * 帧周期观感),移速再调时步频自动跟随,不再有独立常数可漂移。
 * bob 曲线:一个步周期(相位 0..2,两帧)内,着地帧(整数相位)回 0、
 * 步中(半步相位)抬到最高——起伏与落脚步声(0.28s 半周期,票 #44)同相。
 */
describe('行走相位与 bob(票 #49,spec:步频帧时序对齐 70px/s)', () => {
  it('相位按实际位移推进:70px/s 走 0.14s(9.8px)恰推进一帧相位', () => {
    expect(advanceWalkPhase(0, 9.8)).toBeCloseTo(1, 10)
  })

  it('一个 4 帧行走周期 = 70px/s × 0.56s(39.2px):相位从任意起点累计推进 4', () => {
    expect(advanceWalkPhase(2.5, 39.2)).toBeCloseTo(6.5, 10)
  })

  it('静止(位移为 0)相位归零回待机;被墙挡住(位移 ≤ 0.1px)同样视同静止', () => {
    expect(advanceWalkPhase(3.7, 0)).toBe(0)
    expect(advanceWalkPhase(3.7, 0.1)).toBe(0)
    expect(advanceWalkPhase(3.7, 0.11)).toBeGreaterThan(3.7)
  })

  it('bob 曲线:着地帧(整数相位)为 0,步中(半步相位)抬到 -2px', () => {
    expect(walkBobOffset(0)).toBe(0)
    expect(walkBobOffset(1)).toBe(0)
    expect(walkBobOffset(2)).toBe(0)
    expect(walkBobOffset(0.5)).toBe(-2)
    expect(walkBobOffset(1.5)).toBe(-2)
    expect(walkBobOffset(0.25)).toBe(-1)
    expect(walkBobOffset(0.75)).toBe(-1)
  })

  it('bob 以 2 步为周期(左右脚),且只向上抬不为正(脚不离地基准)', () => {
    expect(walkBobOffset(2.25)).toBe(walkBobOffset(0.25))
    expect(walkBobOffset(5.5)).toBe(walkBobOffset(1.5))
    for (let p = 0; p < 6; p += 0.05) {
      const dy = walkBobOffset(p)
      expect(dy).toBeLessThanOrEqual(0)
      expect(dy).toBeGreaterThanOrEqual(-2)
      expect(Number.isInteger(dy)).toBe(true)
    }
  })
})

describe('待机呼吸(票 #49:帧 0 两态微循环,静止/移动/垂钓三态可辨)', () => {
  it('周期起点与终点都是放松态(基线);半周期处吸气到位(头抬 1px + 纵伸 6%)', () => {
    expect(breathPose(0)).toEqual({ dy: 0, scaleY: 1, rotation: 0 })
    expect(breathPose(1.6)).toEqual({ dy: 0, scaleY: 1, rotation: 0 })
    expect(breathPose(0.8)).toEqual({ dy: -1, scaleY: 1.06, rotation: 0 })
  })

  it('呼吸是循环:t 与 t + 周期同态;同态点相等', () => {
    expect(breathPose(0.4)).toEqual(breathPose(0.4 + 1.6))
    expect(breathPose(0.2)).toEqual(breathPose(1.6 - 0.2))
  })
})

describe('持竿朝向(票 #49:垂钓锁朝水朝向)', () => {
  it('零向量无方向信息:返回 null(调用方保持当前朝向,不静默读作 up)', () => {
    expect(facingToward(0, 0)).toBeNull()
  })

  it('位移向量 4 向量化:水平主轴优先,恰好 45° 取竖直', () => {
    expect(facingToward(3, 0)).toBe('right')
    expect(facingToward(-3, 0)).toBe('left')
    expect(facingToward(0, 3)).toBe('down')
    expect(facingToward(0, -3)).toBe('up')
    expect(facingToward(5, 3)).toBe('right')
    expect(facingToward(-5, 3)).toBe('left')
    expect(facingToward(3, 5)).toBe('down')
    expect(facingToward(3, -5)).toBe('up')
    expect(facingToward(-3, -5)).toBe('up')
    expect(facingToward(2, 2)).toBe('down')
  })
})

describe('抛竿前倾(票 #49:小幅前倾后恢复)', () => {
  it('横向朝向:抛竿中段前倾(约 7°),两端回正,左右取号相反', () => {
    expect(castLeanPose(0, 'right').rotation).toBeCloseTo(0, 10)
    expect(castLeanPose(1, 'right').rotation).toBeCloseTo(0, 10)
    expect(castLeanPose(0.5, 'right').rotation).toBeCloseTo(0.12, 6)
    expect(castLeanPose(0.5, 'left').rotation).toBeCloseTo(-0.12, 6)
    expect(castLeanPose(0.5, 'right').dy).toBe(0)
  })

  it('竖直朝向:无旋转,中段重心前压(1px 下沉),落水后恢复', () => {
    expect(castLeanPose(0.5, 'down')).toEqual({ dy: 1, scaleY: 1, rotation: 0 })
    expect(castLeanPose(0.5, 'up')).toEqual({ dy: 1, scaleY: 1, rotation: 0 })
    expect(castLeanPose(1, 'down')).toEqual({ dy: 0, scaleY: 1, rotation: 0 })
  })

  it('越界 castT 钳制:负值与 ≥1 都按立直处理(不抛错、不发散)', () => {
    expect(castLeanPose(-0.3, 'right').rotation).toBeCloseTo(0, 10)
    expect(castLeanPose(2, 'right').rotation).toBeCloseTo(0, 10)
  })
})

describe('脚下影子几何(票 #49:椭圆半透明,贴地随 bob 微缩淡)', () => {
  it('着地(lift 0)为基准椭圆:半宽 5 / 半高 2 / 透明度 0.3', () => {
    expect(shadowPose(0)).toEqual({ rx: 5, ry: 2, alpha: 0.3 })
  })

  it('抬升随 bob 单调缩淡:最高点(2px)宽 -1.5 / 高 -0.5 / 淡 -0.08', () => {
    expect(shadowPose(2).rx).toBe(3.5)
    expect(shadowPose(2).ry).toBe(1.5)
    expect(shadowPose(2).alpha).toBeCloseTo(0.22, 12)
    expect(shadowPose(1).rx).toBeLessThan(5)
    expect(shadowPose(1).rx).toBeGreaterThan(3.5)
  })

  it('越界抬升钳制在 [0, 2] 档内(不发散、不为负)', () => {
    expect(shadowPose(-1)).toEqual(shadowPose(0))
    expect(shadowPose(9)).toEqual(shadowPose(2))
  })
})
