import { describe, expect, it } from 'vitest'
import { WORLD_MAPS } from './maps'
import { waterDistancePx } from './waterDistance'
import type { WorldMapData } from './worldMap'

/** 合成小图(2×2 tile,右下格为水):纯函数距离几何的期望值全部独立手算 */
function mapWithWater(waterCells: [number, number][]): WorldMapData {
  const width = 2
  const height = 2
  const water = new Array(width * height).fill(0)
  for (const [tx, ty] of waterCells) water[ty * width + tx] = 1
  return {
    width,
    height,
    tileWidth: 16,
    widthPx: width * 16,
    heightPx: height * 16,
    ground: new Array(width * height).fill(0),
    water,
    deco: new Array(width * height).fill(0),
    tileset: { image: 'test', columns: 12, tileCount: 144, firstGid: 1 },
    blocked: new Uint8Array(width * height),
    spawn: { x: 8, y: 8 },
    waterRectPx: { x: 0, y: 0, width: width * 16, height: height * 16 },
    objects: [],
  }
}

/**
 * 接缝:玩家到最近水域的距离(纯函数,票 #44)。期望值为独立几何手算:
 * 水 cell 的矩形距离(在矩形内 = 0,在外 = 到最近矩形边的欧氏距离),多 cell 取最近。
 */
describe('waterDistancePx(接缝:到最近水域的距离)', () => {
  it('在水 cell 内(含边上)距离为 0', () => {
    const map = mapWithWater([[1, 1]])
    expect(waterDistancePx(map, 24, 24)).toBe(0) // cell (1,1) 中心
    expect(waterDistancePx(map, 16, 16)).toBe(0) // cell 左上角
  })

  it('水外一点按矩形距离取最近 cell(手算:距 cell 下边 6px + 左边 0 = 6)', () => {
    const map = mapWithWater([
      [0, 0],
      [1, 0],
    ])
    // 点 (24, 22):正下方 6px 处贴 cell (1,0) 下边(y=16)——距离 6
    expect(waterDistancePx(map, 24, 22)).toBe(6)
  })

  it('斜对角点取欧氏距离(手算:dx=8、dy=8 → √128)', () => {
    const map = mapWithWater([[0, 0]])
    // 点 (24, 24):cell (0,0) 矩形 [0,16)² 的右下角外 (8,8)
    expect(waterDistancePx(map, 24, 24)).toBeCloseTo(Math.sqrt(8 * 8 + 8 * 8), 10)
  })

  it('多水域取最近(近 cell 距离压过远 cell)', () => {
    const map = mapWithWater([
      [0, 0],
      [1, 1],
    ])
    // 点 (8, 20):cell (0,0) 下方 4px(x 在矩形内、y 超下边 4);cell (1,1) 左方 8px —— 取 4
    expect(waterDistancePx(map, 8, 20)).toBe(4)
  })

  it('无水域返回 Infinity(音量函数按静音兜底)', () => {
    const map = mapWithWater([])
    expect(waterDistancePx(map, 8, 8)).toBe(Infinity)
  })

  it('真实村舍图:水域中心距离 0,地图远角距离显著大于 0', () => {
    const village = WORLD_MAPS.village
    const wr = village.waterRectPx
    expect(waterDistancePx(village, wr.x + wr.width / 2, wr.y + wr.height / 2)).toBe(0)
    const far = waterDistancePx(village, 8, village.heightPx - 8)
    expect(far).toBeGreaterThan(32)
  })
})
