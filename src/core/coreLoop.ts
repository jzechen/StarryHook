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

/** 模式层(票 #23):无限休闲(现状)或限时挑战(纯计时壳,倒计时归零强制结算) */
export type GameMode = 'casual' | 'timed'

/**
 * 本竿饵效果(单缝返回值,票 #19/#21 两缝合一):抛竿时刻由饵效果来源产出一次,
 * 同时驱动等待分布与浓饵权重入参——核心循环不感知饵种、库存与消耗时机。
 */
export interface BaitEffect {
  /** 等待时长修正系数(须为正;1 = 现行分布,香饵 = 0.5) */
  waitScale: number
  /** 浓饵是否生效(权重引擎的浓饵修正入参;浓饵不减半等待,香饵不提升权重) */
  richBait: boolean
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

  /**
   * 模式层状态(票 #23):默认无限,未选限时模式时模式层零副作用,
   * 行为与现状逐帧一致(「最小扩展」纪律,与 setRodParams/setBaitEffectSource 同款)。
   */
  private modeId: GameMode = 'casual'
  /** 限时局是否进行中(倒计时归零强制结算后置否;切回无限恒否) */
  private timedRoundActive = false
  /** 限时开局基线:开局时刻的会话累计得分;本局得分 = 会话累计 − 基线(图鉴/成长/金币照常累积不回退) */
  private roundBaseline = 0
  /** 限时剩余秒数(局中逐帧递减,归零钳在 0;非限时恒 0) */
  private timeLeft = 0
  /** 局毕定格:归零强制结算瞬间的本局得分(此后自由游玩不漂移,再来一局才重开) */
  private roundFrozenScore = 0

  private rng: Rng
  /** 本次抛竿的出鱼权重(蓄力时算出) */
  private pool: number[] = []
  /** 当前竿的绿条参数(默认 = 现行手感;成长系统经 setRodParams 注入) */
  private barParams: BarParams = TUNE.bar
  /** 本竿剩余等待秒数(waiting 中逐帧递减,咬钩判定用;抛竿时刻由等待时长参数源算定) */
  private waitRemaining = 0
  /**
   * 本竿饵效果来源(单缝,票 #19/#21 两缝合一):抛竿时刻调用恰好一次,返回值
   * 同时驱动等待分布(waitScale)与浓饵权重入参(richBait);null = 本竿无饵效果。
   * 默认恒 null —— 现行权重与等待分布逐位一致,主随机序列一个 draw 都不动。
   * 单缝消除旧双缝的调用次序契约:饵的消耗接线归组合根的来源闭包,
   * 一次消耗同时产出两个效果入参,核心循环只见效果、不见库存。
   */
  private baitEffect: () => BaitEffect | null = () => null
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

  /**
   * 注入「本竿饵效果」单一来源(组合根在启动时注入一次,来源内部读实时库存状态);
   * 仅换效果来源,状态机逻辑不变。来源在每次抛竿时刻被调用恰好一次——
   * 调用次数由核心循环保证,组合根的消耗接线因此每竿只扣一支饵;
   * 返回 null = 本竿无饵效果(现行行为)。
   */
  setBaitEffectSource(source: () => BaitEffect | null): void {
    this.baitEffect = source
  }

  /** 当前竿参数只读暴露:渲染层(绿条绘制)与物理同源,换竿即视觉跟随 */
  get rodParams(): Readonly<BarParams> {
    return this.barParams
  }

  // —— 模式层(票 #23):状态只读,写入走 setMode(合法性由状态机锁定) ——

  /** 当前模式(只读;切换走 setMode) */
  get mode(): GameMode {
    return this.modeId
  }

  /** 限时剩余秒数;非限时模式恒 0(顶栏倒计时仅在限时模式显示) */
  get timeRemaining(): number {
    return this.timeLeft
  }

  /** 限时局是否进行中(倒计时归零强制结算后置否;切回无限恒否) */
  get roundActive(): boolean {
    return this.timedRoundActive
  }

  /**
   * 本局得分(组合根结算提示用):无限模式 = 会话累计(无限无「局」,
   * 会话即局);限时局中 = 会话累计 − 开局基线(只算本局新增,单局口径);
   * 局毕(归零强制结算)后定格为结算瞬间的值,此后自由游玩不漂移。
   */
  get roundScore(): number {
    if (this.modeId !== 'timed') return this.score
    return this.timedRoundActive ? this.score - this.roundBaseline : this.roundFrozenScore
  }

  /**
   * 切换模式:仅待机(idle)可接受;垂钓进行中(含结算停留)拒绝并保持原模式。
   * 切限时 = 开局(或限时待机后再来一局):开局基线记当前会话累计、倒计时重置;
   * 切无限 = 计时状态完全清除,行为与从未开过限时逐帧一致。
   */
  setMode(mode: GameMode): boolean {
    if (this.phase !== 'idle') return false
    this.roundFrozenScore = 0 // 互切卫生:上一局的定格分不跨局残留
    if (mode === 'timed') {
      this.timedRoundActive = true
      this.roundBaseline = this.score
      this.timeLeft = TUNE.timed.duration
    } else {
      this.timedRoundActive = false
      this.roundBaseline = 0
      this.timeLeft = 0
    }
    this.modeId = mode
    return true
  }

  /** 本竿等待时长只读暴露:与等待递减同源(等待分布测试与香饵效果提示读取,不做第二份计算) */
  get waitTime(): number {
    return this.waitRemaining
  }

  /** 每帧推进 */
  update(dt: number, input: UpdateInput): void {
    const holding = input.holding
    const pressed = holding && !this.holding
    const released = !holding && this.holding
    this.holding = holding
    this.sincePress += dt
    if (pressed) this.sincePress = 0

    // 模式层(票 #23):限时局中逐帧递减,归零强制结束当前尝试。
    // 归零帧由强制结算接管(本帧不再推进玩法逻辑)——倒计时是硬边界,先到先得。
    // 未开限时(modeId = casual)此块整体跳过,行为与现状逐帧一致。
    if (this.modeId === 'timed' && this.timedRoundActive) {
      this.timeLeft -= dt
      if (this.timeLeft <= 0) {
        this.timeLeft = 0
        this.endRound()
        return
      }
    }

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
        this.waitRemaining -= dt
        if (this.phase === 'waiting' && this.waitRemaining <= 0) this.startBite()
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
    // 模式层(票 #23):基线随会话得分同归 0——限时局中重开计分,本局得分 = 0 − 0 连续不出负
    this.roundBaseline = 0
  }

  /**
   * 倒计时归零强制结算(票 #23 唯一新增转移:「归零 → 强制结束当前尝试」):
   * 本局得分定格;各相分支——
   * - 等待/咬钩/蓄力中:直接回待机(没抛出去的竿作废,不计分);
   * - 小游戏中:按脱钩结算(不计分),复用既有 escaped 停留转移回待机;
   * - 待机/结算停留中:原地不动(结算停留由既有转移自然完成回待机)。
   * 五阶段既有转移零改动;归零后本局定格,倒计时停 0,回待机后模式仍为限时,
   * 等组合根再开一局或切回无限。
   */
  private endRound(): void {
    // 先定格后置否:归零瞬间的本局得分 = 会话累计 − 基线
    this.roundFrozenScore = this.score - this.roundBaseline
    this.timedRoundActive = false
    switch (this.phase) {
      case 'charging':
      case 'waiting':
      case 'bite':
        this.fish = null
        this.mg = null
        this.phase = 'idle'
        break
      case 'minigame':
        this.settle(false) // 按脱钩结算:不计分,不更新纪录
        break
      case 'idle':
      case 'caught':
      case 'escaped':
        break
    }
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
    // 本竿饵效果:单缝来源在抛竿时刻调用恰好一次(默认 null = 现行行为逐位一致)。
    // 出鱼权重 = 修正引擎(当前水域基底鱼池 × 抛竿时刻环境 × 蓄力 × 浓饵标记);
    // 现行「蓄力偏向难鱼」乘子已并入引擎,权重在抛竿时刻算定,咬钩时刻不再重算。
    const bait = this.baitEffect()
    this.pool = computePoolWeights(
      FISH,
      waterAreaOf(this.areaId).baseWeights,
      this.env,
      this.power,
      bait?.richBait ?? false,
    )
    this.bobberDist = this.power
    this.castX = this.px
    this.castY = this.py
    // 等待时长 = 现行分布 × 本竿修正系数(min/max 同乘,分布形状不变,抽取序列不增不减)
    const scale = bait?.waitScale ?? 1
    this.waitRemaining = this.rng.range(TUNE.wait.min * scale, TUNE.wait.max * scale)
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
