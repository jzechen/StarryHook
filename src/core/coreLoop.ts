import { TUNE } from '../config'
import type { BarParams } from '../config'
import { stepCatchBar } from './catchBar'
import { FISH } from './fishCatalog'
import { computePoolWeights } from './fishPool'
import { stepFish } from './fishMotion'
import type { Rng } from './rng'
import { DEFAULT_AREA, waterAreaOf } from './waterAreas'
import { daylightOf, seasonOf, sessionWeather } from './worldEnv'
import type { EnvState, FishDef, Facing, LoopPhase, MinigameState, WaterAreaId, Weather } from './types'

export interface UpdateInput {
  /** 指针/空格是否按住 */
  holding: boolean
  /** 移动方向分量(已斜向归一,|v| ≤ 1;速度 = TUNE.move.speed 世界像素/秒) */
  moveX: number
  moveY: number
}

/** 角色脚部碰撞盒半尺寸(像素;spec §1.3:碰撞盒 < 1 tile) */
export const PLAYER_HALF_W = 5
export const PLAYER_HALF_H = 3

/** 判定「在移动」的每帧最小位移(逻辑像素;与渲染侧行走判定同阈) */
const MOVE_EPS = 0.1

/**
 * 世界碰撞来源(票 #34 注入缝):移动阻挡与边界钳制的参数来源。
 * 核心不 import 地图/渲染,只消费「这个脚部盒是否被挡」的谓词输出
 * (图 #25 纪律:核心循环只允许参数来源参数化级扩展)。
 */
export interface WorldCollisionSource {
  /** 世界像素尺寸(边界钳制) */
  readonly widthPx: number
  readonly heightPx: number
  /** 脚部碰撞盒(中心 cx,cy,半宽 halfW,半高 halfH)是否与不可走区域(水 tile/大件)重叠 */
  blockedBox(cx: number, cy: number, halfW: number, halfH: number): boolean
}

/** 缺省世界:单屏 480×270、无 tile 碰撞(未注入时核心自洽可测;组合根注入真实地图) */
const DEFAULT_WORLD: WorldCollisionSource = {
  widthPx: 480,
  heightPx: 270,
  blockedBox: () => false,
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
  /** 玩家位置(世界像素,脚部点;缺省 = 缺省世界左上合法位,组合根注入出生点覆盖) */
  px = PLAYER_HALF_W
  py = PLAYER_HALF_H
  /**
   * 玩家朝向(票 #35,spec §1.5 存档口径的一部分):由实际位移主轴推导,
   * 静止保持;过场「朝向保持行进方向」与跨会话恢复由组合根直接赋值——
   * 核心只持有状态,不感知存档。
   */
  facing: Facing = 'down'
  /** 抛竿瞬间的玩家位置(浮标起飞点,等待中不随移动漂移) */
  castX = PLAYER_HALF_W
  castY = PLAYER_HALF_H
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

  /** 世界碰撞来源(票 #34 注入缝):缺省单屏无阻挡;组合根启动时注入一次 */
  private world: WorldCollisionSource = DEFAULT_WORLD
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

  /** 注入世界碰撞来源(组合根启动时调用一次):仅换移动阻挡的参数来源,状态机逻辑不变 */
  setWorldCollision(source: WorldCollisionSource): void {
    this.world = source
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

  /**
   * 世界像素移动(票 #34 位置模型迁移,有意规格变更:归一化 0.5 屏高/秒 ≈ 135px/s
   * → 70 px/s):速度来自 TUNE.move.speed,输入已斜向归一,合速度恒定;
   * 先钳到地图边界(脚部盒内缩),再 X/Y 轴分离尝试——被挡的轴整步取消
   * (try/cancel:停在墙沿一个步长 ≤ 70/60 ≈ 1.2px 之内,可沿墙滑行,
   * 单帧步长远小于 tile 边长,无穿墙);碰撞查询走注入来源,核心不感知地图。
   */
  private movePlayer(dt: number, moveX: number, moveY: number): void {
    const w = this.world
    const nx = this.px + moveX * TUNE.move.speed * dt
    const ny = this.py + moveY * TUNE.move.speed * dt
    const cx = Math.max(PLAYER_HALF_W, Math.min(w.widthPx - PLAYER_HALF_W, nx))
    const cy = Math.max(PLAYER_HALF_H, Math.min(w.heightPx - PLAYER_HALF_H, ny))
    const prevX = this.px
    const prevY = this.py
    if (!w.blockedBox(cx, this.py, PLAYER_HALF_W, PLAYER_HALF_H)) this.px = cx
    if (!w.blockedBox(this.px, cy, PLAYER_HALF_W, PLAYER_HALF_H)) this.py = cy
    // 朝向 = 本帧实际位移的主轴方向(票 #35):被挡轴整步取消 → 沿墙滑动时
    // 自然转向滑行方向;静止(位移 < MOVE_EPS)保持原朝向。判定阈值与渲染侧
    // 行走贴图的原推导一致(渲染侧改读此状态,不再自行推导)。
    const ex = this.px - prevX
    const ey = this.py - prevY
    if (Math.hypot(ex, ey) > MOVE_EPS) {
      this.facing = Math.abs(ex) >= Math.abs(ey) ? (ex > 0 ? 'right' : 'left') : ey > 0 ? 'down' : 'up'
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
      // 会话纪录只属无限休闲(纪录双轨行为层隔离,票 #22 review):限时局捕获
      // 不推高 core.best——单局纪录的持久化判定在组合根归零结算处
      // (TimedBestStore.recordIfHigher),两轨各走各的,此处不重复判定。
      if (this.modeId === 'casual') this.best = Math.max(this.best, this.score)
    }
    this.settleTime = TUNE.resolution.holdTime
    this.phase = caught ? 'caught' : 'escaped'
  }
}
