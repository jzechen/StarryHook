import { Container, Graphics, Sprite, Text, Texture } from 'pixi.js'
import { SpritePool } from './spritePool'

/**
 * 大满贯全屏演出(票 #43,spec §5.2):替代既有 toast——画布内横幅 +
 * 星芒/彩带粒子,约 2s。触发决策归组合根(沿 collectionToastPolicy 的
 * grandSlam 判定 + collection.acknowledgeCompletion 幂等标记,一辈子一次);
 * 本层只保证「一次演出不重入」:演出中重复 start 不重启计时。
 *
 * 「大满贯」是演出/文案名,不是状态名(GLOSSARY 集齐)。演出挂在屏空间
 * (组合根 app.stage,不随相机滚动),不拦截输入(container.interactive = false)。
 * 逻辑分辨率固定 480×270(ADR-0002),几何常量即屏内坐标。
 */

/** 演出总时长(秒,spec「约 2s」) */
export const GRAND_SLAM_DURATION = 2.0
/** 横幅淡入时长(秒) */
const BANNER_FADE_IN = 0.18
/** 横幅淡出时长(秒) */
const BANNER_FADE_OUT = 0.35
/** 开局缩放弹跳峰值(1 = 落定) */
const BANNER_POP = 1.14

/** 彩带粒子数(克制口径:细条彩带 + 少量星芒,不满屏纸屑) */
export const CONFETTI_COUNT = 24
/** 星芒粒子数(横幅两侧点缀) */
const STAR_COUNT = 6
/** 星芒寿命(秒)与错峰间隔(秒) */
const STAR_LIFE = 0.5
const STAR_STAGGER = 0.06

/** 逻辑屏尺寸(ADR-0002 固定) */
const SCREEN_W = 480
const SCREEN_H = 270

/** 横幅时间线(纯函数):淡入(带缩放弹跳)→ 保持 → 淡出 */
export function grandSlamBanner(elapsed: number): { alpha: number; scale: number } {
  if (elapsed >= GRAND_SLAM_DURATION) return { alpha: 0, scale: 1 }
  if (elapsed <= 0) return { alpha: 0, scale: BANNER_POP }
  const fadeIn = Math.min(1, elapsed / BANNER_FADE_IN)
  const fadeOut = Math.min(1, (GRAND_SLAM_DURATION - elapsed) / BANNER_FADE_OUT)
  return {
    alpha: Math.min(fadeIn, fadeOut),
    scale: 1 + (1 - fadeIn) * (BANNER_POP - 1),
  }
}

/** 彩带粒子:细条(2×5)带横摆与旋转,自画面顶缘之上落下 */
export interface ConfettiDrop {
  /** 当前位置/朝向 */
  x: number
  y: number
  rot: number
  /** 出生基准(横摆绕此轴)与下落速度 */
  baseX: number
  startY: number
  vy: number
  /** 横摆参数与自转速度 */
  swayAmp: number
  swayFreq: number
  swayPhase: number
  rotSpeed: number
  /** 寿命(秒;总时长内落完)与已存活 */
  life: number
  age: number
  /** 错峰延迟(秒;age 自负值起跑) */
  delay: number
  /** 寿命未尽(false = 回收) */
  alive: boolean
}

/** 确定性伪随机 ∈ [0,1)(同款混叠,可测) */
function hash01(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}

/** 第 i 条彩带的出生参数(纯函数,同序号逐位一致) */
export function confettiDrop(i: number): ConfettiDrop {
  const baseX = hash01(i * 7 + 1) * SCREEN_W
  const startY = -(6 + hash01(i * 7 + 2) * 150)
  return {
    x: baseX,
    y: startY,
    rot: hash01(i * 7 + 4) * Math.PI,
    baseX,
    startY,
    vy: 110 + hash01(i * 7 + 3) * 60,
    swayAmp: 2 + hash01(i * 7 + 5) * 4,
    swayFreq: 3 + hash01(i * 7 + 6) * 3,
    swayPhase: hash01(i * 11 + 6) * Math.PI * 2,
    rotSpeed: (hash01(i * 11 + 7) * 2 - 1) * 3,
    life: 1.2 + hash01(i * 13 + 8) * 0.5,
    age: 0,
    delay: hash01(i * 13 + 9) * 0.35,
    alive: true,
  }
}

/** 推进一条彩带(纯函数):下落 + 横摆往复 + 自转;寿命尽即死 */
export function confettiStep(p: ConfettiDrop, dt: number): ConfettiDrop {
  const age = p.age + dt
  return {
    ...p,
    x: p.baseX + Math.sin(p.swayPhase + age * p.swayFreq) * p.swayAmp,
    y: p.startY + p.vy * age,
    rot: p.rot + p.rotSpeed * dt,
    age,
    alive: age - p.delay < p.life,
  }
}

/** 彩带配色(暖金为主的节庆小簇,克制) */
const CONFETTI_TINTS = [0xffd23f, 0xfff3b0, 0xff8c5a, 0x8ef07a, 0x9fd8e8, 0xffffff] as const

/** 在用粒子:彩带或星芒 */
interface LiveParticle {
  confetti?: ConfettiDrop
  /** 星芒错峰计时(age 自 -delay 起跑)< 0 = 未登场 */
  starDelay?: number
  starAge?: number
  starX?: number
  starY?: number
  sprite: Sprite
}

/**
 * 大满贯演出层:屏空间全屏容器(组合根挂在 app.stage,场景遮罩之上),
 * 内容 = 彩带/星芒精灵池 + 一次性绘制的横幅(淡入淡出与缩放走容器属性,
 * Graphics 构造期画一次,不逐帧重画)。
 */
export class GrandSlamOverlay {
  readonly container = new Container()
  private readonly pool = new SpritePool(CONFETTI_COUNT + STAR_COUNT, () => {
    const sprite = new Sprite(Texture.WHITE)
    sprite.anchor.set(0.5)
    return sprite
  })
  private readonly banner = new Container()
  private live: LiveParticle[] = []
  /** 演出计时;<0 = 未在演出 */
  private elapsed = -1

  constructor() {
    this.container.interactive = false
    this.container.eventMode = 'none'

    // 横幅(一次性绘制):中带 + 星点描边 + 文案(「大满贯」是文案名,非状态名)
    const bandH = 52
    const bandY = SCREEN_H / 2 - bandH / 2
    const bg = new Graphics()
      .rect(0, bandY, SCREEN_W, bandH)
      .fill({ color: 0x60450c, alpha: 0.92 })
      .rect(0, bandY, SCREEN_W, 1.5)
      .fill({ color: 0xffd23f, alpha: 0.9 })
      .rect(0, bandY + bandH - 1.5, SCREEN_W, 1.5)
      .fill({ color: 0xffd23f, alpha: 0.9 })
    const label = new Text({
      text: '池塘大满贯',
      style: {
        fontFamily: "'Fusion Pixel 12px Proportional SC', sans-serif",
        fontSize: 24,
        fill: 0xfff3b0,
        stroke: { color: 0x3a2a04, width: 3 },
        letterSpacing: 4,
      },
    })
    label.anchor.set(0.5)
    label.position.set(SCREEN_W / 2, SCREEN_H / 2)
    this.banner.addChild(bg, label)
    this.banner.visible = false

    this.container.addChild(this.pool.container, this.banner)
    this.pool.container.visible = false
  }

  /** 是否在演出中 */
  get playing(): boolean {
    return this.elapsed >= 0
  }

  /**
   * 开演(幂等):演出中重复调用是空操作(不重启、不重发粒子);
   * 幂等的跨会话语义(一辈子只演一次)由组合根沿 collection 既有标记保证。
   */
  start(): void {
    if (this.playing) return
    this.elapsed = 0
    this.pool.container.visible = true
    this.banner.visible = true
    this.banner.alpha = 0
    this.banner.scale.set(grandSlamBanner(0).scale)

    // 彩带:整蓬入库,错峰由负起始相位承担(无逐帧发射簿记)
    for (let i = 0; i < CONFETTI_COUNT; i++) {
      const sprite = this.pool.acquire()
      if (!sprite) break
      const drop = confettiDrop(i)
      sprite.tint = CONFETTI_TINTS[i % CONFETTI_TINTS.length]!
      sprite.scale.set(2, 5)
      sprite.alpha = 1
      sprite.visible = drop.delay <= 0
      sprite.position.set(Math.round(drop.x), Math.round(drop.y))
      sprite.rotation = drop.rot
      this.live.push({ confetti: drop, sprite })
    }
    // 星芒:横幅两侧错峰绽放(白菱形,弹性缩放)
    for (let i = 0; i < STAR_COUNT; i++) {
      const sprite = this.pool.acquire()
      if (!sprite) break
      const side = i % 2 === 0 ? -1 : 1
      const row = Math.floor(i / 2)
      sprite.tint = 0xfff3b0
      sprite.scale.set(0, 0)
      sprite.rotation = Math.PI / 4
      sprite.alpha = 1
      sprite.visible = false
      this.live.push({
        starDelay: row * STAR_STAGGER,
        starAge: 0,
        starX: SCREEN_W / 2 + side * (128 + row * 26),
        starY: SCREEN_H / 2 + (row - 1) * 20,
        sprite,
      })
    }
  }

  /** 逐帧推进:横幅时间线 + 粒子;时长尽自动收场并回收全部粒子 */
  update(dt: number): void {
    if (!this.playing) return
    this.elapsed += dt
    if (this.elapsed >= GRAND_SLAM_DURATION) {
      this.finish()
      return
    }
    const banner = grandSlamBanner(this.elapsed)
    this.banner.alpha = banner.alpha
    this.banner.scale.set(banner.scale)
    this.live = this.live.filter(p => {
      if (p.confetti) {
        const drop = confettiStep(p.confetti, dt)
        p.confetti = drop
        const onStage = drop.age >= drop.delay && drop.alive
        p.sprite.visible = onStage
        if (!onStage) return drop.alive && drop.age < drop.delay // 未登场的留到错峰时刻
        p.sprite.position.set(Math.round(drop.x), Math.round(drop.y))
        p.sprite.rotation = drop.rot
        const tail = (drop.age - drop.delay) / drop.life
        p.sprite.alpha = tail > 0.75 ? 1 - (tail - 0.75) / 0.25 : 1
        return true
      }
      if (p.starDelay !== undefined && p.starAge !== undefined) {
        if (p.starDelay > 0) {
          p.starDelay -= dt
          return true
        }
        const age = p.starAge + dt
        p.starAge = age
        if (age >= STAR_LIFE) {
          p.sprite.visible = false
          return false
        }
        const k = Math.sin((Math.PI * age) / STAR_LIFE)
        p.sprite.visible = true
        p.sprite.position.set(p.starX!, p.starY!)
        p.sprite.scale.set(3.2 * k, 3.2 * k)
        return true
      }
      return false
    })
  }

  /** 收场:回到非演出态,粒子全数回收(池还原,下次开演即用) */
  private finish(): void {
    this.elapsed = -1
    this.banner.visible = false
    this.pool.container.visible = false
    for (const p of this.live) {
      p.sprite.visible = false
      p.sprite.alpha = 1
      p.sprite.scale.set(1, 1)
      p.sprite.rotation = 0
      this.pool.release(p.sprite)
    }
    this.live = []
  }
}
