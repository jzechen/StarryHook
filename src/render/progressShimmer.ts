/**
 * 进度流光(票 #43,spec §5.2):绿条小游戏进度 ≥70% 启动、回落即停的
 * 紧张感信号——非常驻装饰,只在接近收网的路段给一条循环上行的亮带。
 * 几何由 WorldScene 画进 mgProgress 的既有「clear → 重画」路径,
 * 不新增每帧重画的 Graphics(指令泄漏守护不变)。
 */

/** 启动阈值:进度达 70% 亮,回落即停(spec §5.2 口径单源) */
export const SHIMMER_THRESHOLD = 0.7

/** 亮带沿轨道走一轮的周期(秒) */
export const SHIMMER_PERIOD = 0.7

/** 亮带高度(占轨道比例):细条,不遮挡进度读数 */
export const SHIMMER_BAND_HEIGHT = 0.12

/** 流光是否可见(纯函数):≥70% 亮,回落即停 */
export function shimmerActive(progress: number): boolean {
  return progress >= SHIMMER_THRESHOLD
}

/** 亮带位置(轨道底部起算的 0..1 循环)+ 高度(纯函数,渲染层换算像素) */
export function shimmerBand(t: number): { pos: number; height: number } {
  return {
    pos: (t / SHIMMER_PERIOD) % 1,
    height: SHIMMER_BAND_HEIGHT,
  }
}
