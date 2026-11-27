/**
 * 近水水声音量(纯函数,票 #44):随「玩家到最近水域的距离」淡入淡出。
 * 距离的来源在渲染/世界层(waterDistancePx),本函数只管距离 → 音量的映射,
 * 输出 0..1 的增益档(实际听感 = 播放器主音量 × 本档 × 素材自身响度)。
 *
 * 起步调参:贴水 1 tile 内全响,6 tile 外全静,之间线性过渡(够听出「走近水边
 * 水声渐起」,又不至于在图中央还能隐约闻水)。
 */

/** 全音量距离(像素;≤ 1 tile = 贴水) */
export const AMBIENT_WATER_FULL_PX = 16

/** 静音距离(像素;≥ 6 tile = 远离水域) */
export const AMBIENT_WATER_SILENCE_PX = 96

/** 距离 → 音量档(0..1);负数/NaN/Infinity 一律按静音兜底 */
export function ambientWaterLevel(distancePx: number): number {
  if (!(distancePx >= 0)) return 0
  if (distancePx <= AMBIENT_WATER_FULL_PX) return 1
  if (distancePx >= AMBIENT_WATER_SILENCE_PX) return 0
  const fade = (distancePx - AMBIENT_WATER_FULL_PX) / (AMBIENT_WATER_SILENCE_PX - AMBIENT_WATER_FULL_PX)
  return 1 - fade
}
