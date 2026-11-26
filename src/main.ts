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

  let holding = false
  app.canvas.addEventListener('pointerdown', e => {
    e.preventDefault()
    holding = true
  })
  window.addEventListener('pointerup', () => {
    holding = false
  })
  window.addEventListener('pointercancel', () => {
    holding = false
  })

  app.ticker.add(tk => {
    const dt = Math.min(tk.deltaMS / 1000, 0.05) // 钳制大帧,防止切后台跳变
    core.update(dt, holding)
    scene.update(core, tk.lastTime / 1000, dt)
    hud.update(core)
  })
}

main().catch(err => {
  document.body.textContent = `启动失败:${err instanceof Error ? err.message : String(err)}`
})
