import { describe, expect, it } from 'vitest'
import { parseWorldMap } from './worldMap'
import { warpAt, warpsOf } from './warps'

/**
 * 出口(warp)解析与走入触发(票 #35,spec §1.4):
 * 出口 = 物件层 type='warp' 条目,属性 target(目标场景)/ tx,ty(对侧到达点)
 * / w,h(触发区尺寸,缺省 = 2×2 tile 的边缘走廊);走入触发区即触发过场。
 * 解析纯函数,坏数据即抛错(与 parseWorldMap 同哲学:挡住坏数据流入组合根)。
 */

/** 合成最小图(12×12):草底 + 一格水 + 出生点,物件层按用例注入 */
function rawMap(objects: unknown[]): Record<string, unknown> {
  return {
    width: 12,
    height: 12,
    tilewidth: 16,
    tileheight: 16,
    orientation: 'orthogonal',
    renderorder: 'right-down',
    type: 'map',
    layers: [
      { type: 'tilelayer', name: 'ground', data: new Array(144).fill(1) },
      { type: 'tilelayer', name: 'water', data: (() => {
        const d = new Array(144).fill(0)
        d[6 * 12 + 6] = 1
        return d
      })() },
      { type: 'tilelayer', name: 'deco', data: new Array(144).fill(0) },
      { type: 'objectgroup', name: 'objects', objects },
    ],
    tilesets: [
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
      },
    ],
  }
}

/** 东缘出口物件(物件点 = 触发区中心) */
function warpObject(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    point: true,
    name: '东 · 河谷',
    type: 'warp',
    x: 912,
    y: 208,
    properties: [
      { name: 'target', type: 'string', value: 'river' },
      { name: 'tx', type: 'float', value: 88 },
      { name: 'ty', type: 'float', value: 208 },
      { name: 'w', type: 'int', value: 32 },
      { name: 'h', type: 'int', value: 32 },
    ],
    ...overrides,
  }
}

describe('warpsOf(接缝:物件层 warp 条目 → 触发区)', () => {
  it('解析 warp 条目:触发区矩形 + 目标场景 + 对侧到达点', () => {
    const map = parseWorldMap(rawMap([
      { name: '出生点', type: 'spawn', x: 72, y: 72, point: true },
      warpObject(),
    ]))
    const warps = warpsOf(map)
    expect(warps).toHaveLength(1)
    expect(warps[0]).toEqual({ x: 896, y: 192, width: 32, height: 32, target: 'river', tx: 88, ty: 208 })
  })

  it('w/h 缺省 = 32×32(2×2 tile 边缘走廊标准尺寸)', () => {
    const map = parseWorldMap(rawMap([
      { name: '出生点', type: 'spawn', x: 72, y: 72, point: true },
      warpObject({ properties: [
        { name: 'target', type: 'string', value: 'river' },
        { name: 'tx', type: 'float', value: 88 },
        { name: 'ty', type: 'float', value: 208 },
      ] }),
    ]))
    expect(warpsOf(map)[0]).toMatchObject({ width: 32, height: 32 })
  })

  it('非 warp 物件(spawn/spot)不进出口表', () => {
    const map = parseWorldMap(rawMap([
      { name: '出生点', type: 'spawn', x: 72, y: 72, point: true },
      { name: '南岸', type: 'spot', x: 100, y: 100, point: true, properties: [{ name: 'area', type: 'string', value: 'pond' }] },
    ]))
    expect(warpsOf(map)).toHaveLength(0)
  })

  it('坏数据即抛错:缺 target / 空 target / tx 非数 / w 非正', () => {
    const spawn = { name: '出生点', type: 'spawn', x: 72, y: 72, point: true }
    const missingTarget = warpObject({ properties: [
      { name: 'tx', type: 'float', value: 88 },
      { name: 'ty', type: 'float', value: 208 },
    ] })
    const emptyTarget = warpObject({ properties: [
      { name: 'target', type: 'string', value: '' },
      { name: 'tx', type: 'float', value: 88 },
      { name: 'ty', type: 'float', value: 208 },
    ] })
    const badTx = warpObject({ properties: [
      { name: 'target', type: 'string', value: 'river' },
      { name: 'tx', type: 'string', value: 'west' },
      { name: 'ty', type: 'float', value: 208 },
    ] })
    const badW = warpObject({ properties: [
      { name: 'target', type: 'string', value: 'river' },
      { name: 'tx', type: 'float', value: 88 },
      { name: 'ty', type: 'float', value: 208 },
      { name: 'w', type: 'int', value: 0 },
    ] })
    for (const bad of [missingTarget, emptyTarget, badTx, badW]) {
      expect(() => warpsOf(parseWorldMap(rawMap([spawn, bad])))).toThrow()
    }
  })
})

describe('warpAt(走入触发判定:半开矩形,第一个命中)', () => {
  const map = parseWorldMap(rawMap([
    { name: '出生点', type: 'spawn', x: 72, y: 72, point: true },
    warpObject(),
  ]))
  const zone = { x: 896, y: 192, width: 32, height: 32 }

  it('区内命中;左/上边沿命中,右/下边沿不命中(半开区间)', () => {
    expect(warpAt(map, 912, 208)).not.toBeNull()
    expect(warpAt(map, zone.x, zone.y)).not.toBeNull()
    expect(warpAt(map, zone.x + zone.width, zone.y + zone.height)).toBeNull()
  })

  it('区外(走廊入口前一步)不命中', () => {
    expect(warpAt(map, zone.x - 1, zone.y + 16)).toBeNull()
    expect(warpAt(map, 400, 208)).toBeNull()
  })

  it('多出口按物件层顺序取第一个命中', () => {
    const two = parseWorldMap(rawMap([
      { name: '出生点', type: 'spawn', x: 72, y: 72, point: true },
      warpObject(),
      warpObject({
        name: '东 · 湖畔',
        x: 920,
        y: 208,
        properties: [
          { name: 'target', type: 'string', value: 'lake' },
          { name: 'tx', type: 'float', value: 88 },
          { name: 'ty', type: 'float', value: 208 },
        ],
      }),
    ]))
    expect(warpAt(two, 912, 208)!.target).toBe('river')
    // 930 只落在第二个触发区([904,936))内:重叠区按物件层顺序取第一个
    expect(warpAt(two, 930, 208)!.target).toBe('lake')
  })

  it('同一地图对象重复判定只解析一次物件层(每帧走入判定不重建触发区,review 修复)', () => {
    const once = parseWorldMap(rawMap([
      { name: '出生点', type: 'spawn', x: 72, y: 72, point: true },
      warpObject(),
    ]))
    // 以计数 getter 监视物件层读取:解析契约 = 首次读取后按图记忆化
    let objectReads = 0
    const objects = once.objects
    Object.defineProperty(once, 'objects', {
      get: () => {
        objectReads++
        return objects
      },
    })
    expect(warpAt(once, 912, 208)).not.toBeNull()
    expect(warpAt(once, 912, 208)).not.toBeNull()
    expect(warpAt(once, 912, 208)).not.toBeNull()
    expect(objectReads).toBe(1)
  })
})
