import { describe, expect, it } from 'vitest'
import villageJson from './village.json'
import { blockedBox, isBlockedCell, parseWorldMap, type WorldMapData } from './worldMap'

/**
 * 村舍地图数据与解析器不变量(票 #34,spec §1.1/§1.2 红线):
 * 图 = Tiled 兼容 JSON(正交、CSV、单 tileset、地面/水/装饰三层 + 物件层);
 * 解析器 = 纯函数,结构不合法即抛错(挡住坏数据流入核心/渲染);
 * 不变量钉死:尺寸、层完整、gid 区间、出生点存在且可行走、水域为无洞矩形
 * (整片 TilingSprite 渲染前提)、外圈树墙+围栏收边(出生点四连通走不出图)。
 */

/** 期望值为独立字面量(票面 #34 布局决策),不从实现推导 */
const VILLAGE = { width: 60, height: 26, widthPx: 960, heightPx: 416 }
/** 池塘(水域):tile (26,13) 起 8×5;像素矩形 = tile 坐标 × 16 */
const POND_PX = { x: 26 * 16, y: 13 * 16, width: 8 * 16, height: 5 * 16 }

describe('村舍地图 village.json(接缝:parseWorldMap 纯函数)', () => {
  const map: WorldMapData = parseWorldMap(villageJson)

  it('尺寸 = 60×26 tile(2 屏宽 × 1.5 屏高),世界像素 960×416', () => {
    expect(map.width).toBe(VILLAGE.width)
    expect(map.height).toBe(VILLAGE.height)
    expect(map.widthPx).toBe(VILLAGE.widthPx)
    expect(map.heightPx).toBe(VILLAGE.heightPx)
  })

  it('三层完整:ground/water/deco 各 w×h 项且 gid 为非负整数', () => {
    for (const layer of [map.ground, map.water, map.deco]) {
      expect(layer).toHaveLength(map.width * map.height)
      for (const gid of layer) {
        expect(Number.isInteger(gid)).toBe(true)
        expect(gid).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('gid 全部落在 tileset 区间 [0, firstGid + tileCount)(0 = 空白)', () => {
    const max = map.tileset.firstGid + map.tileset.tileCount
    for (const layer of [map.ground, map.water, map.deco]) {
      for (const gid of layer) expect(gid).toBeLessThan(max)
    }
    expect(map.tileset.firstGid).toBe(1)
    expect(map.tileset.columns).toBe(12)
  })

  it('物件层:出生点恰好一个;钓位恰好两个且水域 id 合法、名字非空', () => {
    expect(map.objects.filter(o => o.type === 'spawn')).toHaveLength(1)
    const spots = map.objects.filter(o => o.type === 'spot')
    expect(spots).toHaveLength(2)
    for (const spot of spots) {
      expect(['pond', 'river', 'lake']).toContain(spot.properties['area'])
      expect(spot.name.length).toBeGreaterThan(0)
    }
  })

  it('出生点可行走(不在水/大件 collision 上),且在图内', () => {
    const tx = Math.floor(map.spawn.x / map.tileWidth)
    const ty = Math.floor(map.spawn.y / map.tileWidth)
    expect(isBlockedCell(map, tx, ty)).toBe(false)
    expect(tx).toBeGreaterThanOrEqual(2)
    expect(ty).toBeGreaterThanOrEqual(2)
  })

  it('水域:水 cell 全部不可走;区域为无洞矩形(bbox 填满,整片 TilingSprite 前提)', () => {
    const cells: [number, number][] = []
    for (let ty = 0; ty < map.height; ty++) {
      for (let tx = 0; tx < map.width; tx++) {
        if (map.water[ty * map.width + tx] !== 0) cells.push([tx, ty])
      }
    }
    expect(cells.length).toBeGreaterThan(0)
    const xs = cells.map(([tx]) => tx)
    const ys = cells.map(([, ty]) => ty)
    const x0 = Math.min(...xs)
    const x1 = Math.max(...xs)
    const y0 = Math.min(...ys)
    const y1 = Math.max(...ys)
    expect(cells.length).toBe((x1 - x0 + 1) * (y1 - y0 + 1))
    expect(map.waterRectPx).toEqual(POND_PX)
    for (const [tx, ty] of cells) expect(isBlockedCell(map, tx, ty)).toBe(true)
  })

  it('外圈收边:最外圈与第二圈(树墙+围栏)全部不可走', () => {
    for (let tx = 0; tx < map.width; tx++) {
      for (const ty of [0, 1, map.height - 2, map.height - 1]) {
        expect(isBlockedCell(map, tx, ty)).toBe(true)
      }
    }
    for (let ty = 0; ty < map.height; ty++) {
      for (const tx of [0, 1, map.width - 2, map.width - 1]) {
        expect(isBlockedCell(map, tx, ty)).toBe(true)
      }
    }
  })

  it('碰撞盒查询:水域/大件 cell 挡住脚部盒;出生点开阔地不挡', () => {
    const cx = POND_PX.x + POND_PX.width / 2
    const cy = POND_PX.y + POND_PX.height / 2
    expect(blockedBox(map, cx, cy, 5, 3)).toBe(true)
    expect(blockedBox(map, map.spawn.x, map.spawn.y, 5, 3)).toBe(false)
  })

  it('装饰分挡:井(tile 104 → gid 105)所在 cell 挡;花草(tile 2 → gid 3)不挡', () => {
    const well = cellOf(map.deco, map, 105)
    expect(well).not.toBeNull()
    expect(isBlockedCell(map, well![0], well![1])).toBe(true)
    const flower = cellOf(map.deco, map, 3)
    expect(flower).not.toBeNull()
    expect(isBlockedCell(map, flower![0], flower![1])).toBe(false)
  })
})

describe('解析器拒绝坏数据(纯函数契约,合成最小图)', () => {
  /** 合成 12×12 最小图:草底 + 一格水 + 一格大件(tile 4 → gid 5)+ 出生点 */
  function raw(overrides: {
    layers?: unknown[]
    tilesetData?: unknown
    width?: number
    data?: number[]
  } = {}): unknown {
    const layers = overrides.layers ?? [
      { type: 'tilelayer', name: 'ground', data: new Array(144).fill(1) },
      { type: 'tilelayer', name: 'water', data: (() => {
        const d = new Array(144).fill(0)
        d[6 * 12 + 6] = 1
        return d
      })() },
      { type: 'tilelayer', name: 'deco', data: (() => {
        const d = new Array(144).fill(0)
        d[3 * 12 + 3] = 5
        return d
      })() },
      {
        type: 'objectgroup',
        name: 'objects',
        objects: [{ name: 'spawn', type: 'spawn', x: 40, y: 40, point: true }],
      },
    ]
    return {
      width: overrides.width ?? 12,
      height: 12,
      tilewidth: 16,
      tileheight: 16,
      orientation: 'orthogonal',
      renderorder: 'right-down',
      type: 'map',
      layers,
      tilesets: overrides.tilesetData ?? [
        {
          name: 'tiny-town',
          image: 'tiny-town.png',
          imagewidth: 192,
          imageheight: 176,
          tilewidth: 16,
          tileheight: 16,
          columns: 12,
          tilecount: 132,
          firstgid: 1,
          tiles: [{ id: 4, properties: [{ name: 'collision', type: 'bool', value: true }] }],
        },
      ],
    }
  }

  it('合成图可解析:碰撞语义成立(水/大件挡,草地不挡)', () => {
    const map = parseWorldMap(raw())
    expect(blockedBox(map, 6 * 16 + 8, 6 * 16 + 8, 5, 3)).toBe(true) // 水 cell
    expect(blockedBox(map, 3 * 16 + 8, 3 * 16 + 8, 5, 3)).toBe(true) // 大件 cell
    expect(blockedBox(map, 8 * 16 + 8, 8 * 16 + 8, 5, 3)).toBe(false) // 空草
  })

  it('缺层(无 water)→ 抛错', () => {
    const layers = raw().layers as unknown[]
    const filtered = layers.filter(l => (l as { name?: string }).name !== 'water')
    expect(() => parseWorldMap(raw({ layers: filtered }))).toThrow()
  })

  it('层长不符(data 截短)→ 抛错', () => {
    const layers = raw().layers as unknown[]
    const idx = layers.findIndex(l => (l as { name?: string }).name === 'deco')
    const decoLayer = layers[idx] as { data: number[] }
    decoLayer.data = decoLayer.data.slice(1)
    expect(() => parseWorldMap(raw({ layers }))).toThrow()
  })

  it('gid 越界(> firstGid + tileCount)→ 抛错', () => {
    const layers = raw().layers as unknown[]
    const idx = layers.findIndex(l => (l as { name?: string }).name === 'ground')
    const ground = layers[idx] as { data: number[] }
    ground.data[0] = 999
    expect(() => parseWorldMap(raw({ layers }))).toThrow()
  })

  it('缺出生点 → 抛错', () => {
    const layers = raw().layers as unknown[]
    const idx = layers.findIndex(l => (l as { name?: string }).name === 'objects')
    const objects = layers[idx] as { objects: { type: string }[] }
    objects.objects = []
    expect(() => parseWorldMap(raw({ layers }))).toThrow()
  })

  it('出生点重复 → 抛错', () => {
    const layers = raw().layers as unknown[]
    const idx = layers.findIndex(l => (l as { name?: string }).name === 'objects')
    const objects = layers[idx] as { objects: unknown[] }
    objects.objects = [
      { name: 'spawn', type: 'spawn', x: 40, y: 40, point: true },
      { name: 'spawn', type: 'spawn', x: 56, y: 56, point: true },
    ]
    expect(() => parseWorldMap(raw({ layers }))).toThrow()
  })

  it('尺寸非法(width 0 / 负 tile)→ 抛错', () => {
    expect(() => parseWorldMap(raw({ width: 0 }))).toThrow()
    const badTile = raw() as { tilewidth: number }
    badTile.tilewidth = 0
    expect(() => parseWorldMap(badTile)).toThrow()
  })

  it('非对象输入(null / 数字 / 数组)→ 抛错', () => {
    expect(() => parseWorldMap(null)).toThrow()
    expect(() => parseWorldMap(42)).toThrow()
    expect(() => parseWorldMap([])).toThrow()
  })
})

/** 层内首个等于 gid 的 cell 坐标(测试私有,独立于实现) */
function cellOf(layer: readonly number[], map: WorldMapData, gid: number): [number, number] | null {
  const i = layer.indexOf(gid)
  if (i < 0) return null
  return [i % map.width, Math.floor(i / map.width)]
}
