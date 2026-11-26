import { describe, expect, it } from 'vitest'
import { CoreLoop, type UpdateInput } from './coreLoop'
import { Rng } from './rng'
import type { LoopPhase } from './types'
import { TUNE } from '../config'

const DT = 1 / 60
const HOLD: UpdateInput = { holding: true, moveX: 0, moveY: 0 }
const IDLE: UpdateInput = { holding: false, moveX: 0, moveY: 0 }

function newLoop(seed = 42): CoreLoop {
  return new CoreLoop(new Rng(seed))
}

function run(loop: CoreLoop, seconds: number, input: UpdateInput = IDLE): void {
  const n = Math.round(seconds / DT)
  for (let i = 0; i < n; i++) loop.update(DT, input)
}

function runUntil(
  loop: CoreLoop,
  maxSeconds: number,
  input: UpdateInput,
  stop: (l: CoreLoop) => boolean,
): void {
  const n = Math.round(maxSeconds / DT)
  for (let i = 0; i < n && !stop(loop); i++) loop.update(DT, input)
}

/** 蓄满抛竿,进入等待 */
function castFull(loop: CoreLoop): void {
  loop.update(DT, HOLD)
  run(loop, 1, HOLD)
  loop.update(DT, IDLE)
  expect(loop.phase).toBe('waiting')
}

/**
 * 自动玩家单帧:按相位给输入,让循环持续钓鱼(固定种子 → 轨迹完全确定)。
 * fisher:咬钩时起竿进小游戏、小游戏按住控条;bystander:全程不起竿
 * (咬钩窗口自然超时脱钩)——两种策略都是确定性轨迹。
 */
function autoStep(l: CoreLoop, policy: 'fisher' | 'bystander'): void {
  const holding =
    l.phase === 'idle'
      ? true
      : l.phase === 'charging'
        ? l.power < 1
        : policy === 'fisher' && (l.phase === 'bite' || l.phase === 'minigame')
          ? true
          : false
  l.update(DT, { holding, moveX: 0, moveY: 0 })
}

/** 归零结算记录:归零前一帧的相位与得分(定格断言的基准) */
interface RoundEnd {
  loop: CoreLoop
  /** 归零强制结算消费掉的相位(endRound 的分支依据) */
  phaseAtZero: LoopPhase
  scoreAtZero: number
  roundScoreAtZero: number
}

/** 开一局限时并自动玩到倒计时归零,记录归零瞬间状态 */
function driveRoundToEnd(seed: number, policy: 'fisher' | 'bystander'): RoundEnd {
  const loop = newLoop(seed)
  expect(loop.setMode('timed')).toBe(true)
  let phaseAtZero: LoopPhase = loop.phase
  let scoreAtZero = 0
  let roundScoreAtZero = 0
  const n = Math.round((TUNE.timed.duration + 30) / DT) // 30 秒余量,足够归零
  for (let i = 0; i < n && loop.roundActive; i++) {
    phaseAtZero = loop.phase
    scoreAtZero = loop.score
    roundScoreAtZero = loop.roundScore
    autoStep(loop, policy)
  }
  expect(loop.roundActive).toBe(false) // 确实归零结算,不是跑满上限
  return { loop, phaseAtZero, scoreAtZero, roundScoreAtZero }
}

/** 种子搜索:找到「归零落于目标相」的种子(与既有测试按结局找种子同款) */
function driveRoundEndingIn(
  target: LoopPhase,
  policy: 'fisher' | 'bystander',
  from = 1,
  maxSeeds = 250,
): RoundEnd {
  for (let s = from; s < from + maxSeeds; s++) {
    const r = driveRoundToEnd(s, policy)
    if (r.phaseAtZero === target) return r
  }
  throw new Error(`种子 ${from}..${from + maxSeeds - 1} 内未找到归零落于 ${target} 相的局`)
}

describe('模式层:切换合法性(接缝:setMode,票 #23)', () => {
  it('默认无限休闲:无倒计时、无进行中的限时局', () => {
    const l = newLoop()
    expect(l.mode).toBe('casual')
    expect(l.timeRemaining).toBe(0)
    expect(l.roundActive).toBe(false)
  })

  it('待机可切限时:倒计时重置为调参叶时长,开局本局得分 0', () => {
    const l = newLoop()
    expect(l.setMode('timed')).toBe(true)
    expect(l.mode).toBe('timed')
    expect(l.timeRemaining).toBe(TUNE.timed.duration)
    expect(l.roundActive).toBe(true)
    expect(l.roundScore).toBe(0)
  })

  it('垂钓进行中拒绝切换:六相逐一被拒,模式与倒计时原样(状态机层面锁定,同 setWater 双保险先例)', () => {
    // 结算停留(caught/escaped)由种子决定,先找出两种结局各一个种子
    let caughtSeed = 0
    let escapedSeed = 0
    for (let s = 1; s <= 80 && (!caughtSeed || !escapedSeed); s++) {
      const l = newLoop(s)
      castFull(l)
      runUntil(l, 10, IDLE, x => x.phase !== 'waiting')
      l.update(DT, HOLD)
      runUntil(l, 60, HOLD, x => x.phase === 'caught' || x.phase === 'escaped')
      if (l.phase === 'caught' && !caughtSeed) caughtSeed = s
      if (l.phase === 'escaped' && !escapedSeed) escapedSeed = s
    }
    expect(caughtSeed).toBeGreaterThan(0)
    expect(escapedSeed).toBeGreaterThan(0)

    // 逐相:进入该相 → setMode 双向都被拒 → 模式与倒计时原样
    const assertRejected = (l: CoreLoop): void => {
      const remaining = l.timeRemaining
      expect(l.setMode('casual')).toBe(false)
      expect(l.setMode('timed')).toBe(false)
      expect(l.mode).toBe('timed')
      expect(l.timeRemaining).toBe(remaining) // 拒绝帧不重置也不清零倒计时
    }

    // 切限时后走一遍垂钓全程:charging / waiting / bite / minigame
    const l = newLoop(42)
    expect(l.setMode('timed')).toBe(true)
    l.update(DT, HOLD)
    expect(l.phase).toBe('charging')
    assertRejected(l)

    run(l, 1, HOLD)
    l.update(DT, IDLE)
    expect(l.phase).toBe('waiting')
    assertRejected(l)

    runUntil(l, 10, IDLE, x => x.phase !== 'waiting')
    expect(l.phase).toBe('bite')
    assertRejected(l)

    l.update(DT, HOLD)
    expect(l.phase).toBe('minigame')
    assertRejected(l)

    // 结算停留两相(捕获/脱钩各一):本相未走完仍拒绝
    const caught = newLoop(caughtSeed)
    expect(caught.setMode('timed')).toBe(true)
    castFull(caught)
    runUntil(caught, 10, IDLE, x => x.phase !== 'waiting')
    caught.update(DT, HOLD)
    runUntil(caught, 60, HOLD, x => x.phase === 'caught' || x.phase === 'escaped')
    expect(caught.phase).toBe('caught')
    assertRejected(caught)

    const escaped = newLoop(escapedSeed)
    expect(escaped.setMode('timed')).toBe(true)
    castFull(escaped)
    runUntil(escaped, 10, IDLE, x => x.phase !== 'waiting')
    escaped.update(DT, HOLD)
    runUntil(escaped, 60, HOLD, x => x.phase === 'caught' || x.phase === 'escaped')
    expect(escaped.phase).toBe('escaped')
    assertRejected(escaped)
  })

  it('结算停留走完回到待机后,切换恢复可用', () => {
    let seed = 0
    for (let s = 1; s <= 80 && !seed; s++) {
      const l = newLoop(s)
      castFull(l)
      runUntil(l, 10, IDLE, x => x.phase !== 'waiting')
      l.update(DT, HOLD)
      runUntil(l, 60, HOLD, x => x.phase === 'caught' || x.phase === 'escaped')
      if (l.phase !== 'idle') seed = s
    }
    const l = newLoop(seed)
    castFull(l)
    runUntil(l, 10, IDLE, x => x.phase !== 'waiting')
    l.update(DT, HOLD)
    runUntil(l, 60, HOLD, x => x.phase === 'caught' || x.phase === 'escaped')
    runUntil(l, 2, IDLE, x => x.phase === 'idle')
    expect(l.setMode('casual')).toBe(true)
    expect(l.mode).toBe('casual')
  })
})

describe('模式层:倒计时(接缝:update dt 驱动,票 #23)', () => {
  it('dt 推进精确:推进 1 秒剩 119,推进 60 秒剩 60(期望值独立字面量)', () => {
    const l = newLoop()
    l.setMode('timed')
    run(l, 1)
    expect(l.timeRemaining).toBeCloseTo(119, 6)
    run(l, 59)
    expect(l.timeRemaining).toBeCloseTo(60, 6)
  })

  it('垂钓进行中倒计时照走:等待相 dt 照减(限时是纯计时壳,相位不停表)', () => {
    const l = newLoop()
    l.setMode('timed')
    castFull(l) // 62 帧(蓄满 1 秒 + 松开边沿帧)进入等待
    expect(l.phase).toBe('waiting')
    run(l, 10) // 再 600 帧
    // 帧数独立核算:62 + 600 = 662 帧,每帧 DT
    expect(l.timeRemaining).toBeCloseTo(TUNE.timed.duration - 662 * DT, 6)
  })

  it('归零后停在 0,不再向下走(局已结束,计时压力解除)', () => {
    const l = newLoop()
    l.setMode('timed')
    run(l, TUNE.timed.duration + 30)
    expect(l.timeRemaining).toBe(0)
    expect(l.roundActive).toBe(false)
  })
})

describe('模式层:归零强制结算各相分支(接缝:endRound,票 #23 唯一新增转移)', () => {
  it('待机中归零:原地回待机,局结束,模式仍为限时(等组合根再开一局)', () => {
    const l = newLoop()
    l.setMode('timed')
    run(l, TUNE.timed.duration + 5)
    expect(l.mode).toBe('timed')
    expect(l.roundActive).toBe(false)
    expect(l.phase).toBe('idle')
    expect(l.timeRemaining).toBe(0)
    expect(l.roundScore).toBe(0)
  })

  it('蓄力中归零:直接回待机,没抛出去的竿作废,不计分', () => {
    const l = newLoop()
    l.setMode('timed')
    // 全程按住:始终停在蓄力相,倒计时归零
    const n = Math.round((TUNE.timed.duration + 5) / DT)
    for (let i = 0; i < n; i++) l.update(DT, HOLD)
    expect(l.roundActive).toBe(false)
    expect(l.phase).toBe('idle')
    expect(l.score).toBe(0)
    expect(l.best).toBe(0)
  })

  it('等待中归零:直接回待机,鱼未上钩不计分,本局得分定格', () => {
    const r = driveRoundEndingIn('waiting', 'bystander')
    expect(r.phaseAtZero).toBe('waiting')
    expect(r.loop.phase).toBe('idle') // 直接回待机,不经过结算停留
    expect(r.loop.fish).toBeNull()
    expect(r.loop.score).toBe(r.scoreAtZero) // 归零帧不计分
    expect(r.loop.roundScore).toBe(r.roundScoreAtZero) // 本局得分定格
  })

  it('咬钩中归零:直接回待机,响应中的尝试作废不计分', () => {
    // 旁观者不起竿,咬钩窗口自然停留 → 归零可落于 bite 相
    const r = driveRoundEndingIn('bite', 'bystander')
    expect(r.phaseAtZero).toBe('bite')
    expect(r.loop.phase).toBe('idle') // 直接回待机,不进入小游戏
    expect(r.loop.score).toBe(r.scoreAtZero)
    expect(r.loop.roundScore).toBe(r.roundScoreAtZero)
  })

  it('小游戏中归零:按脱钩结算(escaped)且不计分,本局得分定格为已捕获部分', () => {
    const r = driveRoundEndingIn('minigame', 'fisher')
    expect(r.phaseAtZero).toBe('minigame')
    expect(r.loop.phase).toBe('escaped') // 按脱钩结算,不是捕获
    expect(r.loop.score).toBe(r.scoreAtZero) // 归零帧不追加计分
    expect(r.loop.roundScore).toBe(r.roundScoreAtZero) // 定格
    expect(r.loop.roundScore).toBe(r.loop.score - 0) // 单局口径:基线 0(本局从 0 开局)
    // 复用既有脱钩停留转移走完回待机
    run(r.loop, 2)
    expect(r.loop.phase).toBe('idle')
  })

  it('结算停留中归零:本相不被打断,完成停留后回待机,已捕获的计分照常', () => {
    const r = driveRoundEndingIn('caught', 'fisher')
    expect(r.phaseAtZero).toBe('caught')
    expect(r.loop.score).toBeGreaterThan(0) // 捕获已计分(倒计时归零不追回)
    expect(r.loop.roundScore).toBe(r.roundScoreAtZero)
    run(r.loop, 2) // 停留(1.1s)走完
    expect(r.loop.phase).toBe('idle')
    expect(r.loop.score).toBe(r.scoreAtZero)
  })
})

describe('模式层:互切与清理(接缝:setMode 双向,票 #23)', () => {
  /** 蓄满抛竿进入等待后主动收竿回待机 */
  function castThenReelIn(l: CoreLoop): void {
    castFull(l)
    run(l, TUNE.bite.reelHold + 0.1, HOLD)
    expect(l.phase).toBe('idle')
  }

  it('限时中切回无限:计时状态完全清除(倒计时归零、局结束、本局得分回会话口径)', () => {
    const l = newLoop()
    l.setMode('timed')
    run(l, 30) // 局中:倒计时已走 30 秒
    expect(l.roundActive).toBe(true)
    castThenReelIn(l)
    expect(l.setMode('casual')).toBe(true)
    expect(l.mode).toBe('casual')
    expect(l.timeRemaining).toBe(0)
    expect(l.roundActive).toBe(false)
    expect(l.roundScore).toBe(l.score) // 无限口径:会话累计
    // 残留倒计时不再流动:任意推进后仍为 0、局不复活
    run(l, 10)
    expect(l.timeRemaining).toBe(0)
    expect(l.roundActive).toBe(false)
  })

  it('限时待机再来一局(setMode timed 重复):倒计时重置、单局得分重新清零', () => {
    const l = newLoop()
    l.setMode('timed')
    run(l, 20) // 第一局进行中
    castThenReelIn(l)
    expect(l.setMode('timed')).toBe(true) // 再来一局
    expect(l.timeRemaining).toBe(TUNE.timed.duration) // 倒计时重置
    expect(l.roundScore).toBe(0) // 单局得分重新清零(基线 = 当前累计)
  })

  it('逐帧一致:开过限时再切回无限后,同种子同输入与「从未开过限时」的循环逐位一致', () => {
    const a = newLoop(42) // 从未开过限时(现状参照)
    const b = newLoop(42)
    // b 的限时插曲:纯待机空转(不开竿)——模式层不应消耗任何随机抽取
    expect(b.setMode('timed')).toBe(true)
    run(b, 5, IDLE)
    expect(b.roundActive).toBe(true) // 插曲中倒计时确实在走
    expect(b.setMode('casual')).toBe(true) // 切回无限
    expect(b.timeRemaining).toBe(0)
    // 此后两者同输入逐帧对比:全部公开状态逐位一致
    for (let i = 0; i < Math.round(20 / DT); i++) {
      const input: UpdateInput = i % 90 < 30 ? HOLD : IDLE
      a.update(DT, input)
      b.update(DT, input)
      expect(b.phase).toBe(a.phase)
      expect(b.score).toBe(a.score)
      expect(b.best).toBe(a.best)
      expect(b.power).toBe(a.power)
      expect(b.bobberDist).toBe(a.bobberDist)
      expect(b.fish?.id ?? null).toBe(a.fish?.id ?? null)
      expect(b.timeRemaining).toBe(0)
      expect(b.timeRemaining).toBe(a.timeRemaining)
      expect(b.roundActive).toBe(a.roundActive)
      if (a.mg && b.mg) {
        expect(b.mg.barY).toBe(a.mg.barY)
        expect(b.mg.fishY).toBe(a.mg.fishY)
        expect(b.mg.progress).toBe(a.mg.progress)
      }
    }
  })

  it('纯计时壳:同种子同输入,限时局内玩法与无限模式逐位一致(鱼/得分/手感不变)', () => {
    const script = (l: CoreLoop): void => {
      l.update(DT, HOLD)
      run(l, 1, HOLD) // 蓄满
      l.update(DT, IDLE) // 抛竿
      runUntil(l, 10, IDLE, x => x.phase !== 'waiting') // 等到咬钩(或直接进小游戏)
      if (l.phase === 'bite') l.update(DT, HOLD) // 起竿
      runUntil(l, 60, HOLD, x => x.phase === 'caught' || x.phase === 'escaped') // 打到结算
    }
    const a = newLoop(7)
    const b = newLoop(7)
    expect(b.setMode('timed')).toBe(true)
    script(a)
    script(b)
    expect(b.phase).toBe(a.phase)
    expect(b.fish?.id ?? null).toBe(a.fish?.id ?? null) // 同一条鱼
    expect(b.score).toBe(a.score)
    expect(b.best).toBe(a.best)
    expect(b.timeRemaining).toBeGreaterThan(0) // 局未归零(单局约 10s ≪ 120s)
  })
})

/** 自动玩到捕获一尾,返回该循环(停在结算停留相);限时变体见 playTimedUntilCatch */
function playUntilCatch(seed: number): CoreLoop {
  for (let s = seed; s < seed + 80; s++) {
    const l = newLoop(s)
    castFull(l)
    runUntil(l, 10, IDLE, x => x.phase !== 'waiting')
    l.update(DT, HOLD)
    runUntil(l, 60, HOLD, x => x.phase === 'caught' || x.phase === 'escaped')
    if (l.phase === 'caught' && l.score > 0) return l
  }
  throw new Error('80 个种子内未找到捕获')
}

/** 自动玩到捕获一尾的限时变体:开局限时后同款驱动(返回该循环,停在结算停留相) */
function playTimedUntilCatch(seed: number): CoreLoop {
  for (let s = seed; s < seed + 80; s++) {
    const l = newLoop(s)
    expect(l.setMode('timed')).toBe(true)
    castFull(l)
    runUntil(l, 10, IDLE, x => x.phase !== 'waiting')
    l.update(DT, HOLD)
    runUntil(l, 60, HOLD, x => x.phase === 'caught' || x.phase === 'escaped')
    if (l.phase === 'caught' && l.score > 0) return l
  }
  throw new Error('80 个种子内未找到限时捕获')
}

describe('模式层:单局得分基线计法(接缝:roundScore,票 #23)', () => {
  it('开局前已有会话得分:单局得分从 0 起算,只计开局后的新增(基线 = 当前累计)', () => {
    const l = playUntilCatch(1)
    const sessionScore = l.score
    expect(sessionScore).toBeGreaterThan(0)
    run(l, 2) // 停留走完回待机
    expect(l.setMode('timed')).toBe(true)
    expect(l.roundScore).toBe(0) // 开局清零:基线 = 开局时刻累计
    castFull(l)
    runUntil(l, 10, IDLE, x => x.phase !== 'waiting')
    l.update(DT, HOLD)
    runUntil(l, 60, HOLD, x => x.phase === 'caught' || x.phase === 'escaped')
    if (l.phase === 'caught') {
      expect(l.score).toBeGreaterThan(sessionScore) // 会话累计照常增长
      expect(l.roundScore).toBe(l.score - sessionScore) // 单局 = 累计 − 基线
      // 纪录双轨行为隔离(票 #22 review):限时局捕获不推高会话纪录,
      // core.best 保持开局前的值(单局纪录走 TimedBestStore,组合根判定)
      expect(l.best).toBe(sessionScore)
    }
  })

  it('限时局中 resetSession:会话得分清零且基线同归 0,单局得分 0 不出负', () => {
    const l = newLoop()
    l.setMode('timed')
    castFull(l)
    runUntil(l, 10, IDLE, x => x.phase !== 'waiting')
    l.update(DT, HOLD)
    runUntil(l, 60, HOLD, x => x.phase === 'caught' || x.phase === 'escaped')
    run(l, 2) // 回待机
    expect(l.setMode('timed')).toBe(true) // 再开一局
    castFull(l)
    runUntil(l, 10, IDLE, x => x.phase !== 'waiting')
    l.update(DT, HOLD)
    runUntil(l, 60, HOLD, x => x.phase === 'caught' || x.phase === 'escaped')
    if (l.phase === 'caught' && l.roundScore > 0) {
      const remaining = l.timeRemaining
      l.resetSession()
      expect(l.score).toBe(0)
      expect(l.roundScore).toBe(0) // 0 − 0,连续不出负
      expect(l.timeRemaining).toBe(remaining) // 重开计分不清倒计时(限时局照旧)
      expect(l.roundActive).toBe(true)
    }
  })
})

describe('模式层:纪录双轨行为隔离(接缝:settle 捕获计分,票 #22 review 缺口②)', () => {
  it('限时局捕获不推高会话纪录:core.best 保持开局前的值(单局纪录走 TimedBestStore,行为层隔离)', () => {
    const l = playUntilCatch(1) // casual 预热:会话累计与纪录同步涨到 S
    const sessionScore = l.score
    expect(sessionScore).toBeGreaterThan(0)
    expect(l.best).toBe(sessionScore) // casual 现状:会话纪录 = 会话累计
    run(l, 2) // 停留走完回待机
    expect(l.setMode('timed')).toBe(true)
    castFull(l)
    runUntil(l, 10, IDLE, x => x.phase !== 'waiting')
    l.update(DT, HOLD)
    runUntil(l, 60, HOLD, x => x.phase === 'caught' || x.phase === 'escaped')
    if (l.phase === 'caught') {
      expect(l.score).toBeGreaterThan(sessionScore) // 会话累计照常增长
      expect(l.best).toBe(sessionScore) // 会话纪录不被限时捕获推高(锁定:core.best 不变)
    }
  })

  it('从零会话直接开限时:捕获只进会话累计,会话纪录保持 0(从不推高)', () => {
    const l = playTimedUntilCatch(1)
    expect(l.score).toBeGreaterThan(0) // 会话累计照常
    expect(l.best).toBe(0) // 会话纪录零增长(单局纪录的持久化判定在组合根 recordIfHigher)
  })
})
