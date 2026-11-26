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
