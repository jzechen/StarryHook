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
}

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
