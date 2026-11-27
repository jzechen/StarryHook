import { describe, expect, it } from 'vitest'
import { deriveWaterArea, WORLD_MAPS } from './maps'
import { parseInteractionSpots } from './interactions'
import { warpsOf, type WarpZone } from './warps'
import { isBlockedCell, waterFillsBounds, type WorldMapData } from './worldMap'

/**
 * 三图布局与连通(票 #35,spec §1.1/§1.4/§1.5 红线):
 * 村舍池塘 ↔ 河谷 ↔ 湖畔 三张 60×26 场景线性相连;每图水域形态/钓位/摊位/
 * 出生点/树墙收边符合 spec;出口物件构成 village↔river↔lake 的往返图,
 * 触发区可达、对侧到达点可行走且不在对侧触发区内(防到达即回传);
 * 当前水域 = 图级映射推导(位置唯一持久,水域不落库)。
 *
 * 期望值为独立字面量(布局决策),不从实现推导(沿 worldMap.test.ts 先例)。
 */

/** 河谷:河流横带(15–17 行)+ 深湾北凸(14 行)+ 南侧河湾(18 行)的外包矩形 */
const RIVER_WATER_BBOX_PX = { x: 2 * 16, y: 14 * 16, width: 56 * 16, height: 5 * 16 }
/** 湖畔:不规则湖 blob(14–20 行,23–34 列,湖心半岛 carve)的外包矩形 */
const LAKE_WATER_BBOX_PX = { x: 23 * 16, y: 14 * 16, width: 12 * 16, height: 7 * 16 }

/** 水域 cell 集合(行优先坐标) */
function waterCells(map: WorldMapData): [number, number][] {
  const cells: [number, number][] = []
  for (let ty = 0; ty < map.height; ty++) {
    for (let tx = 0; tx < map.width; tx++) {
      if (map.water[ty * map.width + tx] !== 0) cells.push([tx, ty])
    }
  }
  return cells
}

/** 四连通洪填(同图内),返回可达 cell 集 */
function flood(map: WorldMapData, start: [number, number]): Set<number> {
  const seen = new Set<number>()
  const queue = [start]
  while (queue.length) {
    const [tx, ty] = queue.pop()!
    if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) continue
    const key = ty * map.width + tx
    if (seen.has(key) || isBlockedCell(map, tx, ty)) continue
    seen.add(key)
    queue.push([tx + 1, ty], [tx - 1, ty], [tx, ty + 1], [tx, ty - 1])
  }
  return seen
}

function cellOfPoint(map: WorldMapData, px: number, py: number): [number, number] {
  return [Math.floor(px / map.tileWidth), Math.floor(py / map.tileWidth)]
}

describe('三图公共不变量(村舍/河谷/湖畔)', () => {
  for (const [mapId, map] of Object.entries(WORLD_MAPS)) {
    it(`[${mapId}] 尺寸 = 60×26 tile(2 屏宽 × 1.5 屏高)`, () => {
      expect(map.width).toBe(60)
      expect(map.height).toBe(26)
      expect(map.widthPx).toBe(960)
      expect(map.heightPx).toBe(416)
    })

    it(`[${mapId}] 外圈收边:最外圈与第二圈(树墙+围栏)全部不可走`, () => {
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

    it(`[${mapId}] 出生点恰好一个、可行走且自出生点四连通可达`, () => {
      const spawns = map.objects.filter(o => o.type === 'spawn')
      expect(spawns).toHaveLength(1)
      const [tx, ty] = cellOfPoint(map, map.spawn.x, map.spawn.y)
      expect(isBlockedCell(map, tx, ty)).toBe(false)
      expect(flood(map, [tx, ty]).size).toBeGreaterThan(0)
    })

    it(`[${mapId}] 水域非空且水 cell 全部不可走`, () => {
      const cells = waterCells(map)
      expect(cells.length).toBeGreaterThan(0)
      for (const [tx, ty] of cells) expect(isBlockedCell(map, tx, ty)).toBe(true)
    })

    it(`[${mapId}] 水域单一连通体(湖心半岛/深湾不切割水域)`, () => {
      const cells = waterCells(map)
      const seen = new Set<number>()
      const queue = [cells[0]!]
      while (queue.length) {
        const [tx, ty] = queue.pop()!
        const key = ty * map.width + tx
        if (seen.has(key) || map.water[key] === 0) continue
        seen.add(key)
        queue.push([tx + 1, ty], [tx - 1, ty], [tx, ty + 1], [tx, ty - 1])
      }
      expect(seen.size).toBe(cells.length)
    })

    it(`[${mapId}] 装饰有铺植(spec §1.6:每图 25 件以上)`, () => {
      const decoCount = map.deco.filter(g => g !== 0).length
      expect(decoCount).toBeGreaterThanOrEqual(25)
    })
  }
})

describe('河谷 river.json(河流横带 + 深湾 + 商店摊位)', () => {
  const map = WORLD_MAPS.river!

  it('河流横带:水域为东西横贯的带状(bbox 覆盖 2–57 列,高 ≤ 5 tile;含深湾凸出不填满)', () => {
    expect(map.waterRectPx).toEqual(RIVER_WATER_BBOX_PX)
    expect(waterFillsBounds(map)).toBe(false)
  })

  it('钓位恰好三个(含「深湾」),水域归属全部 = river,且站在可行走 cell', () => {
    const spots = map.objects.filter(o => o.type === 'spot')
    expect(spots).toHaveLength(3)
    expect(spots.map(s => s.name)).toContain('深湾')
    for (const spot of spots) {
      expect(spot.properties['area']).toBe('river')
      const [tx, ty] = cellOfPoint(map, spot.x, spot.y)
      expect(isBlockedCell(map, tx, ty)).toBe(false)
    }
  })

  it('商店摊位在路径北侧:摊位物件恰一个,物件点可行走', () => {
    const stalls = map.objects.filter(o => o.type === 'stall')
    expect(stalls).toHaveLength(1)
    expect(stalls[0]!.name).toBe('商店摊位')
    const [tx, ty] = cellOfPoint(map, stalls[0]!.x, stalls[0]!.y)
    expect(isBlockedCell(map, tx, ty)).toBe(false)
  })
})

describe('湖畔 lake.json(不规则湖 + 湖心)', () => {
  const map = WORLD_MAPS.lake!

  it('不规则湖:blob 不填满 bbox(整片 TilingSprite 前提不成立,渲染走逐 cell),bbox ≈ 10×7', () => {
    expect(waterFillsBounds(map)).toBe(false)
    expect(map.waterRectPx).toEqual(LAKE_WATER_BBOX_PX)
    const cells = waterCells(map)
    // blob 有实体(40+ cell)但明显不填满 bbox(12×7 = 84 cell)
    expect(cells.length).toBeGreaterThan(40)
    expect(cells.length).toBeLessThan(84)
  })

  it('钓位恰好三个(含「湖心」),水域归属 = lake,站在可行走 cell', () => {
    const spots = map.objects.filter(o => o.type === 'spot')
    expect(spots).toHaveLength(3)
    expect(spots.map(s => s.name)).toContain('湖心')
    for (const spot of spots) {
      expect(spot.properties['area']).toBe('lake')
      const [tx, ty] = cellOfPoint(map, spot.x, spot.y)
      expect(isBlockedCell(map, tx, ty)).toBe(false)
    }
  })
})

describe('出口图与三图连通(村舍 ↔ 河谷 ↔ 湖畔)', () => {
  const warpsByMap = (): Record<string, WarpZone[]> =>
    Object.fromEntries(Object.entries(WORLD_MAPS).map(([id, m]) => [id, warpsOf(m)]))

  it('出口拓扑:村舍东 1 条 → 河谷;河谷西/东各 1 → 村舍/湖畔;湖畔西 1 → 河谷', () => {
    const w = warpsByMap()
    expect(w.village).toHaveLength(1)
    expect(w.village[0]!.target).toBe('river')
    expect(w.river).toHaveLength(2)
    expect(w.river.map(x => x.target).sort()).toEqual(['lake', 'village'])
    expect(w.lake).toHaveLength(1)
    expect(w.lake[0]!.target).toBe('river')
  })

  it('每条出口:目标场景存在;对侧到达点可行走且不在对侧任何触发区内(防到达即回传)', () => {
    for (const [mapId, map] of Object.entries(WORLD_MAPS)) {
      for (const warp of warpsOf(map)) {
        const target = WORLD_MAPS[warp.target as keyof typeof WORLD_MAPS]
        expect(target, `${mapId} → ${warp.target} 存在`).toBeDefined()
        const [tx, ty] = cellOfPoint(target, warp.tx, warp.ty)
        expect(isBlockedCell(target, tx, ty), `${mapId} → ${warp.target} 到达点可行走`).toBe(false)
        for (const back of warpsOf(target)) {
          const inside =
            warp.tx >= back.x && warp.tx < back.x + back.width && warp.ty >= back.y && warp.ty < back.y + back.height
          expect(inside, `${mapId} → ${warp.target} 到达点不落在对侧触发区内`).toBe(false)
        }
      }
    }
  })

  it('每个触发区至少一格可行走(走到才可能触发)', () => {
    for (const map of Object.values(WORLD_MAPS)) {
      for (const warp of warpsOf(map)) {
        const x0 = Math.floor(warp.x / map.tileWidth)
        const x1 = Math.floor((warp.x + warp.width - 1) / map.tileWidth)
        const y0 = Math.floor(warp.y / map.tileWidth)
        const y1 = Math.floor((warp.y + warp.height - 1) / map.tileWidth)
        let walkable = 0
        for (let ty = y0; ty <= y1; ty++) {
          for (let tx = x0; tx <= x1; tx++) if (!isBlockedCell(map, tx, ty)) walkable++
        }
        expect(walkable, `触发区有可行走 cell(${warp.target})`).toBeGreaterThan(0)
      }
    }
  })

  it('三图连通:自村舍出生点出发(4 邻接 + 出口跳转),钓位/摊位/全部触发区可达', () => {
    // 跨图洪填:节点 = (mapId, cell);边 = 4 邻接 ∪ 出口边(触发区内可行走 cell → 对侧到达点)
    const seen = new Set<string>()
    const queue: { mapId: string; tx: number; ty: number }[] = []
    const push = (mapId: string, px: number, py: number): void => {
      const map = WORLD_MAPS[mapId as keyof typeof WORLD_MAPS]
      const [tx, ty] = cellOfPoint(map, px, py)
      queue.push({ mapId, tx, ty })
    }
    const village = WORLD_MAPS.village
    const [sx, sy] = cellOfPoint(village, village.spawn.x, village.spawn.y)
    queue.push({ mapId: 'village', tx: sx, ty: sy })

    const zones = warpsByMap()
    while (queue.length) {
      const { mapId, tx, ty } = queue.pop()!
      const key = `${mapId}:${tx}:${ty}`
      if (seen.has(key)) continue
      const map = WORLD_MAPS[mapId as keyof typeof WORLD_MAPS]
      if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) continue
      if (isBlockedCell(map, tx, ty)) continue
      seen.add(key)
      queue.push({ mapId, tx: tx + 1, ty }, { mapId, tx: tx - 1, ty }, { mapId, tx, ty: ty + 1 }, { mapId, tx, ty: ty - 1 })
      for (const warp of zones[mapId]!) {
        // 触发区内任一可行走 cell 都可触发(半开矩形按 cell 中心判定)
        const cx = tx * map.tileWidth + map.tileWidth / 2
        const cy = ty * map.tileWidth + map.tileWidth / 2
        if (cx >= warp.x && cx < warp.x + warp.width && cy >= warp.y && cy < warp.y + warp.height) {
          push(warp.target, warp.tx, warp.ty)
        }
      }
    }

    const expectReached = (mapId: string, px: number, py: number, what: string): void => {
      const map = WORLD_MAPS[mapId as keyof typeof WORLD_MAPS]
      const [tx, ty] = cellOfPoint(map, px, py)
      expect(seen.has(`${mapId}:${tx}:${ty}`), `${what}(${mapId})`).toBe(true)
    }
    for (const [mapId, map] of Object.entries(WORLD_MAPS)) {
      for (const spot of map.objects.filter(o => o.type === 'spot')) expectReached(mapId, spot.x, spot.y, `钓位「${spot.name}」`)
      for (const stall of map.objects.filter(o => o.type === 'stall')) expectReached(mapId, stall.x, stall.y, `摊位「${stall.name}」`)
      for (const warp of zones[mapId]!) expectReached(mapId, warp.x + warp.width / 2, warp.y + warp.height / 2, `出口 → ${warp.target}`)
    }
  })
})

describe('钓位微差数据(票 #38,spec §3:每图至多 1 处,池塘 0 处)', () => {
  /** 各图交互点解析产物按名取钓位(解析路径一并覆盖:JSON 串 → 倍率表) */
  function spotOf(mapId: keyof typeof WORLD_MAPS, name: string) {
    const map = WORLD_MAPS[mapId]
    return parseInteractionSpots(map.objects, map.tileWidth).find(s => s.name === name)
  }

  it('河谷「深湾」:铅坠鲶 ×2(水域代表鱼)', () => {
    expect(spotOf('river', '深湾')!.spotMul).toEqual({ qianzhuinian: 2 })
  })

  it('河谷其余钓位(浅滩/柳岸)无修饰', () => {
    expect(spotOf('river', '浅滩')!.spotMul).toBeUndefined()
    expect(spotOf('river', '柳岸')!.spotMul).toBeUndefined()
  })

  it('湖畔「湖心」:气球河豚 ×2(水域代表鱼)', () => {
    expect(spotOf('lake', '湖心')!.spotMul).toEqual({ qiqiuHetun: 2 })
  })

  it('湖畔其余钓位(北岸/南岸)无修饰', () => {
    expect(spotOf('lake', '北岸')!.spotMul).toBeUndefined()
    expect(spotOf('lake', '南岸')!.spotMul).toBeUndefined()
  })

  it('池塘红线:村舍两钓位均无修饰(池塘钓位无微差)', () => {
    expect(spotOf('village', '南岸')!.spotMul).toBeUndefined()
    expect(spotOf('village', '西岸')!.spotMul).toBeUndefined()
  })
})

describe('deriveWaterArea(位置 → 水域单一推导来源;v1 图级映射)', () => {
  it('村舍 → 池塘、河谷 → 河流、湖畔 → 湖(v1 每图一水域,与位置无关)', () => {
    expect(deriveWaterArea('village', 0, 0)).toBe('pond')
    expect(deriveWaterArea('river', 0, 0)).toBe('river')
    expect(deriveWaterArea('lake', 0, 0)).toBe('lake')
    // 图级映射在图内任意位置一致(#36 钓位级细化前,同一张图就是同一片水域)
    expect(deriveWaterArea('river', 500, 300)).toBe('river')
    expect(deriveWaterArea('lake', 100, 100)).toBe('lake')
  })

  it('未知场景 id 抛错(挡住拼错的 mapId 流入核心)', () => {
    expect(() => deriveWaterArea('nope' as never, 0, 0)).toThrow()
  })
})
