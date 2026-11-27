import { Sprite, Texture } from 'pixi.js'
import { SpritePool } from './spritePool'

/**
 * 捕获水花(票 #43,spec §5.2):捕获边沿在鱼漂世界坐标起一蓬水粒——
 * 自写轻量 sprite 粒子池(生成/回收,零依赖,底座 = SpritePool)。
 *
 * 演出形状:每粒一律向上抛出、四周散开,重力拉回水面,寿命 ≤0.6s,
 * 透明度随寿命淡出——读作「鱼被拎出水面带起的水珠」。池满时新粒丢弃
 * (连续捕获不扩容,帧成本恒定);位置取整像素(ADR-0002)。
 */

/** 单蓬粒子数(= 池容量;克制口径,一蓬小水花足够) */
export const SPLASH_COUNT = 12
/** 寿命上界(秒;单次效果 <1s) */
export const SPLASH_LIFETIME = 0.6
/** 重力(逻辑像素/秒²):水珠回落水面 */
export const SPLASH_GRAVITY = 260

/** 单粒水花:出生点 + 初速 + 寿命(纯数据,推进产出新记录) */
export interface SplashDrop {
  x: number
  y: number
  /** 水平初速(逻辑像素/秒,有界 ±70) */
  vx: number
  /** 垂直初速(逻辑像素/秒,一律向上) */
  vy: number
  /** 总寿命(秒) */
  life: number
  /** 已存活(秒) */
  age: number
  /** 寿命未尽(false = 本帧回收) */
  alive: boolean
}

/** 确定性伪随机 ∈ [0,1)(与 screenShake 同款混叠,可测) */
function hash01(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}

/** 第 i 粒的出生参数(纯函数,同序号逐位一致):向上偏置 + 全周散布 */
export function splashDrop(i: number): SplashDrop {
  const vx = (hash01(i * 2 + 1) * 2 - 1) * 70
  const vy = -20 - hash01(i * 2 + 2) * 90
  const life = 0.35 + hash01(i * 3 + 5) * 0.25
  return { x: 0, y: 0, vx, vy, life, age: 0, alive: true }
}

/** 推进一粒(纯函数):重力下坠、匀速横移、寿命计时 */
export function splashStep(p: SplashDrop, dt: number): SplashDrop {
  const age = p.age + dt
  return {
    x: p.x + p.vx * dt,
    y: p.y + p.vy * dt,
    vx: p.vx,
    vy: p.vy + SPLASH_GRAVITY * dt,
    life: p.life,
    age,
    alive: age < p.life,
  }
}

/** 水珠配色(白→浅青的小簇,读作水沫) */
const SPLASH_TINTS = [0xffffff, 0xdff3f7, 0xbfe8f2, 0x9fd8e8] as const

/** 在用粒子:纯数据状态 + 池里的精灵 */
interface LiveDrop {
  drop: SplashDrop
  sprite: Sprite
}

/**
 * 捕获水花层:挂 worldScene 的 world 容器(随相机滚动),坐标 = 世界像素。
 * spawn 起一蓬,update 逐帧推进并回收寿命尽的粒。
 */
export class SplashLayer {
  private readonly pool = new SpritePool(SPLASH_COUNT, () => {
    const sprite = new Sprite(Texture.WHITE)
    sprite.anchor.set(0.5)
    return sprite
  })
  /** 水花容器(世界层子节点;测试经它数粒/读位置) */
  readonly container = this.pool.container
  private live: LiveDrop[] = []

  constructor() {
    this.container.label = 'splash'
  }

  /** 在 (x, y)(鱼漂世界坐标)起一蓬水花;池满时多余粒丢弃 */
  spawn(x: number, y: number): void {
    for (let i = 0; i < SPLASH_COUNT; i++) {
      const sprite = this.pool.acquire()
      if (!sprite) break
      const drop = { ...splashDrop(i), x, y }
      sprite.tint = SPLASH_TINTS[i % SPLASH_TINTS.length]!
      sprite.scale.set(3, 3)
      sprite.alpha = 1
      sprite.position.set(Math.round(x), Math.round(y))
      this.live.push({ drop, sprite })
    }
  }

  /** 逐帧推进:位置取整、透明度随寿命衰减;寿命尽回收 */
  update(dt: number): void {
    this.live = this.live.filter(live => {
      const drop = splashStep(live.drop, dt)
      if (!drop.alive) {
        live.sprite.alpha = 1
        this.pool.release(live.sprite)
        return false
      }
      live.drop = drop
      live.sprite.position.set(Math.round(drop.x), Math.round(drop.y))
      const k = drop.age / drop.life
      live.sprite.alpha = 1 - k * k
      return true
    })
  }
}
