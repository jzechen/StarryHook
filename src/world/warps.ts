import type { WorldMapData } from './worldMap'

/**
 * 出口(warp)解析与走入触发(票 #35,spec §1.4):场景边缘的过渡点。
 *
 * 数据契约:物件层 type='warp' 条目,物件点 = 触发区**中心**,自定义属性——
 * - target:目标场景 id(必填,非空)
 * - tx / ty:对侧到达点(目标场景世界像素,脚部点;必填,数)
 * - w / h:触发区尺寸(可选,正数;缺省 32×32 = 2×2 tile 的边缘走廊)
 *
 * 触发语义:玩家脚部点进入触发区(半开矩形)即触发过场——淡黑 → 对侧入口
 * 出现(朝向保持行进方向)。过场演出与输入锁定在组合根/渲染层
 * (worldDirector),核心循环不感知;本模块只负责「数据 → 几何判定」。
 *
 * 纯函数,不触碰 DOM / PixiJS;坏数据即抛错(与 parseWorldMap 同哲学)。
 */

/** 解析后的出口:触发区矩形(世界像素)+ 目标场景与对侧到达点 */
export interface WarpZone {
  /** 触发区左上角(世界像素) */
  x: number
  y: number
  /** 触发区尺寸(世界像素;缺省 32×32 = 2×2 tile) */
  width: number
  height: number
  /** 目标场景 id */
  target: string
  /** 到达点(目标场景世界像素) */
  tx: number
  ty: number
}

/** 缺省触发区边长:2 tile(边缘走廊横截面) */
const DEFAULT_ZONE_SIZE = 32

/**
 * 解析结果记忆化(review 修复,与组合根 interactionCache 同思路):地图对象
 * 入库后物件层不变(WORLD_MAPS 为模块级常量,测试各自 parseWorldMap 出新对象),
 * 同一地图只解析一次——世界导演的走入判定每帧调用 warpAt,不记忆化就会
 * 每 idle 帧重建触发区数组并重读物件层。坏条目抛错发生在记忆化之前,坏数据
 * 每次调用仍如实抛错(挡住坏数据流入组合根的哲学不变)。
 */
const warpsCache = new WeakMap<WorldMapData, WarpZone[]>()

/** 解析一张地图的全部出口(物件层顺序保持;坏条目即抛错;结果按图记忆化) */
export function warpsOf(map: WorldMapData): WarpZone[] {
  const cached = warpsCache.get(map)
  if (cached) return cached
  const out: WarpZone[] = []
  for (const obj of map.objects) {
    if (obj.type !== 'warp') continue
    const target = obj.properties['target']
    if (typeof target !== 'string' || target.length === 0) {
      throw new Error(`出口物件「${obj.name}」缺 target(目标场景 id)`)
    }
    const tx = obj.properties['tx']
    const ty = obj.properties['ty']
    if (typeof tx !== 'number' || !Number.isFinite(tx) || typeof ty !== 'number' || !Number.isFinite(ty)) {
      throw new Error(`出口物件「${obj.name}」的 tx/ty 必须是数(到达点)`)
    }
    const width = zoneSize(obj.properties['w'], obj.name)
    const height = zoneSize(obj.properties['h'], obj.name)
    // 物件点 = 触发区中心(物件层语义:point 物件只有锚点,尺寸走属性)
    out.push({
      x: obj.x - width / 2,
      y: obj.y - height / 2,
      width,
      height,
      target,
      tx,
      ty,
    })
  }
  warpsCache.set(map, out)
  return out
}

/** 玩家脚部点是否走入某出口触发区(半开矩形;按物件层顺序取第一个命中) */
export function warpAt(map: WorldMapData, px: number, py: number): WarpZone | null {
  for (const w of warpsOf(map)) {
    if (px >= w.x && px < w.x + w.width && py >= w.y && py < w.y + w.height) return w
  }
  return null
}

/** 出口走廊(半开矩形,world px):x ∈ [x0, x1)、y ∈ [y0, y1) */
export interface WarpCorridor {
  x0: number
  x1: number
  y0: number
  y1: number
}

/**
 * 出口走廊(票 #46):触发区向**最近图边**延伸出的矩形——树墙收边在此豁免
 * (出口视觉开口),土路沿走廊延伸出画。地图不变量(maps.test/worldMap.test)
 * 以此钉死「开口只开在出口」;接近浮签(warpHint)的锚点另取触发区几何。
 */
export function exitCorridorOf(map: WorldMapData, warp: WarpZone): WarpCorridor {
  const toLeft = warp.x
  const toRight = map.widthPx - (warp.x + warp.width)
  const toTop = warp.y
  const toBottom = map.heightPx - (warp.y + warp.height)
  const min = Math.min(toLeft, toRight, toTop, toBottom)
  if (min === toLeft) return { x0: 0, x1: warp.x, y0: warp.y, y1: warp.y + warp.height }
  if (min === toRight) return { x0: warp.x + warp.width, x1: map.widthPx, y0: warp.y, y1: warp.y + warp.height }
  if (min === toTop) return { x0: warp.x, x1: warp.x + warp.width, y0: 0, y1: warp.y }
  return { x0: warp.x, x1: warp.x + warp.width, y0: warp.y + warp.height, y1: map.heightPx }
}

function zoneSize(value: unknown, name: string): number {
  if (value === undefined) return DEFAULT_ZONE_SIZE
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`出口物件「${name}」的触发区尺寸必须是正数(现 ${String(value)})`)
  }
  return value
}
