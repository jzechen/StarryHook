import { Application, Container, Graphics, Text } from 'pixi.js'
import { TUNE } from '../config'
import type { CoreLoop } from '../core/coreLoop'
import type { FishDef, LoopPhase } from '../core/types'

/**
 * 池塘场景:PixiJS 薄壳,每帧从 CoreLoop 快照重绘。
 * 全部几何图形,零素材依赖。
 */
export class PondScene {
  private app: Application
  private world = new Container()
  private bank = new Graphics()
  private pond = new Graphics()
  private ripples = new Graphics()
  private line = new Graphics()
  private chargeBar = new Graphics()
  private player = new Container()
  private body = new Graphics()
  private head = new Graphics()
  private bobber = new Container()
  private bobberG = new Graphics()
  private bang: Text
  private track = new Graphics()
  private mgBar = new Graphics()
  private mgFish = new Graphics()
  private mgProgress = new Graphics()

  private prevPhase: LoopPhase = 'idle'
  /** 抛竿飞行动画进度 0..1 */
  private castT = 1
  private biteT = 0

  constructor(app: Application) {
    this.app = app
    this.bang = new Text({
      text: '!',
      style: {
        fontFamily: 'sans-serif',
        fontSize: 64,
        fontWeight: '900',
        fill: 0xffd23f,
        stroke: { color: 0x5a3e00, width: 7 },
      },
    })
    this.bang.anchor.set(0.5)
    this.bang.visible = false

    app.stage.addChild(this.world)
    this.world.addChild(
      this.bank,
      this.pond,
      this.ripples,
      this.line,
      this.chargeBar,
      this.player,
      this.bobber,
      this.bang,
      this.track,
      this.mgBar,
      this.mgFish,
      this.mgProgress,
    )
    this.player.addChild(this.body, this.head)
    this.bobber.addChild(this.bobberG)
  }

  update(core: CoreLoop, t: number, dt: number): void {
    const W = this.app.screen.width
    const H = this.app.screen.height
    const P = TUNE.pond
    const ppx = core.px * W
    const ppy = core.py * H

    // 阶段切换检测(渲染侧动画计时)
    if (core.phase !== this.prevPhase) {
      if (core.phase === 'waiting') this.castT = 0
      if (core.phase === 'bite') this.biteT = 0
      this.prevPhase = core.phase
    }
    this.castT = Math.min(1, this.castT + dt / 0.22)
    this.biteT += dt

    // 池塘
    this.bank.clear().rect(0, 0, W, H).fill(0x2c3b2a)
    this.pond
      .roundRect(P.x0 * W, P.y0 * H, (P.x1 - P.x0) * W, (P.y1 - P.y0) * H, 40)
      .fill(0x17506b)
      .stroke({ width: 8, color: 0x0f3a4d })

    // 玩家(几何小人,位置来自核心状态)
    this.body.clear().circle(0, 0, 15).fill(0x4a6da7)
    this.head.clear().circle(0, -16, 10).fill(0xf0c8a0)
    this.player.position.set(ppx, ppy)

    // 浮标落点:从抛竿点向池塘中心,远近由蓄力决定
    const ox = core.castX * W
    const oy = core.castY * H
    const cx = ((P.x0 + P.x1) / 2) * W
    const cy = ((P.y0 + P.y1) / 2) * H
    const k = 0.3 + 0.5 * core.bobberDist
    const tx = Math.max((P.x0 + 0.03) * W, Math.min((P.x1 - 0.03) * W, ox + (cx - ox) * k))
    const ty = Math.max((P.y0 + 0.06) * H, Math.min((P.y1 - 0.06) * H, oy + (cy - oy) * k))
    const showBobber = core.phase !== 'idle' && core.phase !== 'charging'
    let bx = tx
    let by = ty
    if (this.castT < 1 && showBobber) {
      const e = this.castT * (2 - this.castT)
      const sy = oy - 24
      bx = ox + (tx - ox) * e
      by = sy + (ty - sy) * e - Math.sin(Math.PI * this.castT) * 42
    }
    if (core.phase === 'waiting') by += Math.sin(t * 2.4) * 2
    if (core.phase === 'bite') by += 4 + Math.sin(this.biteT * 30) * 4
    this.bobber.visible = showBobber
    if (showBobber) {
      this.bobberG.clear().circle(0, -4, 6).fill(0xe4573d).circle(0, 3, 6).fill(0xf4f4f4)
      this.bobber.position.set(bx, by)
    }

    // 鱼线
    this.line.clear()
    if (showBobber) {
      this.line.moveTo(ppx, ppy - 18).lineTo(bx, by - 4).stroke({ width: 1.2, color: 0xe8f4f8, alpha: 0.55 })
    }

    // 涟漪
    this.ripples.clear()
    if (showBobber && core.phase !== 'minigame') {
      for (let i = 0; i < 3; i++) {
        const p = (t * 0.55 + i / 3) % 1
        const r = 8 + p * 42
        this.ripples.ellipse(bx, by, r, r * 0.42).stroke({ width: 1.5, color: 0x9fd8e8, alpha: 0.45 * (1 - p) })
      }
    }

    // 蓄力条(加大,带满格刻度)
    this.chargeBar.clear()
    if (core.phase === 'charging') {
      this.chargeBar.roundRect(ppx + 34, ppy - 104, 14, 88, 6).fill({ color: 0x0b1f12, alpha: 0.55 })
      const fh = 80 * core.power
      const full = core.power >= 1
      const c = full ? 0x8ef07a : core.power < 0.45 ? 0xe4573d : core.power < 0.8 ? 0xf2c94c : 0x7bc95f
      this.chargeBar.roundRect(ppx + 36, ppy - 24 - fh, 10, fh, 4).fill(c)
      this.chargeBar.roundRect(ppx + 32, ppy - 108, 18, 3, 1).fill(0xeaf4f6)
    }

    // 咬钩 "!"
    this.bang.visible = core.phase === 'bite'
    if (this.bang.visible) {
      const s = 1.2 + 0.25 * Math.max(0, 1 - this.biteT / 0.1)
      this.bang.scale.set(s)
      this.bang.position.set(bx, by - 56)
    }

    // 钓鱼小游戏面板(右侧)
    const mgVisible = core.phase === 'minigame'
    this.track.visible = mgVisible
    this.mgBar.visible = mgVisible
    this.mgFish.visible = mgVisible
    this.mgProgress.visible = mgVisible
    if (mgVisible && core.mg && core.fish) {
      const mg = core.mg
      const trackX = W - 92
      const trackW = 48
      const trackH = Math.min(H * 0.72, 460)
      const trackY = (H - trackH) / 2
      this.track
        .clear()
        .roundRect(trackX, trackY, trackW, trackH, 12)
        .fill({ color: 0x0c2f3f, alpha: 0.88 })
        .stroke({ width: 2, color: 0x9fd8e8, alpha: 0.5 })
      const innerX = trackX + 5
      const innerY = trackY + 5
      const innerW = trackW - 10
      const innerH = trackH - 10

      // 绿条(高度跟随当前竿参数,与物理同源:核心循环 rodParams 即绿条物理所用参数)
      const bar = core.rodParams
      const barPixH = bar.height * innerH
      const barTop = innerY + innerH - (mg.barY + bar.height) * innerH
      this.mgBar.clear().roundRect(innerX, barTop, innerW, barPixH, 5).fill({ color: 0x6ee06e, alpha: 0.85 })

      // 鱼图标
      this.drawFish(core.fish, trackX + trackW / 2, innerY + innerH - mg.fishY * innerH)

      // 进度条
      const pgX = trackX - 20
      const pgW = 10
      const fillH = Math.max(2, mg.progress * innerH)
      const pc = mg.progress > 0.5 ? 0x6ee06e : mg.progress > 0.25 ? 0xf2c94c : 0xe4573d
      this.mgProgress
        .clear()
        .roundRect(pgX, innerY, pgW, innerH, 5)
        .fill({ color: 0x0c2f3f, alpha: 0.7 })
        .roundRect(pgX, innerY + innerH - fillH, pgW, fillH, 4)
        .fill(pc)
    }
  }

  private drawFish(f: FishDef, cx: number, cy: number): void {
    const g = this.mgFish
    g.clear()
    switch (f.shape) {
      case 'slim':
        g.ellipse(cx, cy, 17, 7)
        break
      case 'round':
        g.circle(cx, cy, 11)
        break
      case 'heavy':
        g.roundRect(cx - 13, cy - 9, 26, 18, 8)
        break
      case 'puff':
        g.circle(cx, cy, 13)
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2
          g.circle(cx + Math.cos(a) * 15, cy + Math.sin(a) * 15, 3.2)
        }
        break
      case 'bolt':
        g.poly([cx + 15, cy, cx - 10, cy - 10, cx - 4, cy, cx - 10, cy + 10])
        break
    }
    g.fill(f.color)
    g.circle(cx + 5, cy - 2, 1.8).fill(0x113244)
  }
}
