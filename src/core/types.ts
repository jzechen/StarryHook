export type BehaviorType = 'mixed' | 'smooth' | 'sinker' | 'floater' | 'dart'

export type LoopPhase =
  | 'idle'
  | 'charging'
  | 'waiting'
  | 'bite'
  | 'minigame'
  | 'caught'
  | 'escaped'

export interface FishDef {
  id: string
  name: string
  behavior: BehaviorType
  /** 难度 1~5:影响出鱼权重与计分 */
  difficulty: number
  score: number
  color: number
  shape: 'slim' | 'round' | 'heavy' | 'puff' | 'bolt'
  /** 出没条件(亲和);缺省 = 全水域、全季节昼夜、无修正(图鉴据此后续展示) */
  habitat?: FishHabitat
}

// —— 世界与环境(水域/季节/昼夜/天气,见 GLOSSARY「世界与环境」)——

export type WaterAreaId = 'pond' | 'river' | 'lake'

/**
 * 场景 id(票 #35,spec §1.1:三张场景线性相连)。核心只把它当作不透明键
 * (存档快照、位置→水域推导的入参);场景数据归 src/world 注册表。
 */
export type MapId = 'village' | 'river' | 'lake'

/** 角色朝向(行走贴图行序:下/上/左/右;存档口径含朝向,票 #35) */
export type Facing = 'down' | 'up' | 'left' | 'right'

export type Season = 'spring' | 'summer' | 'autumn' | 'winter'

export type Daylight = 'day' | 'night'

export type Weather = 'sunny' | 'rain'

/** 出没条件(亲和):某维度不声明 = 该维度不设限/不修正 */
export interface FishHabitat {
  /** 可出现的水域集合(硬门:当前水域不在其中 → 权重归零);缺省 = 全水域 */
  areas?: readonly WaterAreaId[]
  /** 可出现的季节集合(硬门);缺省 = 全季节 */
  seasons?: readonly Season[]
  /** 可出现的昼夜集合(硬门);缺省 = 全昼夜 */
  daylight?: readonly Daylight[]
  /** 季节权重倍率(软修正,不归零);缺省 = 1 */
  seasonMul?: Partial<Record<Season, number>>
  /** 昼夜权重倍率(软修正,不归零);缺省 = 1 */
  daylightMul?: Partial<Record<Daylight, number>>
  /** 天气权重倍率(软修正,不归零);缺省 = 1 */
  weatherMul?: Partial<Record<Weather, number>>
}

/** 出鱼权重的环境输入:当前水域 + 季节/昼夜/天气(引擎唯一环境入口) */
export interface EnvState {
  area: WaterAreaId
  season: Season
  daylight: Daylight
  weather: Weather
}

/**
 * 渔获品质(票 #39,spec §4.2):捕获时刻随机判定的价值档位。
 * 只影响卖价(分值 × 品质倍率),不影响得分/XP/图鉴;钓位微差不影响品质。
 */
export type FishQuality = 'normal' | 'silver' | 'gold'

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
