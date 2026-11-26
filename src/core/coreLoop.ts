import { TUNE } from '../config'
import type { BarParams } from '../config'
import { stepCatchBar } from './catchBar'
import { FISH } from './fishCatalog'
import { computePoolWeights } from './fishPool'
import { stepFish } from './fishMotion'
import type { Rng } from './rng'
import { DEFAULT_AREA, waterAreaOf } from './waterAreas'
import { daylightOf, seasonOf, sessionWeather } from './worldEnv'
import type { EnvState, FishDef, LoopPhase, MinigameState, WaterAreaId, Weather } from './types'

export interface UpdateInput {
  /** 指针/空格是否按住 */
  holding: boolean
  /** 移动方向分量(x 已按宽高比折算,单位:屏幕高度/秒) */
  moveX: number
  moveY: number
}

/** 核心循环的世界注入项(系统边界,均可选;缺省 = 真实时钟 + 种子派生天气) */
export interface CoreLoopWorld {
  /** 时钟:返回当地真实时间(季节 = 月份、昼夜 = 小时由此派生);缺省 = 真实系统时钟 */
  clock?: () => Date
  /** 会话天气覆盖(测试固定环境用);缺省 = 会话开始由主种子派生的独立 Rng 抽样一次 */
  weather?: Weather
}

/**
 * 核心循环状态机。纯逻辑,不依赖渲染;
 * 绿条物理与鱼类行为分别组合自 catchBar / fishMotion(可独立单测)。
 */
export class CoreLoop {
  phase: LoopPhase = 'idle'
  score = 0
  best = 0
  /** charging 时的蓄力 0..1 */
  power = 0
  /** 本次抛竿远近 0..1(演出用) */
  bobberDist = 0
  /** 玩家位置(归一化) */
  px = 0.1
  py = 0.85
  /** 抛竿瞬间的玩家位置(浮标起飞点,等待中不随移动漂移) */
  castX = 0.1
  castY = 0.85
  fish: FishDef | null = null
  /** 响应窗口剩余秒数 */
  biteWindow = 0
  mg: MinigameState | null = null

  private rng: Rng
  /** 本次抛竿的出鱼权重(蓄力时算出) */
  private pool: number[] = []
  /** 当前竿的绿条参数(默认 = 现行手感;成长系统经 setRodParams 注入) */
  private barParams: BarParams = TUNE.bar
  private waitTime = 0
  private settleTime = 0
  private holding = false
  /** 距上次按下经过的秒数(输入缓冲用) */
  private sincePress = 999
  /** waiting 中持续按住的秒数(收竿判定用) */
  private reelT = 0
  /** 当前水域(世界状态;经 setWater 切换,垂钓进行中被拒) */
  private areaId: WaterAreaId = DEFAULT_AREA
  /** 会话天气:会话开始抽样一次,会话内恒定(重开计分会话不重抽,世界环境延续) */
  readonly weather: Weather
  /** 系统边界时钟(季节/昼夜的来源) */
  private clock: () => Date

  constructor(rng: Rng, world: CoreLoopWorld = {}) {
    this.rng = rng
    this.clock = world.clock ?? ((): Date => new Date())
    // 天气:独立派生种子的 Rng 在会话开始抽样一次——主随机序列一个 draw 都不动,
    // 既有固定种子测试的抽取序列保持逐位一致;同种子 → 同天气(?seed 可复现)
    this.weather = world.weather ?? sessionWeather(rng.seed)
  }

  /** 当前水域(只读;切换走 setWater) */
  get area(): WaterAreaId {
    return this.areaId
  }

  /** 当前环境状态(季节/昼夜实时读时钟,天气为会话常量)——出鱼权重与顶栏徽章同源 */
  get env(): EnvState {
    const now = this.clock()
    return { area: this.areaId, season: seasonOf(now), daylight: daylightOf(now), weather: this.weather }
  }

  /** 切换水域:仅待机(idle)可接受;垂钓进行中(含结算停留)拒绝并保持原水域 */
  setWater(area: WaterAreaId): boolean {
    if (this.phase !== 'idle') return false
    this.areaId = area
    return true
  }

  /** 设置当前竿参数(组合根在启动恢复与解锁时注入);仅换参数来源,状态机逻辑不变 */
  setRodParams(params: BarParams): void {
    this.barParams = params
  }

  /** 当前竿参数只读暴露:渲染层(绿条绘制)与物理同源,换竿即视觉跟随 */
  get rodParams(): Readonly<BarParams> {
    return this.barParams
  }

  /** 每帧推进 */
  update(dt: number, input: UpdateInput): void {
    const holding = input.holding
    const pressed = holding && !this.holding
    const released = !holding && this.holding
    this.holding = holding
    this.sincePress += dt
    if (pressed) this.sincePress = 0

    // 移动:仅限非对抗阶段
    if (this.phase === 'idle' || this.phase === 'charging' || this.phase === 'waiting') {
      this.movePlayer(dt, input.moveX, input.moveY)
    }

    switch (this.phase) {
      case 'idle':
        if (pressed) {
          this.power = 0
          this.phase = 'charging'
        }
        break
      case 'charging':
        if (released) {
          this.cast() // 松开帧不再累加蓄力:抛出去的力度 = 松开瞬间看到的力度
        } else {
          this.power = Math.min(1, this.power + dt / TUNE.charge.maxTime)
        }
        break
      case 'waiting':
        // 按住 = 主动收竿;短按不打断(预判点击安全)
        if (holding) {
          this.reelT += dt
          if (this.reelT >= TUNE.bite.reelHold) {
            this.fish = null
            this.phase = 'idle'
          }
        } else {
          this.reelT = 0
        }
        this.waitTime -= dt
        if (this.phase === 'waiting' && this.waitTime <= 0) this.startBite()
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
        this.updateMinigame(dt, pressed)
        break
      case 'caught':
      case 'escaped':
        this.settleTime -= dt
        if (this.settleTime <= 0) this.phase = 'idle'
        break
    }
  }

  /** 重开会话:得分清零,最高纪录保留;世界环境延续(水域与天气不变) */
  resetSession(): void {
    this.score = 0
    this.fish = null
    this.mg = null
    this.phase = 'idle'
  }

  /** 移动并阻挡在岸上(池塘 AABB 外,推向最近的岸) */
  private movePlayer(dt: number, moveX: number, moveY: number): void {
    this.px += moveX * TUNE.move.speed * dt
    this.py += moveY * TUNE.move.speed * dt
    this.px = Math.max(0.03, Math.min(0.97, this.px))
    this.py = Math.max(0.06, Math.min(0.95, this.py))

    const P = TUNE.pond
    const r = 0.018 // 角色半径(归一化)
    if (this.px > P.x0 - r && this.px < P.x1 + r && this.py > P.y0 - r && this.py < P.y1 + r) {
      const dl = this.px - (P.x0 - r)
      const dr = P.x1 + r - this.px
      const du = this.py - (P.y0 - r)
      const dd = P.y1 + r - this.py
      const m = Math.min(dl, dr, du, dd)
      if (m === dl) this.px = P.x0 - r
      else if (m === dr) this.px = P.x1 + r
      else if (m === du) this.py = P.y0 - r
      else this.py = P.y1 + r
    }
  }

  private cast(): void {
    // 出鱼权重 = 修正引擎(当前水域基底鱼池 × 抛竿时刻环境 × 蓄力);
    // 现行「蓄力偏向难鱼」乘子已并入引擎,权重在抛竿时刻算定,咬钩时刻不再重算
    this.pool = computePoolWeights(FISH, waterAreaOf(this.areaId).baseWeights, this.env, this.power)
    this.bobberDist = this.power
    this.castX = this.px
    this.castY = this.py
    this.waitTime = this.rng.range(TUNE.wait.min, TUNE.wait.max)
    this.reelT = 0
    this.fish = null
    this.phase = 'waiting'
  }

  private startBite(): void {
    this.fish = this.rng.pick(FISH, this.pool)
    // 输入缓冲:咬钩瞬间正按着(预判点击/按住)→ 直接起竿
    if (this.sincePress <= TUNE.bite.pressBuffer || this.holding) {
      this.startMinigame()
      return
    }
    this.biteWindow = this.rng.range(TUNE.bite.windowMin, TUNE.bite.windowMax)
    this.phase = 'bite'
  }

  private startMinigame(): void {
    this.mg = {
      t: 0,
      timer: 0,
      barY: (1 - this.barParams.height) / 2,
      barV: 0,
      fishY: this.rng.range(0.35, 0.65),
      fishTarget: 0.5,
      progress: TUNE.minigame.progressStart,
    }
    this.phase = 'minigame'
  }

  private updateMinigame(dt: number, pressed: boolean): void {
    const mg = this.mg!
    const M = TUNE.minigame
    mg.t += dt

    stepCatchBar(mg, dt, this.holding, pressed, this.barParams)
    stepFish(mg, dt, this.fish!, this.rng)

    // 进度:罩住上涨,脱开流失
    const overlap =
      mg.fishY + M.fishHalf >= mg.barY &&
      mg.fishY - M.fishHalf <= mg.barY + this.barParams.height
    mg.progress += (overlap ? M.gain : -M.drain) * dt
    if (mg.progress >= 1) this.settle(true)
    else if (mg.progress <= 0) this.settle(false)
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
