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

/**
 * 最近水 cell 的瞄准点(纯函数,票 #49):持竿「朝水」朝向的世界层参考点。
 * 与 waterDistancePx 同一「点到 cell 矩形」几何,但返回最近矩形的**钳制点**
 * ——持竿朝向由「人物 → 瞄准点」向量经 facingToward 量化,不用再各自算一份距离。
 * 距离为 0 的 cell(查询点在其矩形内)**跳过**:瞄准点即查询点自身,喂给
 * facingToward 是零向量;只剩他 cell 可瞄(全 0 = 无水或被水包围,返回 null,
 * 调用方保持当前朝向)。
 *
 * 每帧成本 = 水 cell 数(百级)。
 */
export function waterAimPoint(map: WorldMapData, x: number, y: number): { x: number; y: number } | null {
  const t = map.tileWidth
  let best = Infinity
  let aim: { x: number; y: number } | null = null
  for (let ty = 0; ty < map.height; ty++) {
    for (let tx = 0; tx < map.width; tx++) {
      if (map.water[ty * map.width + tx] === 0) continue
      const cx = Math.min(Math.max(x, tx * t), (tx + 1) * t)
      const cy = Math.min(Math.max(y, ty * t), (ty + 1) * t)
      const d = Math.hypot(cx - x, cy - y)
      if (d === 0) continue
      if (d < best) {
        best = d
        aim = { x: cx, y: cy }
      }
    }
  }
  return aim
}
