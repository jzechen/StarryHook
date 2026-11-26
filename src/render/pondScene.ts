import { Application, Container, Graphics, Sprite, Text, TilingSprite } from 'pixi.js'
import { TUNE } from '../config'
import type { CoreLoop } from '../core/coreLoop'
import type { LoopPhase, WaterAreaId } from '../core/types'
import { DEFAULT_AREA } from '../core/waterAreas'
import { AREA_PALETTES } from './areaPalette'
import type { Facing, SceneTextures, WaveEdge } from './textures'
import { FISH_FRAME_COUNT, PLAYER_FRAME_COUNT, TILE, WAVE_FRAME_COUNT, WATER_FRAME_COUNT } from './textures'

/**
 * 池塘场景:PixiJS 薄壳,每帧从 CoreLoop 快照刷新。
 *
 * 架构(ADR-0002 精灵化,换皮票 #10):场景按「平铺背景 → 水体 → 岸线波纹 →
 * 水面特效 → 实体 → 覆盖 UI」分层,素材经 textures.ts 切片后以精灵/平铺精灵呈现。
 * 水面 = 13 帧流水循环;岸线 = 泡沫动画沿池边顺时针环流(逐 tile 相位偏移,
 * 波峰像浪一样绕池游走);角色 = 16x16 四向行走精灵,方向由渲染侧对比
 * 前后帧 px/py 位移向量推导(核心零改动),静止播放待机帧。
 * 小游戏鱼图标 = 鱼精灵图集 2 帧交替(票 #11);面板其余几何绘制换皮属后续票。
 *
 * 坐标系:画布固定 480×270 逻辑分辨率(视口层已做整数倍信箱缩放),
 * 所有尺寸按逻辑像素取值,不再跟随窗口尺寸。
 */

/** 流水帧轮换周期(秒)——13 帧一轮约 2s,读作缓慢水流 */
const WATER_FRAME_PERIOD = 0.15
/** 岸线波纹帧轮换周期(秒)——8 帧一轮 2.4s,浪涌节奏 */
const WAVE_FRAME_PERIOD = 0.3
/** 行走动画帧周期(秒)——4 帧一轮,配合移动速度读作小碎步 */
const WALK_FRAME_PERIOD = 0.14
/** 小游戏鱼精灵帧周期(秒)——2 帧交替,读作挣扎摆尾(票 #11) */
const FISH_FRAME_PERIOD = 0.2
/** 判定「在移动」的每帧最小位移(逻辑像素) */
const MOVE_EPS = 0.1
/** 角色脚底相对核心坐标点(ppy)的偏移:贴图底边落在原身体下缘 */
const PLAYER_FOOT_OFFSET = 7
/** 波纹贴片土侧宽度:tile 内泡沫带起点距 tile 边缘的像素数 */
const WAVE_LAND_SIDE = 6
/** 波纹超出池边的最大距离(掩膜余量,允许浪 wash 上岸) */
const WAVE_MASK_MARGIN = 8

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

/** 岸线波纹贴片:沿池边一圈排布,phase 决定它在环流中的帧偏移 */
interface WaveTile {
  sprite: Sprite
  edge: WaveEdge
  phase: number
}

export class PondScene {
  private app: Application
  private textures: SceneTextures
  // —— 分层容器:自下而上 = 背景 → 水体 → 岸线波纹 → 特效 → 实体 → 覆盖 UI ——
  private world = new Container()
  private bankTiling: TilingSprite
  /** 池塘底色(静态几何:构造期绘制一次,见构造函数内的泄漏说明) */
  private pondFill = new Graphics()
  private waterTiling: TilingSprite
  /** 池塘描边(静态几何:构造期绘制一次) */
  private pondStroke = new Graphics()
  /** 最近一次应用的水域色调(变化才重设 tint,票 #15) */
  private renderedArea: WaterAreaId | null = null
  private waveLayer = new Container()
  private waveTiles: WaveTile[] = []
  private ripples = new Graphics()
  private line = new Graphics()
  private chargeBar = new Graphics()
  private player = new Container()
  private playerSprite: Sprite
  private bobberSprite = new Container()
  private bang: Text
  private track = new Graphics()
  private mgBar = new Graphics()
  /** 小游戏鱼精灵:图集切片 2 帧交替(替代原 Graphics 几何鱼,配色来自贴图本身) */
  private mgFishSprite: Sprite
  private mgProgress = new Graphics()

  private prevPhase: LoopPhase = 'idle'
  /** 抛竿飞行动画进度 0..1 */
  private castT = 1
  private biteT = 0
  // —— 角色动画状态(渲染侧自推导,不回写核心) ——
  private facing: Facing = 'down'
  /** 行走动画计时;静止时归零回到待机帧 */
  private walkT = 0
  private prevPx = -1
  private prevPy = -1

  constructor(app: Application, textures: SceneTextures) {
    this.app = app
    this.textures = textures

    const W = app.screen.width
    const H = app.screen.height

    // 背景:草地岸块全屏平铺(OGA 素材)
    this.bankTiling = new TilingSprite({
      texture: textures.grassTile,
      width: W,
      height: H,
    })

    // 水面:池塘矩形内平铺流动水贴图(13 帧循环,见 update)
    const P = TUNE.pond
    const px0 = P.x0 * W
    const py0 = P.y0 * H
    const pondW = (P.x1 - P.x0) * W
    const pondH = (P.y1 - P.y0) * H
    this.waterTiling = new TilingSprite({ texture: textures.waterFrames[0], width: pondW, height: pondH })
    this.waterTiling.position.set(px0, py0)

    // 池塘底色与描边:静态几何,构造期只画一次(底色与流水贴图同源,平铺边缘不露馅)。
    // 不能挪进 update:Pixi v8 Graphics 指令列表只增不减,每帧重画且不 clear 会让
    // 指令数/内存随游玩时长线性增长(泄漏守护见 pondScene.test.ts)。
    // 画布为固定 480×270 逻辑分辨率(视口层信箱缩放,见 ADR-0002),构造后矩形不变。
    // 颜色走「白底几何 + tint = 目标色」(乘法混色与直接 fill 等价):水域色调
    // (票 #15)由此只需换 tint 而不必重画静态几何,目标色单源 AREA_PALETTES。
    this.pondFill
      .rect(P.x0 * W, P.y0 * H, (P.x1 - P.x0) * W, (P.y1 - P.y0) * H)
      .fill(0xffffff)
    this.pondStroke
      .rect(P.x0 * W, P.y0 * H, (P.x1 - P.x0) * W, (P.y1 - P.y0) * H)
      .stroke({ width: 4, color: 0xffffff })

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

    // 浮标:图集切片精灵(位置仍由核心状态驱动)
    const bobber = new Sprite(textures.bobber)
    bobber.anchor.set(0.5)
    this.bobberSprite.addChild(bobber)

    // 小游戏鱼精灵:贴图随 core.fish.shape 换帧(见 update),初始贴图仅占位
    this.mgFishSprite = new Sprite(textures.fishFrames.slim[0])
    this.mgFishSprite.anchor.set(0.5)
    this.mgFishSprite.visible = false

    // 角色:16x16 四向行走精灵,脚底锚在核心坐标点下方(原几何身体下缘)
    this.playerSprite = new Sprite(textures.playerFrames.down[0])
    this.playerSprite.anchor.set(0.5, 1)
    this.playerSprite.position.set(0, PLAYER_FOOT_OFFSET)
    this.player.addChild(this.playerSprite)

    // 岸线波纹:沿池边一圈逐 tile 排布,泡沫相位顺时针环流;掩膜限制浪不上岸过远
    this.buildWaveRing(px0, py0, pondW, pondH)

    app.stage.addChild(this.world)
    this.world.addChild(
      this.bankTiling,
      this.pondFill,
      this.waterTiling,
      this.pondStroke,
      this.waveLayer,
      this.ripples,
      this.line,
      this.chargeBar,
      this.player,
      this.bobberSprite,
      this.bang,
      this.track,
      this.mgBar,
      this.mgFishSprite,
      this.mgProgress,
    )

    // 首帧前先落默认水域色调(此后随 core.area 变化在 update 里切换)
    this.applyAreaPalette(DEFAULT_AREA)
  }

  /**
   * 应用当前水域的背景/水面色调(票 #15,spec #13):三水域共用素材,以 PixiJS
   * tint 乘法混色区分——背景岸块、流水贴图、池底/描边四处,色调单源 AREA_PALETTES;
   * 浮标/角色/鱼精灵等实体不在列(不 tint)。变化才重设,update 每帧调用无开销。
   * 快照缺 area(旧替身/极端情形)按默认水域渲染,渲染层不因缺字段抛错。
   */
  private applyAreaPalette(area: WaterAreaId | undefined): void {
    const target = area ?? DEFAULT_AREA
    if (target === this.renderedArea) return
    this.renderedArea = target
    const palette = AREA_PALETTES[target]
    this.bankTiling.tint = palette.bank
    this.waterTiling.tint = palette.water
    this.pondFill.tint = palette.fill
    this.pondStroke.tint = palette.stroke
  }

  /** 沿池边一圈布置泡沫贴片:上边自左向右、右边自上而下、下边自右向左、左边自下而上 */
  private buildWaveRing(px0: number, py0: number, pondW: number, pondH: number): void {
    const cols = Math.round(pondW / TILE)
    const rows = Math.ceil(pondH / TILE)
    const frames = this.textures.waveFrames
    const addTile = (edge: WaveEdge, phase: number, x: number, y: number): void => {
      const sprite = new Sprite(frames[edge][0])
      sprite.position.set(x, y)
      this.waveLayer.addChild(sprite)
      this.waveTiles.push({ sprite, edge, phase })
    }
    for (let i = 0; i < cols; i++) addTile('top', i, px0 + i * TILE, py0 - WAVE_LAND_SIDE)
    for (let j = 0; j < rows; j++) addTile('right', cols + j, px0 + pondW - TILE + WAVE_LAND_SIDE, py0 + j * TILE)
    for (let k = 0; k < cols; k++) {
      addTile('bottom', cols + rows + (cols - 1 - k), px0 + k * TILE, py0 + pondH - TILE + WAVE_LAND_SIDE)
    }
    for (let m = 0; m < rows; m++) {
      addTile('left', 2 * cols + rows + (rows - 1 - m), px0 - WAVE_LAND_SIDE, py0 + m * TILE)
    }
    // 掩膜:波纹只允许出现在池边外扩 WAVE_MASK_MARGIN 的范围内(侧边末块被裁齐)
    const mask = new Graphics()
      .rect(px0 - WAVE_MASK_MARGIN, py0 - WAVE_MASK_MARGIN, pondW + WAVE_MASK_MARGIN * 2, pondH + WAVE_MASK_MARGIN * 2)
      .fill(0xffffff)
    this.waveLayer.addChild(mask)
    this.waveLayer.mask = mask
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

    // 池水流动:13 帧按周期轮换
    this.waterTiling.texture = this.textures.waterFrames[Math.floor(t / WATER_FRAME_PERIOD) % WATER_FRAME_COUNT]

    // 水域演出(票 #15):当前水域决定背景/水面色调,变化才重设 tint
    this.applyAreaPalette(core.area)

    // 池塘底色/描边为构造期静态几何(见构造函数),update 不再触碰,避免指令累积

    // 岸线波纹:泡沫帧沿岸边顺时针环流(逐 tile 相位偏移 → 波峰绕池游走)
    const waveFrame = Math.floor(t / WAVE_FRAME_PERIOD)
    for (const tile of this.waveTiles) {
      tile.sprite.texture = this.textures.waveFrames[tile.edge][(waveFrame + tile.phase) % WAVE_FRAME_COUNT]
    }

    // 角色方向与行走:对比前后帧 px/py 位移向量(渲染侧推导,核心零改动)。
    // 水平/垂直分量按画布尺寸折算成逻辑像素再比大小;位移可忽略 = 静止待机(帧 0)
    if (this.prevPx >= 0) {
      const dx = (core.px - this.prevPx) * W
      const dy = (core.py - this.prevPy) * H
      if (Math.hypot(dx, dy) > MOVE_EPS) {
        this.facing =
          Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up'
        this.walkT += dt
      } else {
        this.walkT = 0
      }
    }
    this.prevPx = core.px
    this.prevPy = core.py
    this.playerSprite.texture =
      this.textures.playerFrames[this.facing][Math.floor(this.walkT / WALK_FRAME_PERIOD) % PLAYER_FRAME_COUNT]
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

    // 钓鱼小游戏面板(右侧;轨道/绿条/进度条暂留几何绘制,换皮属后续票)
    const mgVisible = core.phase === 'minigame'
    this.track.visible = mgVisible
    this.mgBar.visible = mgVisible
    this.mgFishSprite.visible = mgVisible
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

      // 鱼精灵:按场上鱼形取贴图,2 帧按周期交替(挣扎摆尾);配色来自贴图本身
      const fishFrames = this.textures.fishFrames[core.fish.shape]
      this.mgFishSprite.texture = fishFrames[Math.floor(t / FISH_FRAME_PERIOD) % FISH_FRAME_COUNT]
      this.mgFishSprite.position.set(trackX + trackW / 2, innerY + innerH - mg.fishY * innerH)

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
}
