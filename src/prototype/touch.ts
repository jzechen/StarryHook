/**
 * 触控原型(wayfinder #63,仅存在于 prototype/touch-schemes 分支,不并入 main)。
 *
 * 问题:移动端触控方案手感选型——虚拟摇杆+动作钮 / 点击目标移动+动作钮 / 混合;
 * 横屏交互;E 交互(钓位/交互点)在触屏上的映射。手感是唯一裁决标准。
 *
 * 形态:三变体挂在真实游戏上(sub-shape A),经 ?prototype=touch&variant=a|b|c
 * 启用,底部浮动条切换([ / ] 键盘亦可——←→ 已被移动占用);无该参数时
 * 组合根不构造本模块,输入路径逐位不变。方向分量只供方向(核心恒速),
 * 动作键复用既有 holding 通道(蓄力/交互语义与桌面端逐位一致)。
 *
 * 三变体的结构差异(不是换皮):
 * - A 固定摇杆:左下固定摇杆座 + 右下动作钮;画布点按无动作。
 * - B 点击移动:点哪走哪(直线,撞墙即停)+ 右下动作钮;无摇杆。
 * - C 混合:画布任意处按住拖动 = 浮现摇杆;轻点 = 交互点在范围内直接触发、
 *   否则走向该点/走向点击点;右下动作钮仍保留(蓄力抛竿的主手)。
 */

import type { CoreLoop } from '../core/coreLoop'
import type { MapId } from '../core/types'
import type { WorldDirector } from '../render/worldDirector'
import { computeCamera } from '../render/camera'
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../render/viewport'
import { WORLD_MAPS } from '../world/maps'
import {
  interactionLabel,
  nearestInteraction,
  parseInteractionSpots,
  type InteractionSpotDef,
} from '../world/interactions'

export interface TouchProtoDeps {
  canvas: HTMLCanvasElement
  core: CoreLoop
  director: WorldDirector
  /** URL ?variant= 原始值(a/b/c,未知按 a) */
  variant: string
  /** 已开面板(main 组合根注入):面板打开时控件全隐、输入全歇 */
  panelOpen: () => boolean
}

/** 每帧供给组合根的触控输入(方向已归一;holding = 动作钮/触发脉冲) */
export interface TouchSample {
  dx: number
  dy: number
  holding: boolean
}

interface VariantHandler {
  /** 画布 pointerdown:一律消费(返回 true),方案自行决定语义 */
  pointerDown: (e: PointerEvent) => void
  pointerMove: (e: PointerEvent) => void
  pointerUp: (e: PointerEvent) => void
  sample: () => TouchSample
  /** 切走时清态(摇杆归位/放弃目标) */
  reset: () => void
}

const VARIANTS = [
  { key: 'a', name: 'A · 虚拟摇杆 + 动作钮' },
  { key: 'b', name: 'B · 点击移动 + 动作钮' },
  { key: 'c', name: 'C · 混合(浮摇杆 + 点移/点交互)' },
] as const

/** 摇杆几何(手感调参都在这):死区与最大行程(像素) */
const JOY_MAX = 44
const JOY_DEAD = 10
/** 点移判定:距目标多近算到 / 撞墙放弃的连续帧数 */
const ARRIVE_PX = 6
const STUCK_FRAMES = 6

function el(tag: string, cls: string, parent: HTMLElement, text?: string): HTMLElement {
  const node = document.createElement(tag)
  node.className = cls
  if (text !== undefined) node.textContent = text
  parent.appendChild(node)
  return node
}

export function createTouchPrototype(deps: TouchProtoDeps): {
  pointerDown: (e: PointerEvent) => boolean
  sample: () => TouchSample
} {
  const { canvas, core, director, panelOpen } = deps
  canvas.style.touchAction = 'none'

  // —— DOM 覆盖层:切换条(底部中央)+ 状态行 + 控件层 + 竖屏提示 ——
  const style = document.createElement('style')
  style.textContent = `
    #touchproto-root { position: fixed; inset: 0; pointer-events: none; z-index: 2000;
      font-family: 'Fusion Pixel 12px Proportional SC', monospace; user-select: none; -webkit-user-select: none; }
    #touchproto-root * { box-sizing: border-box; }
    .tp-switch { position: fixed; left: 50%; bottom: max(10px, env(safe-area-inset-bottom)); transform: translateX(-50%);
      display: flex; align-items: center; gap: 8px; pointer-events: auto;
      background: rgba(20, 24, 18, 0.92); color: #f2e7cf; border: 1px solid #886644;
      border-radius: 999px; padding: 5px 10px; font-size: 13px; box-shadow: 0 2px 8px rgba(0,0,0,.5); }
    .tp-switch button { all: unset; cursor: pointer; padding: 2px 8px; color: #ffd77a; font-size: 14px; }
    .tp-switch button:active { color: #fff; }
    .tp-state { position: fixed; left: 50%; bottom: calc(max(10px, env(safe-area-inset-bottom)) + 72px);
      transform: translateX(-50%); pointer-events: none; color: #f2e7cf; font-size: 11px;
      text-shadow: 0 1px 2px rgba(0,0,0,.8); white-space: nowrap; }
    .tp-controls { position: fixed; inset: 0; display: none; }
    .tp-controls.on { display: block; }
    .tp-root.panel-open .tp-controls, .tp-root.panel-open .tp-marker { display: none !important; }
    .tp-joy { display: none; position: fixed; left: max(18px, env(safe-area-inset-left)); bottom: max(18px, env(safe-area-inset-bottom));
      width: 128px; height: 128px; border-radius: 50%; pointer-events: auto; touch-action: none;
      background: rgba(255,255,255,0.10); border: 2px solid rgba(255,255,255,0.35); }
    .tp-joy.on { display: block; }
    .tp-joy-knob { position: absolute; left: 50%; top: 50%; width: 54px; height: 54px; border-radius: 50%;
      background: rgba(255,255,255,0.45); border: 2px solid rgba(255,255,255,0.7); transform: translate(-50%,-50%); }
    .tp-joy.float { background: rgba(255,255,255,0.06); border-style: dashed; }
    .tp-btn { position: fixed; right: max(18px, env(safe-area-inset-right)); bottom: max(24px, env(safe-area-inset-bottom));
      width: 84px; height: 84px; border-radius: 50%; pointer-events: auto; touch-action: none;
      display: flex; align-items: center; justify-content: center; font-size: 17px; color: #f2e7cf;
      background: rgba(136, 102, 68, 0.85); border: 2px solid #ffd77a; box-shadow: 0 2px 8px rgba(0,0,0,.5); }
    .tp-btn.held { background: rgba(255, 215, 122, 0.9); color: #4a3423; }
    .tp-btn.dim { opacity: 0.45; }
    .tp-marker { position: fixed; width: 22px; height: 22px; border-radius: 50%;
      border: 2px solid #ffd77a; background: rgba(255,215,122,0.15); display: none;
      transform: translate(-50%,-50%); pointer-events: none; }
    .tp-portrait { display: none; position: fixed; inset: auto 0 0 0; text-align: center; padding: 6px;
      color: #ffd77a; font-size: 12px; text-shadow: 0 1px 2px rgba(0,0,0,.8); }
    @media (orientation: portrait) { .tp-portrait { display: block; } }
  `
  document.head.appendChild(style)
  const root = el('div', 'tp-root', document.body)
  root.id = 'touchproto-root'
  const stateLine = el('div', 'tp-state', root, '')
  const marker = el('div', 'tp-marker', root)
  const controls = el('div', 'tp-controls', root)
  // 方案 A 的固定摇杆与 C 的浮动摇杆共用一套节点(C 加 .float 且隐藏直到按住)
  const joyBase = el('div', 'tp-joy', controls)
  const joyKnob = el('div', 'tp-joy-knob', joyBase)
  const actionBtn = el('div', 'tp-btn', controls, '动作')
  const switchBar = el('div', 'tp-switch', root)
  const prevBtn = el('button', '', switchBar, '◀')
  const variantLabel = el('span', '', switchBar, '')
  const nextBtn = el('button', '', switchBar, '▶')
  el('span', '', switchBar, ' [ ] 切换')
  el('div', 'tp-portrait', root, '竖屏预览:请横屏试玩(手感以横屏为准)')

  // —— 几何换算(画布整数倍信箱 + 相机纯函数,与渲染层同一数学)——
  const cameraNow = () => {
    const map = WORLD_MAPS[director.mapId]
    return computeCamera(core.px, core.py, map.widthPx, map.heightPx, LOGICAL_WIDTH, LOGICAL_HEIGHT)
  }
  const screenToWorld = (clientX: number, clientY: number) => {
    const r = canvas.getBoundingClientRect()
    const s = r.width / LOGICAL_WIDTH
    const cam = cameraNow()
    return { x: (clientX - r.left) / s + cam.x, y: (clientY - r.top) / s + cam.y }
  }
  const worldToScreen = (wx: number, wy: number) => {
    const r = canvas.getBoundingClientRect()
    const s = r.width / LOGICAL_WIDTH
    const cam = cameraNow()
    return { x: r.left + (wx - cam.x) * s, y: r.top + (wy - cam.y) * s }
  }

  // —— 交互点解析(与组合根同源:按图惰性缓存)——
  const cache = new Map<MapId, readonly InteractionSpotDef[]>()
  const interactionsOf = (id: MapId): readonly InteractionSpotDef[] => {
    let list = cache.get(id)
    if (!list) {
      const map = WORLD_MAPS[id]
      list = parseInteractionSpots(map.objects, map.tileWidth)
      cache.set(id, list)
    }
    return list
  }

  // —— 共享输入状态 ——
  let actionHeld = false
  let actionPointerId: number | null = null
  let pulseFrames = 0 // 轻点触发:模拟一次动作键按下边沿(两帧 holding)
  let tapTarget: { x: number; y: number } | null = null
  let stuckFrames = 0
  let lastPx = core.px
  let lastPy = core.py

  const clearTarget = (): void => {
    tapTarget = null
    stuckFrames = 0
    lastPx = core.px
    lastPy = core.py
  }

  // —— 动作钮(三方案共用:右下大钮,holding 直供核心通道)——
  actionBtn.addEventListener('pointerdown', e => {
    e.preventDefault()
    actionHeld = true
    actionPointerId = e.pointerId
    actionBtn.classList.add('held')
  })
  const releaseAction = (e: PointerEvent): void => {
    if (actionPointerId !== null && e.pointerId !== actionPointerId) return
    actionHeld = false
    actionPointerId = null
    actionBtn.classList.remove('held')
  }

  // —— 摇杆状态(A 固定 / C 浮动,同一数学)——
  let joyPointerId: number | null = null
  let joyOrigin = { x: 0, y: 0 }
  let joyDir = { x: 0, y: 0 }
  let joyShown = false
  const joyBegin = (id: number, x: number, y: number): void => {
    joyPointerId = id
    joyOrigin = { x, y }
    joyDir = { x: 0, y: 0 }
    joyShown = true
    joyBase.classList.add('on')
    joyBase.style.left = `${x - 64}px`
    joyBase.style.top = `${y - 64}px`
    joyBase.style.bottom = 'auto'
    joyKnob.style.left = '50%'
    joyKnob.style.top = '50%'
  }
  const joyMove = (x: number, y: number): void => {
    let vx = x - joyOrigin.x
    let vy = y - joyOrigin.y
    const len = Math.hypot(vx, vy)
    if (len < JOY_DEAD) {
      joyDir = { x: 0, y: 0 }
    } else {
      const clamped = Math.min(len, JOY_MAX)
      joyDir = { x: (vx / len), y: (vy / len) }
      // 摇帽只走到钳制半径(方向已归一,长度只影响观感)
      vx = (vx / len) * clamped
      vy = (vy / len) * clamped
      joyKnob.style.left = `calc(50% + ${vx}px)`
      joyKnob.style.top = `calc(50% + ${vy}px)`
    }
  }
  const joyEnd = (): void => {
    joyPointerId = null
    joyDir = { x: 0, y: 0 }
    joyShown = false
    joyBase.style.left = ''
    joyBase.style.top = ''
    joyBase.style.bottom = ''
    joyKnob.style.left = '50%'
    joyKnob.style.top = '50%'
    if (active !== 0) joyBase.classList.remove('on') // C 的浮动摇杆松手即隐(A 常显)
  }
  // A:固定底座即摇杆本体;C:隐藏底座,按住浮现(.float)
  joyBase.addEventListener('pointerdown', e => {
    e.preventDefault()
    if (joyPointerId !== null) return
    const r = joyBase.getBoundingClientRect()
    joyPointerId = e.pointerId
    joyOrigin = { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    joyShown = true
    joyMove(e.clientX, e.clientY)
  })

  // —— 轻点语义(B:画布点按即移动;C:交互点范围内触发/否则走过去)——
  const onTap = (clientX: number, clientY: number): void => {
    if (panelOpen() || director.inputLocked || core.phase !== 'idle') return
    const w = screenToWorld(clientX, clientY)
    const hit = nearestInteraction(interactionsOf(director.mapId), w.x, w.y)
    if (hit) {
      const dist = Math.hypot(core.px - hit.x, core.py - hit.y)
      if (dist <= hit.radiusPx) {
        pulseFrames = 2 // 范围内:脉冲一次动作键(开面板/开箱/读叙物)
        clearTarget()
        return
      }
      clearTarget()
      tapTarget = { x: hit.x, y: hit.y } // 范围外:走向该交互点
      return
    }
    clearTarget()
    tapTarget = { x: w.x, y: w.y } // 地面:直线走过去(撞墙即停)
  }

  // —— 方案 C:画布按住拖动 = 浮现摇杆;未拖动的轻点 = onTap ——
  let dragPointerId: number | null = null
  let dragStart = { x: 0, y: 0 }
  let dragIsJoy = false

  // —— 三个方案 handler ——
  const handlerA: VariantHandler = {
    pointerDown: () => {}, // 画布点按无动作(摇杆与动作钮都在控件层)
    pointerMove: e => {
      if (e.pointerId === joyPointerId) joyMove(e.clientX, e.clientY)
    },
    pointerUp: e => {
      if (e.pointerId === joyPointerId) joyEnd()
      releaseAction(e)
    },
    sample: () => ({ dx: joyDir.x, dy: joyDir.y, holding: actionHeld || pulseFrames > 0 }),
    reset: () => joyEnd(),
  }
  const handlerB: VariantHandler = {
    pointerDown: e => onTap(e.clientX, e.clientY),
    pointerMove: () => {},
    pointerUp: e => releaseAction(e),
    sample: () => ({ dx: steer().x, dy: steer().y, holding: actionHeld || pulseFrames > 0 }),
    reset: () => clearTarget(),
  }
  const handlerC: VariantHandler = {
    pointerDown: e => {
      dragPointerId = e.pointerId
      dragStart = { x: e.clientX, y: e.clientY }
      dragIsJoy = false
    },
    pointerMove: e => {
      if (e.pointerId !== dragPointerId) return
      if (!dragIsJoy) {
        const moved = Math.hypot(e.clientX - dragStart.x, e.clientY - dragStart.y)
        if (moved > 12) {
          dragIsJoy = true
          joyBase.classList.add('float')
          joyBegin(e.pointerId, dragStart.x, dragStart.y)
        }
      }
      if (dragIsJoy) joyMove(e.clientX, e.clientY)
    },
    pointerUp: e => {
      if (e.pointerId === dragPointerId) {
        if (dragIsJoy) joyEnd()
        else onTap(e.clientX, e.clientY)
        joyBase.classList.remove('float')
        dragPointerId = null
        dragIsJoy = false
      }
      releaseAction(e)
    },
    sample: () => ({
      dx: joyShown ? joyDir.x : steer().x,
      dy: joyShown ? joyDir.y : steer().y,
      holding: actionHeld || pulseFrames > 0,
    }),
    reset: () => {
      joyEnd()
      joyBase.classList.remove('float')
      dragPointerId = null
      dragIsJoy = false
      clearTarget()
    },
  }

  /** 点移转向(B/C 共用):朝目标直线走,到了/撞墙即停(位移地面真值判挡) */
  const steer = (): { x: number; y: number } => {
    if (!tapTarget || panelOpen() || director.inputLocked || core.phase !== 'idle') {
      if (core.phase !== 'idle' || director.inputLocked) tapTarget = null
      return { x: 0, y: 0 }
    }
    const ddx = tapTarget.x - core.px
    const ddy = tapTarget.y - core.py
    const len = Math.hypot(ddx, ddy)
    if (len < ARRIVE_PX) {
      clearTarget()
      return { x: 0, y: 0 }
    }
    const moved = Math.hypot(core.px - lastPx, core.py - lastPy)
    if (moved < 0.3) {
      stuckFrames += 1
      if (stuckFrames >= STUCK_FRAMES) {
        clearTarget()
        return { x: 0, y: 0 }
      }
    } else {
      stuckFrames = 0
    }
    lastPx = core.px
    lastPy = core.py
    return { x: ddx / len, y: ddy / len }
  }

  // —— 方案切换(浮动条 + [ ] 键;URL 同步,刷新稳定)——
  let active = Math.max(0, VARIANTS.findIndex(v => v.key === deps.variant.toLowerCase()))
  const handlers = [handlerA, handlerB, handlerC]
  const apply = (): void => {
    handlers.forEach((h, i) => {
      if (i !== active) h.reset()
    })
    variantLabel.textContent = VARIANTS[active]!.name
    // 动作钮三方案常在;摇杆 A 常显 / B 无 / C 按住浮现(joyBegin/joyEnd 管 .on)
    controls.classList.add('on')
    joyBase.classList.toggle('on', active === 0)
    if (active === 0) {
      joyBase.classList.remove('float')
      joyBase.style.left = ''
      joyBase.style.top = ''
      joyBase.style.bottom = ''
    }
    const url = new URLSearchParams(location.search)
    url.set('prototype', 'touch')
    url.set('variant', VARIANTS[active]!.key)
    history.replaceState(null, '', `?${url.toString()}`)
  }
  const cycle = (step: number): void => {
    active = (active + step + VARIANTS.length) % VARIANTS.length
    apply()
  }
  prevBtn.addEventListener('click', () => cycle(-1))
  nextBtn.addEventListener('click', () => cycle(1))
  window.addEventListener('keydown', e => {
    if (e.code === 'BracketLeft') cycle(-1)
    if (e.code === 'BracketRight') cycle(1)
  })
  window.addEventListener('pointermove', e => handlers[active]!.pointerMove(e))
  window.addEventListener('pointerup', e => handlers[active]!.pointerUp(e))
  window.addEventListener('pointercancel', e => handlers[active]!.pointerUp(e))
  apply()

  // —— 每帧 DOM 刷新 + 状态外显(原型纪律:状态可见)——
  const sample = (): TouchSample => {
    if (pulseFrames > 0) pulseFrames -= 1
    const s = handlers[active]!.sample()
    const gated = panelOpen() || director.inputLocked
    root.classList.toggle('panel-open', panelOpen())
    // 动作钮浮签:范围内交互点的动作短词(钓位=「抛竿」,摊位=「商店」…)
    const near = !gated && core.phase === 'idle' ? nearestInteraction(interactionsOf(director.mapId), core.px, core.py) : null
    actionBtn.textContent = near ? interactionLabel(near.kind) : '动作'
    actionBtn.classList.toggle('dim', !near)
    // 点移目标标记:跟随世界坐标(相机滚动时标记跟着场景走)
    if (tapTarget) {
      const sp = worldToScreen(tapTarget.x, tapTarget.y)
      marker.style.left = `${sp.x}px`
      marker.style.top = `${sp.y}px`
      marker.style.display = 'block'
    } else {
      marker.style.display = 'none'
    }
    // 状态行:方案 / 方向 / holding / 目标 / 玩家世界坐标
    const t = tapTarget ? `(${Math.round(tapTarget.x)},${Math.round(tapTarget.y)})` : '—'
    stateLine.textContent =
      `方案 ${VARIANTS[active]!.key.toUpperCase()} · 方向(${s.dx.toFixed(1)},${s.dy.toFixed(1)}) · holding ${s.holding ? '是' : '否'} · 目标 ${t} · 玩家(${Math.round(core.px)},${Math.round(core.py)}) ${director.mapId}`
    return s
  }

  return {
    pointerDown: e => {
      handlers[active]!.pointerDown(e)
      return true // 触控原型启用期间,画布按下不再当作动作键(mouseHold)
    },
    sample,
  }
}
