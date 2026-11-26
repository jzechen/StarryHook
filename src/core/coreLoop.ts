import { TUNE } from '../config'
import { FISH } from './fishCatalog'
import type { Rng } from './rng'
import type { FishDef, LoopPhase } from './types'

/** 钓鱼小游戏状态(轨道归一化:0 = 底,1 = 顶) */
export interface MinigameState {
  /** 已进行秒数(行为曲线用) */
  t: number
  /** 行为内部倒计时 */
  timer: number
  barY: number
  barV: number
  fishY: number
  fishTarget: number
  progress: number
}

/**
 * 核心循环状态机 + 钓鱼小游戏数学。纯逻辑,不依赖渲染;
 * 正式实现阶段这套数学原样迁移并配单测。
 */
export class CoreLoop {
  phase: LoopPhase = 'idle'
  score = 0
  best = 0
  /** charging 时的蓄力 0..1 */
  power = 0
  /** 本次抛竿远近 0..1(演出用) */
  bobberDist = 0
  fish: FishDef | null = null
  /** 响应窗口剩余秒数 */
  biteWindow = 0
  mg: MinigameState | null = null

  private rng: Rng
  /** 本次抛竿的出鱼权重(蓄力时算出) */
  private pool: number[] = []
  private waitTime = 0
  private settleTime = 0
  private holding = false

  constructor(rng: Rng) {
    this.rng = rng
  }

  /** 每帧推进;holding = 当前是否按住指针 */
  update(dt: number, holding: boolean): void {
    const pressed = holding && !this.holding
    const released = !holding && this.holding
    this.holding = holding

    switch (this.phase) {
      case 'idle':
        if (pressed) {
          this.power = 0
          this.phase = 'charging'
        }
        break
      case 'charging':
        this.power = Math.min(1, this.power + dt / TUNE.charge.maxTime)
        if (released) this.cast()
        break
      case 'waiting':
        this.waitTime -= dt
        if (pressed) {
          this.fish = null
          this.phase = 'idle' // 主动收竿
        } else if (this.waitTime <= 0) {
          this.startBite()
        }
        break
      case 'bite':
        this.biteWindow -= dt
        if (pressed) {
          this.startMinigame()
        } else if (this.biteWindow <= 0) {
          this.settle(false) // 错过响应窗口 → 脱钩收竿
        }
        break
      case 'minigame':
        this.updateMinigame(dt)
        break
      case 'caught':
      case 'escaped':
        this.settleTime -= dt
        if (this.settleTime <= 0) this.phase = 'idle'
        break
    }
  }

  /** 重开会话:得分清零,最高纪录保留 */
  resetSession(): void {
    this.score = 0
    this.fish = null
    this.mg = null
    this.phase = 'idle'
  }

  private cast(): void {
    // 蓄力 → 出鱼权重:越有力越偏向行为更难(更活泼)的鱼
    this.pool = FISH.map(f => 1 + this.power * TUNE.poolBias * f.difficulty)
    this.bobberDist = this.power
    this.waitTime = this.rng.range(TUNE.wait.min, TUNE.wait.max)
    this.fish = null
    this.phase = 'waiting'
  }

  private startBite(): void {
    this.fish = this.rng.pick(FISH, this.pool)
    this.biteWindow = this.rng.range(TUNE.bite.windowMin, TUNE.bite.windowMax)
    this.phase = 'bite'
  }

  private startMinigame(): void {
    this.mg = {
      t: 0,
      timer: 0,
      barY: (1 - TUNE.bar.height) / 2,
      barV: 0,
      fishY: this.rng.range(0.35, 0.65),
      fishTarget: 0.5,
      progress: TUNE.minigame.progressStart,
    }
    this.phase = 'minigame'
  }

  private updateMinigame(dt: number): void {
    const mg = this.mg!
    const B = TUNE.bar
    const M = TUNE.minigame
    mg.t += dt

    // 绿条:按住上升,松开下落(带惯性,撞边反弹)
    mg.barV += (this.holding ? B.accelUp : -B.gravity) * dt
    mg.barV = Math.max(-B.vmax, Math.min(B.vmax, mg.barV))
    mg.barY += mg.barV * dt
    const maxY = 1 - B.height
    if (mg.barY < 0) {
      mg.barY = 0
      mg.barV = -mg.barV * B.bounce
    } else if (mg.barY > maxY) {
      mg.barY = maxY
      mg.barV = -mg.barV * B.bounce
    }

    // 鱼图标按其行为移动
    mg.timer -= dt
    this.updateFish(mg, dt)

    // 进度:罩住上涨,脱开流失
    const overlap =
      mg.fishY + M.fishHalf >= mg.barY && mg.fishY - M.fishHalf <= mg.barY + B.height
    mg.progress += (overlap ? M.gain : -M.drain) * dt
    if (mg.progress >= 1) this.settle(true)
    else if (mg.progress <= 0) this.settle(false)
  }

  private updateFish(mg: MinigameState, dt: number): void {
    const f = this.fish!
    const diff = f.difficulty
    switch (f.behavior) {
      case 'mixed': // 混合:全轨道随机游走
        if (mg.timer <= 0) {
          mg.fishTarget = this.rng.range(0.05, 0.95)
          mg.timer = this.rng.range(0.5, 1.4)
        }
        this.seek(mg, dt, 0.45 + diff * 0.05)
        break
      case 'smooth': // 平滑:缓慢双正弦漂移
        mg.fishY = 0.5 + 0.24 * Math.sin(mg.t * 2.0) + 0.1 * Math.sin(mg.t * 4.7 + 1.3)
        break
      case 'sinker': // 沉底:贴底移动
        if (mg.timer <= 0) {
          mg.fishTarget = this.rng.range(0.04, 0.2)
          mg.timer = this.rng.range(2.0, 3.5)
        }
        this.seek(mg, dt, 0.5 + diff * 0.04)
        break
      case 'floater': // 漂浮:贴顶移动
        if (mg.timer <= 0) {
          mg.fishTarget = this.rng.range(0.78, 0.95)
          mg.timer = this.rng.range(2.0, 3.5)
        }
        this.seek(mg, dt, 0.5 + diff * 0.04)
        break
      case 'dart': // 急冲:驻留后猛冲一大段
        if (mg.timer <= 0) {
          const far = this.rng.range(0.3, 0.45) * (this.rng.float() < 0.5 ? -1 : 1)
          mg.fishTarget = Math.max(0.03, Math.min(0.97, mg.fishY + far))
          mg.timer = this.rng.range(1.6, 3.0)
        }
        this.seek(mg, dt, 1.8 + diff * 0.15)
        break
    }
  }

  private seek(mg: MinigameState, dt: number, speed: number): void {
    const d = mg.fishTarget - mg.fishY
    mg.fishY += Math.max(-speed * dt, Math.min(speed * dt, d))
    mg.fishY = Math.max(0.02, Math.min(0.98, mg.fishY))
  }

  private settle(caught: boolean): void {
    if (caught && this.fish) {
      this.score += this.fish.score
      this.best = Math.max(this.best, this.score)
    }
    this.settleTime = TUNE.resolution.holdTime
    this.phase = caught ? 'caught' : 'escaped'
  }
}
