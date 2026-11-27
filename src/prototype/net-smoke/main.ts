/**
 * [PROTOTYPE · 抛弃式] 联机手感冒烟 · 双标签页最小回路(票 #66)。永不并 main。
 *
 * 回答的问题:钉定 #64 的数字基线(下行 frame 20Hz / 上行 pos·input 30Hz /
 * 插值缓冲 ~100ms)经实玩裁决三件事——
 *   ① 客人自己小游戏的输入手感(0.45s 咬钩窗 vs 单向延迟)
 *   ② 远端角色双快照线性插值观感
 *   ③ 行内 outcome 回执延迟(卖鱼)
 *
 * 架构忠实度:复用真 CoreLoop 三实例(房主竿 / 房主侧客人竿 / 客人本地移动
 * 积分器)+ 真 catchBar 物理与 TUNE 常数 + 真 characterMotion 行走姿态 +
 * 真角色/鱼/浮标贴图;客人小游戏全程房主权威、客端纯镜像(含垂钓锁移动的
 * 镜像相位执行,#64 口径)。传输 = BroadcastChannel stub + 出方向可调人为
 * 延迟;世界 = 单屏草地 + 一钓位;经济 = 计数器(正确性归 #62 已决,本原型
 * 只量回执延迟)。不做断线/信令/存档/音频/触控(#63 已裁)。
 *
 * 运行:pnpm dev → 同一浏览器开两个并排窗口(后台标签页被节流,读数失真):
 *   /net-smoke.html?role=host   房主
 *   /net-smoke.html?role=guest  客人
 */
import '@fontsource/fusion-pixel-12px-proportional-sc'
import { Application, Container, Graphics, Sprite, Text, TilingSprite } from 'pixi.js'
import { TUNE } from '../../config'
import { CoreLoop } from '../../core/coreLoop'
import { FISH } from '../../core/fishCatalog'
import type { Facing, LoopPhase } from '../../core/types'
import { Rng } from '../../core/rng'
import { DEFAULT_AREA } from '../../core/waterAreas'
import { advanceWalkPhase, breathPose, walkBobOffset } from '../../render/characterMotion'
import { loadSceneTextures, type SceneTextures } from '../../render/textures'
import { applyViewportToCanvas } from '../../render/viewport'
import { RemoteAvatar, StubTransport, type FrameState, type WorldState } from './net'

const W = 480
const H = 270
const SPOT = { x: 380, y: 200 }
const SPOT_RADIUS = 24
const CHANNEL = 'starryhook-net-smoke'

// —— DOM 小工具(原型不抽象,直接堆) ——

function el(tag: string, css: string, parent?: HTMLElement): HTMLElement {
  const e = document.createElement(tag)
  e.style.cssText = css
  if (parent) parent.appendChild(e)
  return e
}

function toast(text: string, ok: boolean): void {
  const t = el(
    'div',
    `background:rgba(12,30,20,.92);color:${ok ? '#bde58a' : '#f2a08a'};padding:4px 10px;` +
      `border:1px solid #4a5d43;border-radius:6px;font:13px 'Fusion Pixel 12px Proportional SC',monospace;` +
      `margin-top:4px;transition:opacity .4s`,
    toastsEl,
  )
  t.textContent = text
  window.setTimeout(() => (t.style.opacity = '0'), 2200)
  window.setTimeout(() => t.remove(), 2700)
}

const toastsEl = el(
  'div',
  'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:30;display:flex;' +
    'flex-direction:column;align-items:center;pointer-events:none',
  document.body,
)

const metricsEl = el(
  'div',
  'position:fixed;top:8px;left:8px;z-index:20;background:rgba(8,14,10,.85);color:#cfe8c8;' +
    "padding:8px 10px;border-radius:8px;font:12px/1.55 ui-monospace,monospace;white-space:pre;min-width:270px",
  document.body,
)
const tuneEl = el(
  'div',
  'position:fixed;top:8px;right:8px;z-index:20;background:rgba(8,14,10,.85);color:#cfe8c8;' +
    "padding:8px 10px;border-radius:8px;font:12px/1.5 ui-monospace,monospace",
  document.body,
)
const verdictEl = el(
  'div',
  'position:fixed;bottom:8px;left:50%;transform:translateX(-50%);z-index:20;background:rgba(8,14,10,.85);' +
    "color:#e8d9a0;padding:6px 12px;border-radius:8px;font:12px/1.5 'Fusion Pixel 12px Proportional SC',monospace",
  document.body,
)

function slider(label: string, min: number, max: number, value: number, onInput: (v: number) => void): HTMLElement {
  const row = el('div', 'margin:2px 0', tuneEl)
  const lab = el('span', 'display:inline-block;width:118px', row)
  const inp = el('input', 'width:90px;vertical-align:middle', row) as HTMLInputElement
  const val = el('span', 'display:inline-block;width:52px;text-align:right', row)
  inp.type = 'range'
  inp.min = String(min)
  inp.max = String(max)
  inp.value = String(value)
  const refresh = (): void => {
    val.textContent = `${inp.value}ms`
    lab.textContent = label
  }
  inp.addEventListener('input', () => {
    onInput(Number(inp.value))
    refresh()
  })
  refresh()
  return inp
}

// —— 角色渲染(真贴图 + 真 characterMotion 姿态;结构沿 worldScene:容器原点 = 脚部) ——

function makeCharacter(tex: SceneTextures) {
  const c = new Container()
  const shadow = new Graphics()
  shadow.ellipse(0, 1, 5, 2).fill({ color: 0x000000, alpha: 0.3 })
  const body = new Sprite(tex.playerFrames.down[0]!)
  body.anchor.set(0.5, 1)
  c.addChild(shadow, body)
  let phase = 0
  return {
    container: c,
    step(x: number, y: number, facing: Facing, moving: boolean, dt: number): void {
      c.position.set(Math.round(x), Math.round(y))
      phase = advanceWalkPhase(phase, moving ? TUNE.move.speed * dt : 0)
      const frame = Math.floor(phase) % 4
      const pose = moving
        ? { dy: walkBobOffset(phase), scaleY: 1, rotation: 0 }
        : breathPose(performance.now() / 1000)
      body.texture = tex.playerFrames[facing][frame]!
      body.position.y = pose.dy
      body.scale.set(1, pose.scaleY)
      body.rotation = pose.rotation
    },
  }
}

/** 蓄力条(挂角色头顶;房主本地即时,客人为网络镜像态) */
function makeChargeBar(parent: Container) {
  const g = new Graphics()
  parent.addChild(g)
  return {
    show(power: number): void {
      g.visible = power > 0
      g.clear().rect(-10, -26, 20 * power, 3).fill(0xf2c94c)
    },
  }
}

/** 浮标 + 咬钩 "!" + 窗口余量条 */
function makeRodFx(tex: SceneTextures, parent: Container) {
  const bobber = new Sprite(tex.bobber)
  bobber.anchor.set(0.5, 0.5)
  bobber.visible = false
  const bang = new Text({
    text: '!',
    style: { fontSize: 16, fill: 0xffffff, stroke: { color: 0x000000, width: 4 } },
  })
  bang.anchor.set(0.5, 1)
  bang.visible = false
  const windowBar = new Graphics()
  windowBar.visible = false
  parent.addChild(bobber, bang, windowBar)
  return {
    update(b: { x: number; y: number } | null, isBang: boolean, biteLeft: number): void {
      bobber.visible = b !== null
      if (b) {
        bobber.position.set(Math.round(b.x), Math.round(b.y))
        bang.visible = isBang
        bang.position.set(Math.round(b.x), Math.round(b.y) - 14)
        windowBar.visible = isBang
        windowBar
          .clear()
          .rect(b.x - 10, b.y + 6, 20 * Math.max(0, biteLeft / TUNE.bite.windowMax), 2)
          .fill(0xffffff)
      } else {
        bang.visible = false
        windowBar.visible = false
      }
    },
  }
}

/** 小游戏面板(几何逐位沿 worldScene:右侧屏空间轨道;状态由供给方决定——本地即时或网络镜像) */
function makeMgPanel(parent: Container, tex: SceneTextures) {
  const track = new Graphics()
  const bar = new Graphics()
  const prog = new Graphics()
  const fish = new Sprite(tex.fishFrames[FISH[0]!.id][0]!)
  fish.anchor.set(0.5, 0.5)
  parent.addChild(track, bar, prog, fish)
  const trackX = W - 40
  const trackW = 26
  const trackH = Math.min(H * 0.72, 460)
  const trackY = (H - trackH) / 2
  const innerX = trackX + 3
  const innerY = trackY + 3
  const innerW = trackW - 6
  const innerH = trackH - 6
  let visible = false
  return {
    update(
      state: { barY: number; fishY: number; progress: number; fishId: string; barHeight: number } | null,
      t: number,
    ): void {
      visible = state !== null
      track.visible = bar.visible = prog.visible = fish.visible = visible
      if (!state) return
      track
        .clear()
        .roundRect(trackX, trackY, trackW, trackH, 6)
        .fill({ color: 0x0c2f3f, alpha: 0.88 })
        .stroke({ width: 1.5, color: 0x9fd8e8, alpha: 0.5 })
      const barPixH = state.barHeight * innerH
      const barTop = innerY + innerH - (state.barY + state.barHeight) * innerH
      bar.clear().roundRect(innerX, barTop, innerW, barPixH, 2).fill({ color: 0x6ee06e, alpha: 0.85 })
      fish.texture = tex.fishFrames[state.fishId]![Math.floor(t * 4) % 2]!
      fish.position.set(trackX + trackW / 2, innerY + innerH - state.fishY * innerH)
      const fillH = Math.max(1, state.progress * innerH)
      const pc = state.progress > 0.5 ? 0x6ee06e : state.progress > 0.25 ? 0xf2c94c : 0xe4573d
      prog.clear().roundRect(trackX - 10, innerY, 5, innerH, 2).fill({ color: 0x0c2f3f, alpha: 0.8 })
      prog.roundRect(trackX - 10, innerY + innerH - fillH, 5, fillH, 2).fill(pc)
    },
  }
}

function buildWorld(stage: Container, tex: SceneTextures): void {
  stage.addChild(new TilingSprite({ texture: tex.grassTile, width: W, height: H }))
  const pond = new Graphics()
  pond.roundRect(320, 150, 130, 95, 10).fill({ color: 0x2e6f8e, alpha: 0.95 })
  pond.roundRect(320, 150, 130, 95, 10).stroke({ width: 1.5, color: 0x9fd8e8, alpha: 0.6 })
  const ring = new Graphics().circle(SPOT.x, SPOT.y, SPOT_RADIUS).stroke({ width: 1, color: 0xffe08a, alpha: 0.9 })
  const label = new Text({
    text: '钓位',
    style: { fontSize: 9, fill: 0xffe08a, fontFamily: 'monospace' },
  })
  label.position.set(SPOT.x - 9, SPOT.y - 36)
  stage.addChild(pond, ring, label)
}

// —— 输入聚合(沿 main.ts 三等效口径:动作 = E ∨ 空格 ∨ 按住;移动 = WASD/方向键) ——

function inputAgg(canvas: HTMLCanvasElement): { holding: () => boolean; move: () => { x: number; y: number } } {
  const keys = new Set<string>()
  let mouseHold = false
  canvas.addEventListener('pointerdown', e => {
    e.preventDefault()
    mouseHold = true
  })
  window.addEventListener('pointerup', () => (mouseHold = false))
  window.addEventListener('pointercancel', () => (mouseHold = false))
  window.addEventListener('keydown', e => {
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault()
    keys.add(e.code)
  })
  window.addEventListener('keyup', e => keys.delete(e.code))
  window.addEventListener('blur', () => {
    keys.clear()
    mouseHold = false
  })
  return {
    holding: () => mouseHold || keys.has('Space') || keys.has('KeyE'),
    move: () => {
      let x = 0
      let y = 0
      if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1
      if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1
      if (keys.has('KeyS') || keys.has('ArrowDown')) y += 1
      if (keys.has('KeyW') || keys.has('ArrowUp')) y -= 1
      if (x !== 0 || y !== 0) {
        const len = Math.hypot(x, y)
        x /= len
        y /= len
      }
      return { x, y }
    },
  }
}

// —— 共用:竿相 → 浮标位(抛竿点 + 朝向延伸,演出粗化,不为视觉正确性负责) ——

function rodBobber(loop: CoreLoop): { x: number; y: number } | null {
  const vis = loop.phase === 'waiting' || loop.phase === 'bite' || loop.phase === 'caught' || loop.phase === 'escaped'
  if (!vis) return null
  const d = 6 + 16 * loop.bobberDist
  const dx = loop.facing === 'left' ? -1 : loop.facing === 'right' ? 1 : 0
  const dy = loop.facing === 'up' ? -1 : loop.facing === 'down' ? 1 : 0
  return { x: loop.castX + dx * d, y: loop.castY + dy * d }
}

function nearSpot(px: number, py: number): boolean {
  return Math.hypot(px - SPOT.x, py - SPOT.y) <= SPOT_RADIUS
}

/** 调参面板:出站延迟(本方向)/插值缓冲/帧率/上行率 + 延迟预设 */
function tunePanel(opts: {
  transport: StubTransport
  avatar: RemoteAvatar
  onRates: (frameHz: number, posHz: number) => void
}): void {
  el('div', 'font-weight:bold;margin-bottom:4px', tuneEl).textContent = '调参(本窗出站延迟 = 下方滑条)'
  slider('发送延迟(本窗出站)', 0, 200, 30, v => (opts.transport.outboundDelayMs = v))
  slider('插值缓冲(本窗远端)', 0, 250, 100, v => (opts.avatar.bufferMs = v))
  const hzRow = el('div', 'margin:4px 0 2px', tuneEl)
  const frameInp = el('input', 'width:52px', hzRow) as HTMLInputElement
  const posInp = el('input', 'width:52px;margin-left:6px', hzRow) as HTMLInputElement
  frameInp.type = posInp.type = 'number'
  frameInp.min = posInp.min = '5'
  frameInp.max = posInp.max = '60'
  frameInp.value = '20'
  posInp.value = '30'
  const applyRates = (): void => opts.onRates(Number(frameInp.value), Number(posInp.value))
  frameInp.addEventListener('input', applyRates)
  posInp.addEventListener('input', applyRates)
  el('span', 'font-size:11px;opacity:.8', hzRow).textContent = ' Hz(帧/上行)'
  const presets = el('div', 'margin-top:6px', tuneEl)
  presets.textContent = '延迟预设:'
  for (const p of [0, 15, 30, 60, 100, 150]) {
    const b = el('button', 'margin:2px 3px;padding:1px 7px;font:12px ui-monospace;cursor:pointer', presets)
    b.textContent = String(p)
    b.addEventListener('click', () => (opts.transport.outboundDelayMs = p))
  }
}

async function boot(): Promise<void> {
  const role = new URLSearchParams(location.search).get('role') === 'guest' ? 'guest' : 'host'
  const seed = Number(new URLSearchParams(location.search).get('seed')) || 20261127
  document.title = `联机感冒烟 · ${role === 'host' ? '房主' : '客人'}`
  verdictEl.textContent =
    '裁决(逐步加大延迟预设直到不可接受):① 客人小游戏手感(0.45s 咬钩窗) ② 远端角色插值观感 ③ 卖鱼回执延迟'
  if (role === 'guest') {
    const sell = el(
      'button',
      'position:fixed;right:12px;bottom:44px;z-index:20;padding:8px 14px;font:14px \'Fusion Pixel 12px Proportional SC\',monospace;cursor:pointer',
      document.body,
    )
    sell.textContent = '卖鱼(行内回执)'
    sell.addEventListener('click', () => sellFn())
  }

  const app = new Application()
  await app.init({ width: W, height: H, background: '#2c3b2a', antialias: false, resolution: 1, autoDensity: true })
  document.getElementById('game')!.appendChild(app.canvas)
  const refit = (): void => applyViewportToCanvas(app.canvas, window.innerWidth, window.innerHeight)
  refit()
  window.addEventListener('resize', refit)

  const tex = await loadSceneTextures()
  buildWorld(app.stage, tex)

  const transport = new StubTransport(CHANNEL)
  const input = inputAgg(app.canvas)
  let sellFn: () => void = () => {}

  // ================================================================ 房主
  if (role === 'host') {
    const hostLoop = new CoreLoop(new Rng(seed))
    const guestLoop = new CoreLoop(new Rng(seed + 7777)) // 客人竿:房主侧第二实例
    hostLoop.setWater(DEFAULT_AREA)
    hostLoop.px = 80
    hostLoop.py = 150
    guestLoop.px = 120 // 客人出生点:村舍一侧(#64 口径,原型取位)
    guestLoop.py = 135
    guestLoop.setWater(DEFAULT_AREA)
    hostLoop.setInteractionSource(() => (nearSpot(hostLoop.px, hostLoop.py) ? { kind: 'spot' } : null))
    guestLoop.setInteractionSource(() => (nearSpot(guestLoop.px, guestLoop.py) ? { kind: 'spot' } : null))
    // [PROTOTYPE] 冒烟测试钩子(抛弃式,不入 spec)
    ;(window as unknown as Record<string, unknown>).__smoke = {
      hostPhase: () => hostLoop.phase,
      guestPhase: () => guestLoop.phase,
      guestPx: () => guestLoop.px,
      remoteHolding: () => remoteHolding,
      latestPos: () => latestPos,
    }

    const hostChar = makeCharacter(tex)
    const guestChar = makeCharacter(tex)
    app.stage.addChild(guestChar.container, hostChar.container)
    const hostFx = makeRodFx(tex, app.stage)
    const guestFx = makeRodFx(tex, app.stage)
    const hostCharge = makeChargeBar(hostChar.container)
    const guestCharge = makeChargeBar(guestChar.container)
    const mgPanel = makeMgPanel(app.stage, tex)

    // 客人接入态与最小经济计数器
    let guestPresent = false
    let guestFish = 0
    let coins = 0
    let remoteHolding = false
    let latestPos = { x: 120, y: 135, facing: 'down' as Facing, ts: 0 }
    const guestView = new RemoteAvatar() // 房主渲染客人角色(30Hz pos 流插值)
    // 上行计量
    let posCount = 0
    let inputCount = 0
    let frameHz = 20
    let prevGuestPhase: LoopPhase = guestLoop.phase
    let hostSettledToasted = false

    transport.onMessage = m => {
      if (m.type === 'hello') {
        // 至多一位客人(#64 房间语义);客人刷新重连 = 新 hello 顶替旧会话
        guestPresent = true
        guestFish = 3 // 见面礼:给客人可卖之鱼
        transport.send('welcome', { coins, guestFish })
      } else if (m.type === 'pos') {
        const p = m.payload as { x: number; y: number; facing: Facing }
        latestPos = { ...p, ts: m.ts }
        guestView.push({ t: m.ts, x: p.x, y: p.y, facing: p.facing })
        posCount++
      } else if (m.type === 'input') {
        remoteHolding = (m.payload as { holding: boolean }).holding
        inputCount++
      } else if (m.type === 'ping') {
        transport.send('pong', m.payload)
      } else if (m.type === 'intent') {
        const p = m.payload as { kind: string; ts: number }
        if (p.kind === 'sell') {
          const ok = guestFish > 0
          if (ok) {
            guestFish--
            coins += 10
          }
          transport.send('world', { coins, guestFish })
          transport.send('event', { kind: 'outcome', ok, text: ok ? `卖出 1 条,+10 金币` : '包里没有鱼', ts: p.ts })
        }
      }
    }

    let frameAcc = 0
    let prevHost = { x: hostLoop.px, y: hostLoop.py }
    let metricAcc = 0
    let posRate = 0
    let inputRate = 0

    app.ticker.add(tk => {
      const dt = Math.min(tk.deltaMS / 1000, 0.05)
      const t = tk.lastTime / 1000

      // 房主本地输入 → 房主竿(零延迟参照系:同窗对比客人手感)
      const mv = input.move()
      hostLoop.update(dt, { holding: input.holding(), moveX: mv.x, moveY: mv.y })

      // 客人竿:网络位置覆盖 + 电平输入(边沿由核心推导,#64 口径),移动零输入
      guestLoop.px = latestPos.x
      guestLoop.py = latestPos.y
      guestLoop.facing = latestPos.facing
      guestLoop.update(dt, { holding: remoteHolding, moveX: 0, moveY: 0 })

      // 客人捕获沿:渔获入会话包(#62 分流)+ toast 事件
      if (guestLoop.phase !== prevGuestPhase) {
        if (guestLoop.phase === 'caught' && guestLoop.fish) {
          guestFish++
          transport.send('world', { coins, guestFish })
          transport.send('event', { kind: 'toast', ok: true, text: `客人钓到:${guestLoop.fish.name}`, ts: 0 })
        } else if (guestLoop.phase === 'escaped') {
          transport.send('event', { kind: 'toast', ok: false, text: '客人脱钩', ts: 0 })
        }
        prevGuestPhase = guestLoop.phase
      }
      // 房主自己的结算 toast(本地即时参照)
      if (hostLoop.phase === 'caught' && hostLoop.fish) {
        // 结算停留期持续可见即可:直接 toast 会刷屏,借 phase 边沿简单去重
        if (!hostSettledToasted) {
          toast(`房主钓到:${hostLoop.fish.name}`, true)
          hostSettledToasted = true
        }
      } else if (hostLoop.phase !== 'caught') hostSettledToasted = false

      // 下行 frame 节奏(20Hz 基线)
      frameAcc += dt
      const frameMin = 1 / frameHz
      while (frameAcc >= frameMin) {
        frameAcc -= frameMin
        const g = guestLoop
        transport.send('frame', {
          ts: Date.now(),
          hostX: hostLoop.px,
          hostY: hostLoop.py,
          hostFacing: hostLoop.facing,
          hostBobber: rodBobber(hostLoop),
          guestRod: {
            phase: g.phase,
            power: g.phase === 'charging' ? g.power : 0,
            bobber: rodBobber(g),
            bang: g.phase === 'bite',
            biteLeft: g.phase === 'bite' ? g.biteWindow : 0,
            mg:
              g.phase === 'minigame' && g.mg && g.fish
                ? { barY: g.mg.barY, fishY: g.mg.fishY, progress: g.mg.progress, fishId: g.fish.id }
                : null,
          },
          guestScore: g.score,
        })
      }

      // 渲染:房主即时;客人走插值
      const movedH = Math.hypot(hostLoop.px - prevHost.x, hostLoop.py - prevHost.y)
      prevHost = { x: hostLoop.px, y: hostLoop.py }
      hostChar.step(hostLoop.px, hostLoop.py, hostLoop.facing, movedH > 0.1, dt)
      hostFx.update(rodBobber(hostLoop), hostLoop.phase === 'bite', hostLoop.biteWindow)
      hostCharge.show(hostLoop.phase === 'charging' ? hostLoop.power : 0)
      mgPanel.update(
        hostLoop.phase === 'minigame' && hostLoop.mg && hostLoop.fish
          ? {
              barY: hostLoop.mg.barY,
              fishY: hostLoop.mg.fishY,
              progress: hostLoop.mg.progress,
              fishId: hostLoop.fish.id,
              barHeight: hostLoop.rodParams.height,
            }
          : null,
        t,
      )
      const s = guestView.sample(Date.now())
      guestChar.container.visible = s.ok && guestPresent
      if (s.ok) guestChar.step(s.x, s.y, s.facing as Facing, s.moving, dt)
      const rod = guestLoop
      guestFx.update(rodBobber(rod), rod.phase === 'bite', rod.biteWindow)
      guestCharge.show(rod.phase === 'charging' ? rod.power : 0)

      // 指标(4Hz 刷新 DOM)
      metricAcc += dt
      if (metricAcc >= 0.25) {
        posRate = posCount / metricAcc
        inputRate = inputCount / metricAcc
        posCount = inputCount = 0
        metricAcc = 0
        guestView.resetCounters()
        const r = Math.round
        metricsEl.textContent =
          `房主 · [PROTOTYPE #66]\n` +
          `房主得分 ${hostLoop.score}   客人得分 ${guestLoop.score}\n` +
          `金币 ${coins}   客人包 ${guestFish} 条\n` +
          `下行:帧 ${frameHz}Hz(设定)   上行:pos ${r(posRate)}/s  input ${r(inputRate)}/s\n` +
          `本窗出站延迟 ${transport.outboundDelayMs}ms(= 客人看到的下行)\n` +
          `客人 pos 延迟龄 ${r(Math.max(0, Date.now() - latestPos.ts))}ms\n` +
          `客人插值:深度 ${guestView.depth}  饥饿 ${guestView.starved}/0.25s  吸附 ${guestView.snapped}\n` +
          `客人在线 ${guestPresent ? '√' : '×'}(等待 hello)`
      }
    })
    tunePanel({ transport, avatar: guestView, onRates: f => (frameHz = f) })
    toast('房主就绪:WASD 移动,钓位处按住 E 蓄力钓鱼', true)
    return
  }

  // ================================================================ 客人
  const moveLoop = new CoreLoop(new Rng(seed + 555)) // 仅作本地移动积分器(交互源恒 null,永不抛竿)
  moveLoop.setWater(DEFAULT_AREA)
  moveLoop.px = 120
  moveLoop.py = 135
  moveLoop.setInteractionSource(() => null)
  // [PROTOTYPE] 冒烟测试钩子(抛弃式,不入 spec)
  ;(window as unknown as Record<string, unknown>).__smoke = {
    ownX: () => moveLoop.px,
    ownY: () => moveLoop.py,
    ownHolding: () => input.holding(),
    rodPhase: () => latestFrame?.guestRod.phase ?? 'idle',
  }

  const ownChar = makeCharacter(tex)
  const hostChar = makeCharacter(tex)
  app.stage.addChild(hostChar.container, ownChar.container)
  const hostFx = makeRodFx(tex, app.stage)
  const ownFx = makeRodFx(tex, app.stage)
  const ownCharge = makeChargeBar(ownChar.container)
  const mgPanel = makeMgPanel(app.stage, tex)

  // (transport 沿用上文:两角色分支互斥,各自实例化后仅一方存活)
  const hostView = new RemoteAvatar() // 客人渲染房主角色(20Hz frame 流插值)
  const guestId = `g${Math.floor(Math.random() * 1e6)}`
  let welcomed = false
  let world: WorldState = { coins: 0, guestFish: 0 }
  let latestFrame: FrameState | null = null
  let frameHz = 20
  let posHz = 30
  let rtt = 0
  let receiptRtt = 0
  const receiptHistory: number[] = []
  let frameCount = 0
  let frameRate = 0

  transport.onMessage = m => {
    if (m.type === 'welcome') {
      welcomed = true
      world = m.payload as WorldState
    } else if (m.type === 'world') {
      world = m.payload as WorldState
    } else if (m.type === 'frame') {
      latestFrame = m.payload as FrameState
      hostView.push({ t: m.ts, x: latestFrame.hostX, y: latestFrame.hostY, facing: latestFrame.hostFacing })
      frameCount++
    } else if (m.type === 'pong') {
      rtt = Date.now() - (m.payload as { ts: number }).ts
    } else if (m.type === 'event') {
      const p = m.payload as { kind: string; ok: boolean; text: string; ts: number }
      if (p.kind === 'outcome') {
        receiptRtt = Date.now() - p.ts
        receiptHistory.unshift(receiptRtt)
        if (receiptHistory.length > 5) receiptHistory.pop()
        toast(p.text, p.ok)
      } else if (p.kind === 'toast') {
        toast(p.text, p.ok)
      }
    }
  }

  const hello = (): void => transport.send('hello', { guestId, appearance: 0 })
  hello()
  const helloTimer = window.setInterval(() => {
    if (!welcomed) hello()
  }, 800)

  sellFn = () => {
    if (!welcomed) return
    transport.send('intent', { kind: 'sell', ts: Date.now() })
  }

  tunePanel({ transport, avatar: hostView, onRates: (f, p) => ((frameHz = f), (posHz = p)) })

  let posAcc = 0
  let pingAcc = 0
  let metricAcc = 0
  let prevOwn = { x: moveLoop.px, y: moveLoop.py }

  app.ticker.add(tk => {
    const dt = Math.min(tk.deltaMS / 1000, 0.05)
    const now = Date.now()

    // 移动本地权威;垂钓锁移动按镜像相位执行(#64:RTT 级滑窗接受——
    // 按下抛竿后,锁移动要等 frame 回来才生效,这段「还在走」就是要体感的东西)
    const rodPhase = latestFrame?.guestRod.phase ?? 'idle'
    const locked = rodPhase !== 'idle'
    const mv = input.move()
    moveLoop.update(dt, { holding: input.holding(), moveX: locked ? 0 : mv.x, moveY: locked ? 0 : mv.y })

    // 上行 30Hz:pos + input(holding 电平,边沿由房主推导)
    posAcc += dt
    const posMin = 1 / posHz
    while (posAcc >= posMin) {
      posAcc -= posMin
      transport.send('pos', { mapId: 'stub', x: moveLoop.px, y: moveLoop.py, facing: moveLoop.facing })
      transport.send('input', { holding: input.holding() })
    }
    pingAcc += dt
    if (pingAcc >= 0.5) {
      pingAcc = 0
      transport.send('ping', { ts: Date.now() })
    }

    // 渲染:自己即时;房主走插值;自己的竿相/小游戏 = 网络镜像(延迟本体,裁决①)
    const moved = Math.hypot(moveLoop.px - prevOwn.x, moveLoop.py - prevOwn.y)
    prevOwn = { x: moveLoop.px, y: moveLoop.py }
    ownChar.step(moveLoop.px, moveLoop.py, moveLoop.facing, moved > 0.1, dt)
    const s = hostView.sample(now)
    hostChar.container.visible = s.ok && welcomed
    if (s.ok) hostChar.step(s.x, s.y, s.facing as Facing, s.moving, dt)
    hostFx.update(latestFrame?.hostBobber ?? null, false, 0)
    const rod = latestFrame?.guestRod ?? null
    ownFx.update(rod?.bobber ?? null, rod?.bang ?? false, rod?.biteLeft ?? 0)
    ownCharge.show(rod?.phase === 'charging' ? rod.power : 0)
    mgPanel.update(
      rod?.mg ? { ...rod.mg, barHeight: TUNE.bar.height } : null,
      tk.lastTime / 1000,
    )

    // 指标(4Hz)
    metricAcc += dt
    if (metricAcc >= 0.25) {
      frameRate = frameCount / metricAcc
      frameCount = 0
      metricAcc = 0
      hostView.resetCounters()
      const r = Math.round
      const loopLatency = rtt + 1000 / frameHz // 实测:RTT≈上下行单向和 + 信道,加一帧间隔 = 客人手感回路
      const frameAge = latestFrame ? r(Math.max(0, now - latestFrame.ts)) : '—'
      metricsEl.textContent =
        `客人 · [PROTOTYPE #66]\n` +
        `我的得分 ${latestFrame?.guestScore ?? 0}   金币 ${world.coins}   包 ${world.guestFish} 条\n` +
        `RTT ${r(rtt)}ms(≈2×单向)   操控回路≈上+下+帧=${r(loopLatency)}ms\n` +
        `本窗出站(上行)延迟 ${transport.outboundDelayMs}ms   缓冲 ${hostView.bufferMs}ms\n` +
        `下行帧 ${r(frameRate)}/s(设定 ${frameHz}Hz)   帧龄 ${frameAge}ms\n` +
        `房主插值:深度 ${hostView.depth}  饥饿 ${hostView.starved}/0.25s  吸附 ${hostView.snapped}\n` +
        `回执 RTT ${r(receiptRtt)}ms   近5次 ${receiptHistory.map(r).join('/') || '—'}\n` +
        (welcomed ? '已接入房间' : '等待房主…(房主开着吗?)')
    }
  })

  window.addEventListener('beforeunload', () => {
    window.clearInterval(helloTimer)
    transport.close()
  })
}

boot().catch(err => {
  document.body.textContent = `原型启动失败:${err instanceof Error ? err.message : String(err)}`
})
