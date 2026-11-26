import { Application, Container, Graphics, Sprite, Text, TilingSprite } from 'pixi.js'
import { TUNE } from '../config'
import type { CoreLoop } from '../core/coreLoop'
import type { FishDef, LoopPhase } from '../core/types'
import type { SceneTextures } from './textures'

/**
 * 池塘场景:PixiJS 薄壳,每帧从 CoreLoop 快照刷新。
 *
 * 架构(ADR-0002 精灵化):场景按「平铺背景 → 水体 → 水面特效 → 实体 → 覆盖 UI」
 * 分层,素材经 textures.ts 切片后以精灵/平铺精灵呈现。本票先打通管线:
 * 岸块与水面走真实贴图(图集两帧交替 = 波光动画,即后续实体帧动画的同款路径);
 * 玩家/小游戏等其余实体暂留几何绘制,后续票逐个换皮。
 *
 * 坐标系:画布固定 480×270 逻辑分辨率(视口层已做整数倍信箱缩放),
 * 所有尺寸按逻辑像素取值,不再跟随窗口尺寸。
 */

/** 水面两帧交替周期(秒)——与占位图集的两帧波光配套 */
const WATER_FRAME_PERIOD = 0.55

/** 浮标渲染侧微调量(贴图 8×12,锚点居中) */
const BOBBER_FX = {
  /** 鱼线系点相对浮标中心的偏移 */
  lineAnchorY: -4,
  /** 抛竿飞行的相对抬升 */
  castLift: 42,
  /** 等待中随波起伏幅度 */
  idleBob: 2,
  /** 咬钩下沉量 */
  biteDip: 4,
  /** 抛竿起飞点相对竿尖的抬高 */
  castStartLift: 12,
}

export class PondScene {
  private app: Application
  private textures: SceneTextures
  // —— 分层容器:自下而上 = 背景 → 水体 → 特效 → 实体 → 覆盖 UI ——
  private world = new Container()
  private bankTiling: TilingSprite
  private pondFill = new Graphics()
  private waterTiling: TilingSprite
  private pondStroke = new Graphics()
  private ripples = new Graphics()
  private line = new Graphics()
  private chargeBar = new Graphics()
  private player = new Container()
  private body = new Graphics()
  private head = new Graphics()
  private bobberSprite = new Container()
  private bang: Text
  private track = new Graphics()
  private mgBar = new Graphics()
  private mgFish = new Graphics()
  private mgProgress = new Graphics()

  private prevPhase: LoopPhase = 'idle'
  /** 抛竿飞行动画进度 0..1 */
  private castT = 1
  private biteT = 0

  constructor(app: Application, textures: SceneTextures) {
    this.app = app
    this.textures = textures

    // 背景:草地岸块全屏平铺(真实贴图)
    this.bankTiling = new TilingSprite({
      texture: textures.grassTile,
      width: app.screen.width,
      height: app.screen.height,
    })

    // 水面:池塘矩形内平铺水面贴图(真实贴图),两帧交替出波光
    const P = TUNE.pond
    const pondW = (P.x1 - P.x0) * app.screen.width
    const pondH = (P.y1 - P.y0) * app.screen.height
    this.waterTiling = new TilingSprite({ texture: textures.waterFrames[0], width: pondW, height: pondH })
    this.waterTiling.position.set(P.x0 * app.screen.width, P.y0 * app.screen.height)

    this.bang = new Text({
      text: '!',
      style: {
        fontFamily: 'sans-serif',
        fontSize: 22,
        fontWeight: '900',
        fill: 0xffd23f,
        stroke: { color: 0x5a3e00, width: 3 },
      },
    })
    this.bang.anchor.set(0.5)
    this.bang.visible = false

    // 浮标:图集切片精灵(管线验证实体),位置仍由核心状态驱动
    const bobber = new Sprite(textures.bobber)
    bobber.anchor.set(0.5)
    this.bobberSprite.addChild(bobber)

    app.stage.addChild(this.world)
    this.world.addChild(
      this.bankTiling,
      this.pondFill,
      this.waterTiling,
      this.pondStroke,
      this.ripples,
      this.line,
      this.chargeBar,
      this.player,
      this.bobberSprite,
      this.bang,
      this.track,
      this.mgBar,
      this.mgFish,
      this.mgProgress,
    )
    this.player.addChild(this.body, this.head)
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

    // 水面波光:图集两帧按周期交替(后续帧动画同路径)
    this.waterTiling.texture = this.textures.waterFrames[Math.floor(t / WATER_FRAME_PERIOD) % 2]

    // 池塘底色与描边(岸线贴图替换留待场景票)
    this.pondFill
      .rect(P.x0 * W, P.y0 * H, (P.x1 - P.x0) * W, (P.y1 - P.y0) * H)
      .fill(0x17506b)
    this.pondStroke
      .rect(P.x0 * W, P.y0 * H, (P.x1 - P.x0) * W, (P.y1 - P.y0) * H)
      .stroke({ width: 4, color: 0x0f3a4d })

    // 玩家(几何小人,位置来自核心状态;尺寸按 480×270 逻辑分辨率取值)
    this.body.clear().circle(0, 0, 8).fill(0x4a6da7)
    this.head.clear().circle(0, -9, 5.5).fill(0xf0c8a0)
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
      const sy = oy - BOBBER_FX.castStartLift
      bx = ox + (tx - ox) * e
      by = sy + (ty - sy) * e - Math.sin(Math.PI * this.castT) * BOBBER_FX.castLift
    }
    if (core.phase === 'waiting') by += Math.sin(t * 2.4) * BOBBER_FX.idleBob
    if (core.phase === 'bite') by += BOBBER_FX.biteDip + Math.sin(this.biteT * 30) * 4
    this.bobberSprite.visible = showBobber
    if (showBobber) {
      this.bobberSprite.position.set(bx, by)
    }

    // 鱼线
    this.line.clear()
    if (showBobber) {
      this.line
        .moveTo(ppx, ppy - 13)
        .lineTo(bx, by + BOBBER_FX.lineAnchorY)
        .stroke({ width: 1, color: 0xe8f4f8, alpha: 0.55 })
    }

    // 涟漪
    this.ripples.clear()
    if (showBobber && core.phase !== 'minigame') {
      for (let i = 0; i < 3; i++) {
        const p = (t * 0.55 + i / 3) % 1
        const r = 3 + p * 18
        this.ripples.ellipse(bx, by, r, r * 0.42).stroke({ width: 1, color: 0x9fd8e8, alpha: 0.45 * (1 - p) })
      }
    }

    // 蓄力条(满格刻度;尺寸按逻辑分辨率)
    this.chargeBar.clear()
    if (core.phase === 'charging') {
      const barX = ppx + 14
      const barW = 8
      const barH = 40
      const barBottom = ppy - 12
      this.chargeBar.rect(barX, barBottom - barH, barW, barH).fill({ color: 0x0b1f12, alpha: 0.55 })
      const fh = (barH - 2) * core.power
      const full = core.power >= 1
      const c = full ? 0x8ef07a : core.power < 0.45 ? 0xe4573d : core.power < 0.8 ? 0xf2c94c : 0x7bc95f
      this.chargeBar.roundRect(barX + 1.5, barBottom - 1 - fh, barW - 3, fh, 2).fill(c)
      this.chargeBar.rect(barX - 1, barBottom - barH - 2, barW + 2, 2).fill(0xeaf4f6)
    }

    // 咬钩 "!"
    this.bang.visible = core.phase === 'bite'
    if (this.bang.visible) {
      const s = 1.2 + 0.25 * Math.max(0, 1 - this.biteT / 0.1)
      this.bang.scale.set(s)
      this.bang.position.set(bx, by - 26)
    }

    // 钓鱼小游戏面板(右侧;暂留几何绘制,换皮属后续票)
    const mgVisible = core.phase === 'minigame'
    this.track.visible = mgVisible
    this.mgBar.visible = mgVisible
    this.mgFish.visible = mgVisible
    this.mgProgress.visible = mgVisible
    if (mgVisible && core.mg && core.fish) {
      const mg = core.mg
      const trackX = W - 40
      const trackW = 26
      const trackH = Math.min(H * 0.72, 460)
      const trackY = (H - trackH) / 2
      this.track
        .clear()
        .roundRect(trackX, trackY, trackW, trackH, 6)
        .fill({ color: 0x0c2f3f, alpha: 0.88 })
        .stroke({ width: 1.5, color: 0x9fd8e8, alpha: 0.5 })
      const innerX = trackX + 3
      const innerY = trackY + 3
      const innerW = trackW - 6
      const innerH = trackH - 6

      // 绿条(高度跟随当前竿参数,与物理同源:核心循环 rodParams 即绿条物理所用参数)
      const bar = core.rodParams
      const barPixH = bar.height * innerH
      const barTop = innerY + innerH - (mg.barY + bar.height) * innerH
      this.mgBar.clear().roundRect(innerX, barTop, innerW, barPixH, 2).fill({ color: 0x6ee06e, alpha: 0.85 })

      // 鱼图标
      this.drawFish(core.fish, trackX + trackW / 2, innerY + innerH - mg.fishY * innerH)

      // 进度条
      const pgX = trackX - 10
      const pgW = 5
      const fillH = Math.max(1, mg.progress * innerH)
      const pc = mg.progress > 0.5 ? 0x6ee06e : mg.progress > 0.25 ? 0xf2c94c : 0xe4573d
      this.mgProgress
        .clear()
        .roundRect(pgX, innerY, pgW, innerH, 2)
        .fill({ color: 0x0c2f3f, alpha: 0.7 })
        .roundRect(pgX, innerY + innerH - fillH, pgW, fillH, 2)
        .fill(pc)
    }
  }

  private drawFish(f: FishDef, cx: number, cy: number): void {
    const g = this.mgFish
    g.clear()
    switch (f.shape) {
      case 'slim':
        g.ellipse(cx, cy, 9, 3.5)
        break
      case 'round':
        g.circle(cx, cy, 5.5)
        break
      case 'heavy':
        g.roundRect(cx - 6.5, cy - 4.5, 13, 9, 4)
        break
      case 'puff':
        g.circle(cx, cy, 6.5)
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2
          g.circle(cx + Math.cos(a) * 7.5, cy + Math.sin(a) * 7.5, 1.6)
        }
        break
      case 'bolt':
        g.poly([cx + 7.5, cy, cx - 5, cy - 5, cx - 2, cy, cx - 5, cy + 5])
        break
    }
    g.fill(f.color)
    g.circle(cx + 2.5, cy - 1, 0.9).fill(0x113244)
  }
}
