import { describe, expect, it } from 'vitest'
import { computeCamera } from './camera'

/**
 * 相机跟随数学(接缝:computeCamera 纯函数,票 #34,spec §1.3):
 * 图内双向跟随玩家、四边钳制、坐标取整到像素网格(配合整数倍信箱
 * 缩放,亚像素抖动在渲染层不可见)。纯函数不触碰 DOM / PixiJS。
 */

const VIEW = { width: 480, height: 270 }
const WORLD = { width: 960, height: 416 } // 村舍图 60×26 tile × 16px

describe('相机跟随(接缝:computeCamera 纯函数)', () => {
  it('玩家居中:相机原点 = 玩家位置 − 半屏', () => {
    expect(computeCamera(300, 200, WORLD.width, WORLD.height, VIEW.width, VIEW.height)).toEqual({
      x: 60,
      y: 65,
    })
  })

  it('四边钳制:贴左/上/右/下边时相机停在 0 或 世界尺寸 − 视口', () => {
    expect(computeCamera(10, 200, WORLD.width, WORLD.height, VIEW.width, VIEW.height).x).toBe(0)
    expect(computeCamera(300, 10, WORLD.width, WORLD.height, VIEW.width, VIEW.height).y).toBe(0)
    expect(computeCamera(950, 200, WORLD.width, WORLD.height, VIEW.width, VIEW.height).x).toBe(WORLD.width - VIEW.width)
    expect(computeCamera(300, 400, WORLD.width, WORLD.height, VIEW.width, VIEW.height).y).toBe(WORLD.height - VIEW.height)
  })

  it('坐标取整到像素:任意亚像素输入产整数相机原点', () => {
    for (const px of [240.4, 240.5, 240.6, 100.123]) {
      for (const py of [135.4, 135.5, 135.6, 88.987]) {
        const c = computeCamera(px, py, WORLD.width, WORLD.height, VIEW.width, VIEW.height)
        expect(Number.isInteger(c.x)).toBe(true)
        expect(Number.isInteger(c.y)).toBe(true)
      }
    }
  })

  it('无抖动:玩家在同一个取整桶内移动,相机原点不变', () => {
    const a = computeCamera(240.4, 100, WORLD.width, WORLD.height, VIEW.width, VIEW.height)
    const b = computeCamera(240.49, 100, WORLD.width, WORLD.height, VIEW.width, VIEW.height)
    // 期望值独立取整:round(240.4 − 240) = round(240.49 − 240) = 0
    expect(b.x).toBe(a.x)
    expect(a.x).toBe(0)
  })

  it('图小于视口:相机钳在 0(不出现负滚动)', () => {
    expect(computeCamera(50, 50, 400, 200, VIEW.width, VIEW.height)).toEqual({ x: 0, y: 0 })
  })
})
