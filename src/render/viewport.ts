/**
 * 视口信箱数学(ADR-0002):固定逻辑分辨率 480×270,整数倍缩放 + 居中信箱。
 * 纯函数,不触碰 DOM / PixiJS;应用侧见 applyViewportToCanvas()。
 */

/** 逻辑分辨率:16:9,30×17 个 16x16 tile 天然铺满 */
export const LOGICAL_WIDTH = 480
export const LOGICAL_HEIGHT = 270

/** 视口适配结果:全部为整数 CSS 像素,保证画布落在像素网格上不糊 */
export interface ViewportFit {
  /** 整数缩放倍数(>=1;窗口再小也钳到 1x,见下) */
  scale: number
  /** 画布左/上偏移(信箱留边;窗口小于逻辑分辨率时为负值,居中后裁切) */
  offsetX: number
  offsetY: number
  /** 画布 CSS 尺寸 = 逻辑尺寸 × scale */
  width: number
  height: number
}

/**
 * 由窗口尺寸计算整数缩放倍数与信箱偏移。
 *
 * 缩放 = min(窗宽/逻辑宽, 窗高/逻辑高) 向下取整:
 * 长边留边(信箱),画布永不拉伸、永不出现非整数倍采样。
 *
 * 降级策略:窗口比逻辑分辨率还小时,rawScale < 1,钳到 1x——
 * 像素清晰优先于画面完整,画布保持 480×270 居中,四周对称溢出被窗口裁掉
 * (池塘居中,裁掉的只是边角岸地)。
 */
export function computeViewportFit(
  windowWidth: number,
  windowHeight: number,
  logicalWidth: number,
  logicalHeight: number,
): ViewportFit {
  const rawScale = Math.min(windowWidth / logicalWidth, windowHeight / logicalHeight)
  const scale = Math.max(1, Math.floor(rawScale))
  const width = logicalWidth * scale
  const height = logicalHeight * scale
  return {
    scale,
    offsetX: Math.floor((windowWidth - width) / 2),
    offsetY: Math.floor((windowHeight - height) / 2),
    width,
    height,
  }
}
