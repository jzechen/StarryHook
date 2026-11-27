import { isKnownMapId, SCENE_NAMES } from './maps'
import type { MapId } from '../core/types'
import { warpsOf, type WarpZone } from './warps'
import type { WorldMapData } from './worldMap'

/**
 * 出口接近浮签(票 #46,spec 术语「出口」:场景边缘有视觉开口与路径指引):
 * 走近出口区域出现被动浮签「东 · 河谷 →」——无键帽、**非交互点**:不新增
 * InteractionKind、不进动作键意图裁决(stallPressAction),与交互浮签链并行
 * 供给(组合根:有交互签则不出本签,二者不叠加)。
 *
 * 纯函数「数据 → 文案与锚点」:方向与箭头由触发区几何推导(区中心在图东半 =
 * 东/→,西半 = 西/←),场景名取 SCENE_NAMES;接近判定 = 脚部点到触发区矩形
 * 的欧氏距离(与交互点半径同款纪律)。显隐时机(idle ∧ 无面板 ∧ 非过场)归
 * 组合根与渲染层,不在本模块。
 */

/** 接近半径(world px;3 tile——触发区外一圈,走入触发区即过场,签只剩接近段可见) */
export const WARP_HINT_REACH_PX = 48

/** 出口接近浮签(锚点 = 浮标基点,渲染层在其上方悬停;label 含方向与箭头) */
export interface WarpHint {
  readonly x: number
  readonly y: number
  readonly label: string
}

/** 玩家脚部点 (px,py) → 距离最近的出口接近签;半径外 = null */
export function warpHintAt(map: WorldMapData, px: number, py: number): WarpHint | null {
  let best: WarpZone | null = null
  let bestDist = Infinity
  for (const w of warpsOf(map)) {
    const dx = Math.max(w.x - px, 0, px - (w.x + w.width))
    const dy = Math.max(w.y - py, 0, py - (w.y + w.height))
    const dist = Math.hypot(dx, dy)
    if (dist <= WARP_HINT_REACH_PX && dist < bestDist) {
      best = w
      bestDist = dist
    }
  }
  if (!best || !isKnownMapId(best.target)) return null
  const east = best.x + best.width / 2 >= map.widthPx / 2
  // 锚点向图内让位一格半:出口贴图边,浮签居中会让箭头伸出画面被裁
  const nudge = (east ? -1 : 1) * map.tileWidth * 1.5
  return {
    x: best.x + best.width / 2 + nudge,
    y: best.y + best.height / 2,
    label: `${east ? '东' : '西'} · ${SCENE_NAMES[best.target as MapId]} ${east ? '→' : '←'}`,
  }
}
