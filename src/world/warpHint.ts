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
 * 纯函数「数据 → 文案与锚点」:方向与箭头由触发区**最近图边**推导——先判
 * 垂直/水平边(与 exitCorridorOf 同款最小值序:左/右/上/下),左/右 = 西/东
 * (←/→),上/下 = 北/南(↑/↓),出口不止左右边;场景名取 SCENE_NAMES;
 * 接近判定 = 脚部点到触发区矩形的欧氏距离(与交互点半径同款纪律)。显隐时机
 * (idle ∧ 无面板 ∧ 非过场)归组合根与渲染层,不在本模块。
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
  // 最近图边(与 exitCorridorOf 同款最小值序:左/右/上/下,平局取先判者):
  // 先判垂直/水平边再标方向与让位轴——出口不止左右边,北/南边的方向、箭头
  // 与锚点让位都走纵轴
  const toLeft = best.x
  const toRight = map.widthPx - (best.x + best.width)
  const toTop = best.y
  const toBottom = map.heightPx - (best.y + best.height)
  const min = Math.min(toLeft, toRight, toTop, toBottom)
  const name = SCENE_NAMES[best.target as MapId]
  // 锚点沿出口边法线向图内让位一格半:出口贴图边,浮签居中会让箭头/签面伸出画面被裁
  const nudge = map.tileWidth * 1.5
  if (min === toLeft) {
    return { x: best.x + best.width / 2 + nudge, y: best.y + best.height / 2, label: `西 · ${name} ←` }
  }
  if (min === toRight) {
    return { x: best.x + best.width / 2 - nudge, y: best.y + best.height / 2, label: `东 · ${name} →` }
  }
  if (min === toTop) {
    return { x: best.x + best.width / 2, y: best.y + best.height / 2 + nudge, label: `北 · ${name} ↑` }
  }
  return { x: best.x + best.width / 2, y: best.y + best.height / 2 - nudge, label: `南 · ${name} ↓` }
}
