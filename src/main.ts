import { Application } from 'pixi.js'
import { CoreLoop } from './core/coreLoop'
import { Rng } from './core/rng'
import { PondScene } from './render/pondScene'
import { Hud } from './ui/hud'

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
    scene.update(core, tk.lastTime / 1000, dt)
    hud.update(core)
  })
}

main().catch(err => {
  document.body.textContent = `启动失败:${err instanceof Error ? err.message : String(err)}`
})
