import type { WorldMapData } from './worldMap'

/**
 * 玩家脚部点到最近水域的距离(纯函数,票 #44):逐水 cell 取「点到 cell 矩形」
 * 的欧氏距离(矩形内 = 0),多 cell 取最近。距离的**唯一**世界层来源——
 * 近水水声(ambient-water)按此淡入淡出;渲染层/核心不各自再算一份。
 *
 * 无水图返回 Infinity(音量函数按静音兜底);每帧调用成本 = 水 cell 数次
 * 开方(百级,可忽略)。
 */
export function waterDistancePx(map: WorldMapData, x: number, y: number): number {
  const t = map.tileWidth
  let best = Infinity
  for (let ty = 0; ty < map.height; ty++) {
    for (let tx = 0; tx < map.width; tx++) {
      if (map.water[ty * map.width + tx] === 0) continue
      const dx = Math.max(tx * t - x, 0, x - (tx + 1) * t)
      const dy = Math.max(ty * t - y, 0, y - (ty + 1) * t)
      const d = Math.hypot(dx, dy)
      if (d < best) best = d
    }
  }
  return best
}
