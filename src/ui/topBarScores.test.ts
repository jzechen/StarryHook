import { describe, expect, it } from 'vitest'
import { topBarScores } from './topBarScores'

/** 无限侧现状快照:会话累计 30 / 会话纪录 25 */
const CASUAL = { mode: 'casual' as const, score: 30, best: 25, roundScore: 30, timedBest: 7 }
/** 限时侧现状快照:会话累计 30(开局基线 22 → 本局 8)/ 会话纪录 25 / 单局纪录 7 */
const TIMED_ROUND = { mode: 'timed' as const, score: 30, best: 25, roundScore: 8, timedBest: 7 }
/** 限时归零后快照:本局得分定格 8(roundActive 已置否,读数同局中末值) */
const TIMED_FROZEN = { ...TIMED_ROUND }

describe('顶栏得分/纪录双轨口径(接缝:纯函数,票 #22 review 缺口①)', () => {
  it('无限休闲保持现状:得分 = 会话累计,最高纪录 = 会话纪录(任意相位同口径)', () => {
    expect(topBarScores(CASUAL)).toEqual({ score: 30, best: 25 })
  })

  it('限时局中:得分 = 本局得分(开局基线差值,只计本局新增),最高纪录 = 限时单局纪录', () => {
    expect(topBarScores(TIMED_ROUND)).toEqual({ score: 8, best: 7 })
  })

  it('限时归零后:得分 = 归零定格的本局得分,最高纪录 = 限时单局纪录(两轨都随模式切)', () => {
    expect(topBarScores(TIMED_FROZEN)).toEqual({ score: 8, best: 7 })
  })

  it('两轨互不串读:限时侧不显示会话累计/会话纪录,无限侧不显示本局得分/单局纪录', () => {
    // 限时侧若误读会话轨,会拿到 30/25 而非 8/7
    expect(topBarScores(TIMED_ROUND)).not.toEqual({ score: TIMED_ROUND.score, best: TIMED_ROUND.best })
    // 无限侧若误读限时轨,会拿到 30/7 而非 30/25
    expect(topBarScores(CASUAL)).not.toEqual({ score: CASUAL.roundScore, best: CASUAL.timedBest })
  })

  it('限时待机(已开局未钓):本局得分 0,单局纪录照常展示', () => {
    expect(topBarScores({ mode: 'timed', score: 22, best: 25, roundScore: 0, timedBest: 7 })).toEqual({
      score: 0,
      best: 7,
    })
  })
})
