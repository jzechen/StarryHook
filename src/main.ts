import { Application } from 'pixi.js'
import { CollectionStore, type KvStorage } from './core/collection'
import { CoreLoop } from './core/coreLoop'
import { FISH } from './core/fishCatalog'
import { ProgressionStore } from './core/progression'
import { Rng } from './core/rng'
import type { LoopPhase } from './core/types'
import { PondScene } from './render/pondScene'
import { CollectionPanel } from './ui/collectionPanel'
import { collectionToasts, snapshotOf } from './ui/collectionToastPolicy'
import { Hud } from './ui/hud'
import { ToastLayer } from './ui/toastLayer'

/** 浏览器 localStorage 适配器:读写两侧都吞异常(隐私模式/配额),游戏不受影响 */
function localStorageKv(): KvStorage {
  return {
    get: key => {
      try {
        return localStorage.getItem(key)
      } catch {
        return null
      }
    },
    set: (key, value) => {
      try {
        localStorage.setItem(key, value)
      } catch {
        // 写入失败不影响游戏
      }
    },
  }
}

async function main(): Promise<void> {
  // ?seed=123 可复现整局(调手感时对比用)
  const params = new URLSearchParams(location.search)
  const seed = Number(params.get('seed')) || (Date.now() % 2147483647)

  const app = new Application()
  await app.init({
    resizeTo: window,
    background: '#2c3b2a',
    antialias: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
  })
  document.getElementById('game')!.appendChild(app.canvas)

  const core = new CoreLoop(new Rng(seed))
  const scene = new PondScene(app)
  const hud = new Hud(() => core.resetSession())
  const seedEl = document.getElementById('seed')
  if (seedEl) seedEl.textContent = `seed ${seed}`

  // 收集册:捕获自动登记,跨会话持久(隐私模式下写入失败自动降级为内存收集)
  const storage = localStorageKv()
  const collection = new CollectionStore(FISH.map(f => f.id), storage)
  // 成长:经验/等级/竿,独立键名跨会话持久;启动时从恢复的等级注入当前竿参数
  const progression = new ProgressionStore(storage)
  core.setRodParams(progression.rod().params)
  // 图鉴面板:只读消费收集册,入口常驻(可用性随阶段变化)
  const collectionPanel = new CollectionPanel(collection)
  // 轻提示层:新收录 / 池塘大满贯,顶部居中,不拦截游戏输入
  const toasts = new ToastLayer()
  let prevPhase: LoopPhase = core.phase

  // —— 输入:鼠标/触摸 + 键盘(空格 = 起竿,WASD/方向键 = 移动) ——
  const keys = new Set<string>()
  let mouseHold = false

  app.canvas.addEventListener('pointerdown', e => {
    e.preventDefault()
    mouseHold = true
  })
  window.addEventListener('pointerup', () => {
    mouseHold = false
  })
  window.addEventListener('pointercancel', () => {
    mouseHold = false
  })
  window.addEventListener('keydown', e => {
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault()
    keys.add(e.code)
  })
  window.addEventListener('keyup', e => {
    keys.delete(e.code)
  })
  window.addEventListener('blur', () => {
    keys.clear()
    mouseHold = false
  })

  app.ticker.add(tk => {
    const dt = Math.min(tk.deltaMS / 1000, 0.05) // 钳制大帧,防止切后台跳变

    // 移动方向:x 分量按宽高比折算,保证斜走速度均匀
    let dx = 0
    let dy = 0
    if (keys.has('KeyD') || keys.has('ArrowRight')) dx += 1
    if (keys.has('KeyA') || keys.has('ArrowLeft')) dx -= 1
    if (keys.has('KeyS') || keys.has('ArrowDown')) dy += 1
    if (keys.has('KeyW') || keys.has('ArrowUp')) dy -= 1
    if (dx !== 0 || dy !== 0) {
      const len = Math.hypot(dx, dy)
      dx = dx / len / (window.innerWidth / window.innerHeight)
      dy = dy / len
    }

    core.update(dt, { holding: mouseHold || keys.has('Space'), moveX: dx, moveY: dy })
    // 结算捕获 → 登记进收集册与成长(两系统无耦合,核心循环自身不感知)。
    // 顺序不可换:先读捕获前快照 → 登记 → 再读快照 → 按纯函数决策弹提示
    if (core.phase === 'caught' && prevPhase !== 'caught' && core.fish) {
      const fishId = core.fish.id
      const before = snapshotOf(collection, fishId)
      collection.recordCatch(fishId)
      const decision = collectionToasts(before, snapshotOf(collection, fishId))
      if (decision.newEntry) toasts.show('new-entry')
      if (decision.grandSlam) {
        toasts.show('grand-slam')
        // 一辈子只弹一次:弹出的同时置持久化标记,重开/刷新后不再弹
        collection.acknowledgeCompletion()
      }
      // 成长:按捕获分值登记经验(非幂等,每次都加);竿档变化 → 注入新参数
      const progress = progression.recordCatch(core.fish.score)
      if (progress.rodUnlocked) core.setRodParams(progress.rodUnlocked.params)
    }
    prevPhase = core.phase
    scene.update(core, tk.lastTime / 1000, dt)
    hud.update(core)
    // 图鉴面板:入口可用性、自动收起、进度刷新(打开时核心循环照常推进)
    collectionPanel.update(core)
  })
}

main().catch(err => {
  document.body.textContent = `启动失败:${err instanceof Error ? err.message : String(err)}`
})
