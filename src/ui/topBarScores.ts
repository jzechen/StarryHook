import type { GameMode } from '../core/coreLoop'

/** 顶栏得分/纪录的读数来源(组合根每帧汇总,数值口径见各字段) */
export interface TopBarScoreInput {
  /** 当前模式(core.mode) */
  mode: GameMode
  /** 会话累计得分(core.score) */
  score: number
  /** 会话最高纪录(core.best,仅会话内;只属无限休闲) */
  best: number
  /** 本局得分(core.roundScore:限时局中 = 开局基线差值,归零后定格;无限口径 = 会话累计) */
  roundScore: number
  /** 限时单局最高纪录(TimedBestStore.best(),0 = 还没有成绩) */
  timedBest: number
}

/**
 * 顶栏「得分 / 最高纪录」双轨口径(纯函数,票 #22 review 缺口①):
 * 两轨随模式走——限时挑战显示单局得分与限时单局纪录(纪录双轨,GLOSSARY
 * 限时挑战「单局最高纪录独立存放」);无限休闲保持现状(会话累计 + 会话纪录)。
 * 单局纪录这里只读取展示:持久化判定(recordIfHigher)在组合根归零结算处
 * 恰好调用一次,本函数不重复判定。
 */
export function topBarScores(input: TopBarScoreInput): { score: number; best: number } {
  if (input.mode === 'timed') return { score: input.roundScore, best: input.timedBest }
  return { score: input.score, best: input.best }
}
