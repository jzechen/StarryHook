/**
 * 世界地图解析器(票 #34,spec §1.2):Tiled 兼容 JSON → 归一化地图数据。
 *
 * 数据契约(#26 调研):正交、right-down、CSV 层编码(数组)、单 tileset、
 * 物件层声明交互点。地面/水/装饰三层;水层非零 cell = 水域(渲染层据此铺
 * 流水与泡沫,动画不入数据);碰撞 = 水 cell + 带 collision 属性的 tile,
 * 由解析器折算成「blocked cell 网格」——核心循环经注入的碰撞来源消费该网格
 * (图 #25 纪律:核心只允许参数来源参数化级扩展,不 import 地图/渲染)。
 *
 * 解析器为纯函数:结构不合法即抛错(挡住坏数据流入核心/渲染),不触碰
 * DOM / PixiJS / 文件系统;地图 JSON 经 Vite 随包构建(import,免运行时 fetch)。
 */

/** 解析后的物件层条目(本票只透传;交互点系统票 #36 起消费) */
export interface WorldMapObject {
  name: string
  type: string
  /** 世界像素坐标(Tiled point 对象;矩形对象取左上角) */
  x: number
  y: number
  /** 自定义属性(数组形式折算成键值;缺省 = 空) */
  properties: Readonly<Record<string, unknown>>
}

/** 解析并归一化后的世界地图(纯数据) */
export interface WorldMapData {
  /** 图尺寸(tile) */
  width: number
  height: number
  /** tile 边长(逻辑像素) */
  tileWidth: number
  /** 世界像素尺寸(width × tileWidth) */
  widthPx: number
  heightPx: number
  /** 三层 gid(行优先,0 = 空白;长度 = width × height) */
  ground: readonly number[]
  water: readonly number[]
  deco: readonly number[]
  /** 单 tileset(切片契约:textures.ts 按 columns × tilewidth 切格,gid − firstGid = tile 序号) */
  tileset: {
    image: string
    columns: number
    tileCount: number
    firstGid: number
  }
  /** 不可走 cell(水域 + 大件 collision;行优先,1 = 挡) */
  blocked: Uint8Array
  /** 出生点(世界像素) */
  spawn: { x: number; y: number }
  /** 水域包围盒(世界像素;村舍图为无洞矩形,渲染层整片 TilingSprite) */
  waterRectPx: { x: number; y: number; width: number; height: number }
  /** 物件层条目(透传) */
  objects: readonly WorldMapObject[]
}

const LAYER_NAMES = ['ground', 'water', 'deco'] as const

/**
 * 基底草地 gid(tile 0 = Kenney 平草):ground 层该值由渲染层的整片
 * TilingSprite 覆盖(不逐 tile 出精灵),其余 ground gid 逐 tile 叠加。
 */
export const BASE_GROUND_GID = 1

/** 解析入口:raw = import 的 Tiled JSON;不合法即抛错 */
export function parseWorldMap(raw: unknown): WorldMapData {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('世界地图:顶层必须是对象')
  }
  const m = raw as Record<string, unknown>
  const width = intField(m, 'width')
  const height = intField(m, 'height')
  const tileWidth = intField(m, 'tilewidth')
  if (width <= 0 || height <= 0 || tileWidth <= 0) {
    throw new Error(`世界地图:尺寸非法(${width}×${height}, tile ${tileWidth})`)
  }
  const cells = width * height

  const layers = m['layers']
  if (!Array.isArray(layers)) throw new Error('世界地图:缺 layers')

  const out = {} as Record<'ground' | 'water' | 'deco', number[]>
  for (const name of LAYER_NAMES) {
    const found = layers.filter(
      l => typeof l === 'object' && l !== null && (l as Record<string, unknown>)['name'] === name,
    )
    if (found.length !== 1) throw new Error(`世界地图:${name} 层必须恰好一条(现 ${found.length})`)
    const data = (found[0] as Record<string, unknown>)['data']
    if (!Array.isArray(data) || data.length !== cells) {
      throw new Error(`世界地图:${name} 层 data 长度必须 = ${cells}(现 ${Array.isArray(data) ? data.length : '非数组'})`)
    }
    for (const gid of data) {
      if (!Number.isInteger(gid) || (gid as number) < 0) {
        throw new Error(`世界地图:${name} 层含非法 gid:${String(gid)}`)
      }
    }
    out[name] = data as number[]
  }

  // 单 tileset 契约:firstgid 区间罩住全部层 gid(0 = 空白除外)
  const tilesets = m['tilesets']
  if (!Array.isArray(tilesets) || tilesets.length !== 1) {
    throw new Error('世界地图:必须有且只有一个 tileset')
  }
  const ts = tilesets[0] as Record<string, unknown>
  const firstGid = intField(ts, 'firstgid')
  const columns = intField(ts, 'columns')
  const tileCount = intField(ts, 'tilecount')
  const image = ts['image']
  if (firstGid < 1 || columns < 1 || tileCount < 1 || typeof image !== 'string') {
    throw new Error(`世界地图:tileset 字段非法(firstgid=${firstGid}, columns=${columns}, tilecount=${tileCount})`)
  }
  const maxGid = firstGid + tileCount
  for (const name of LAYER_NAMES) {
    for (const gid of out[name]) {
      if (gid >= maxGid) throw new Error(`世界地图:gid ${gid} 超出 tileset 区间 [${firstGid}, ${maxGid})`)
    }
  }

  // 碰撞:tileset tiles[].properties 里的 collision 标记 → tile id 集合
  const collisionTiles = new Set<number>()
  const tsTiles = ts['tiles']
  if (tsTiles !== undefined) {
    if (!Array.isArray(tsTiles)) throw new Error('世界地图:tileset.tiles 必须是数组')
    for (const t of tsTiles) {
      if (typeof t !== 'object' || t === null) throw new Error('世界地图:tileset.tiles 条目必须是对象')
      const props = (t as Record<string, unknown>)['properties']
      if (props === undefined) continue
      if (!Array.isArray(props)) throw new Error('世界地图:tile 属性必须是数组')
      for (const p of props) {
        if (
          typeof p === 'object' && p !== null &&
          (p as Record<string, unknown>)['name'] === 'collision' &&
          (p as Record<string, unknown>)['value'] === true
        ) {
          collisionTiles.add(intField(t as Record<string, unknown>, 'id'))
        }
      }
    }
  }

  // blocked cell:水层非零,或 ground/deco 层命中 collision tile(gid − firstGid = tile id)
  const blocked = new Uint8Array(cells)
  for (const name of LAYER_NAMES) {
    const layer = out[name]
    for (let i = 0; i < cells; i++) {
      const gid = layer[i]
      if (gid === 0) continue
      if (name === 'water' || collisionTiles.has(gid - firstGid)) blocked[i] = 1
    }
  }

  // 物件层:objectgroup(必须存在;交互点系统票消费,本票只解析透传)
  const objectLayers = layers.filter(
    l => typeof l === 'object' && l !== null && (l as Record<string, unknown>)['type'] === 'objectgroup',
  )
  if (objectLayers.length !== 1) throw new Error('世界地图:物件层(objectgroup)必须恰好一条')
  const rawObjects = (objectLayers[0] as Record<string, unknown>)['objects']
  if (!Array.isArray(rawObjects)) throw new Error('世界地图:物件层缺 objects')
  const objects: WorldMapObject[] = rawObjects.map((o, i) => {
    if (typeof o !== 'object' || o === null) throw new Error(`世界地图:物件 #${i} 不是对象`)
    const obj = o as Record<string, unknown>
    const props: Record<string, unknown> = {}
    if (obj['properties'] !== undefined) {
      if (!Array.isArray(obj['properties'])) throw new Error(`世界地图:物件 #${i} 属性必须是数组`)
      for (const p of obj['properties']) {
        if (typeof p === 'object' && p !== null && typeof (p as Record<string, unknown>)['name'] === 'string') {
          props[(p as Record<string, unknown>)['name'] as string] = (p as Record<string, unknown>)['value']
        }
      }
    }
    return {
      name: typeof obj['name'] === 'string' ? obj['name'] : '',
      type: typeof obj['type'] === 'string' ? obj['type'] : '',
      x: numField(obj, 'x', i),
      y: numField(obj, 'y', i),
      properties: props,
    }
  })

  const spawns = objects.filter(o => o.type === 'spawn')
  if (spawns.length !== 1) throw new Error(`世界地图:出生点必须恰好一个(现 ${spawns.length})`)

  // 水域包围盒(世界像素)
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (let ty = 0; ty < height; ty++) {
    for (let tx = 0; tx < width; tx++) {
      if (out.water[ty * width + tx] !== 0) {
        x0 = Math.min(x0, tx)
        y0 = Math.min(y0, ty)
        x1 = Math.max(x1, tx)
        y1 = Math.max(y1, ty)
      }
    }
  }
  if (x0 === Infinity) throw new Error('世界地图:水域为空(至少一格水)')
  const waterRectPx = { x: x0 * tileWidth, y: y0 * tileWidth, width: (x1 - x0 + 1) * tileWidth, height: (y1 - y0 + 1) * tileWidth }

  return {
    width,
    height,
    tileWidth,
    widthPx: width * tileWidth,
    heightPx: height * tileWidth,
    ground: out.ground,
    water: out.water,
    deco: out.deco,
    tileset: { image, columns, tileCount, firstGid },
    blocked,
    spawn: { x: spawns[0]!.x, y: spawns[0]!.y },
    waterRectPx,
    objects,
  }
}

/** 单 cell 是否不可走(越界视为挡:防任何求交滑出图外) */
export function isBlockedCell(map: WorldMapData, tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return true
  return map.blocked[ty * map.width + tx] === 1
}

/**
 * 脚部碰撞盒(中心 cx,cy,半宽 halfW,半高 halfH)是否与不可走 cell 重叠。
 * 半开区间语义:盒边恰好贴上 cell 边不算重叠(浮点容差内按相切处理)。
 */
export function blockedBox(
  map: WorldMapData,
  cx: number,
  cy: number,
  halfW: number,
  halfH: number,
): boolean {
  const EPS = 1e-6
  const t = map.tileWidth
  const tx0 = Math.floor((cx - halfW + EPS) / t)
  const tx1 = Math.floor((cx + halfW - EPS) / t)
  const ty0 = Math.floor((cy - halfH + EPS) / t)
  const ty1 = Math.floor((cy + halfH - EPS) / t)
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      if (isBlockedCell(map, tx, ty)) return true
    }
  }
  return false
}

/**
 * 世界碰撞来源(票 #34 注入缝,组合根接线):地图 blocked 网格的谓词封装。
 * 结构性匹配 coreLoop.WorldCollisionSource(核心不 import 地图,方向倒置)。
 */
export interface MapCollisionSource {
  readonly widthPx: number
  readonly heightPx: number
  blockedBox(cx: number, cy: number, halfW: number, halfH: number): boolean
}

export function worldCollisionSource(map: WorldMapData): MapCollisionSource {
  return {
    widthPx: map.widthPx,
    heightPx: map.heightPx,
    blockedBox: (cx, cy, halfW, halfH) => blockedBox(map, cx, cy, halfW, halfH),
  }
}

function intField(obj: Record<string, unknown>, key: string): number {
  const v = obj[key]
  if (typeof v !== 'number' || !Number.isInteger(v)) {
    throw new Error(`世界地图:${key} 必须是整数(现 ${String(v)})`)
  }
  return v
}

function numField(obj: Record<string, unknown>, key: string, index: number): number {
  const v = obj[key]
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`世界地图:物件 #${index} 的 ${key} 必须是数`)
  }
  return v
}
