/**
 * 相机跟随数学(票 #34,spec §1.3):图内双向跟随玩家、四边钳制、
 * 坐标取整到像素网格。纯函数,不触碰 DOM / PixiJS;应用侧由
 * WorldScene 每帧调用并把世界容器平移到 −相机原点(整数 → 不抖)。
 */

/** 相机原点(世界像素,整数;世界容器平移量取负) */
export interface CameraOrigin {
  x: number
  y: number
}

/**
 * 由玩家世界坐标计算相机原点:目标 = 玩家居中(位置 − 半屏),
 * 取整到像素后钳制在 [0, 世界尺寸 − 视口];图小于视口时钳在 0。
 */
export function computeCamera(
  px: number,
  py: number,
  worldWidthPx: number,
  worldHeightPx: number,
  viewWidthPx: number,
  viewHeightPx: number,
): CameraOrigin {
  const maxX = Math.max(0, worldWidthPx - viewWidthPx)
  const maxY = Math.max(0, worldHeightPx - viewHeightPx)
  return {
    x: Math.max(0, Math.min(maxX, Math.round(px - viewWidthPx / 2))),
    y: Math.max(0, Math.min(maxY, Math.round(py - viewHeightPx / 2))),
  }
}
