import { describe, expect, it } from 'vitest'
import { CoreLoop, PLAYER_HALF_H, PLAYER_HALF_W, type UpdateInput } from './coreLoop'
import { rollQuality, sessionQualityRng } from './quality'
import { Rng } from './rng'
import { TUNE, type BarParams } from '../config'
import type { FishQuality } from './types'

const DT = 1 / 60
const HOLD: UpdateInput = { holding: true, moveX: 0, moveY: 0 }
const IDLE: UpdateInput = { holding: false, moveX: 0, moveY: 0 }
const RIGHT: UpdateInput = { holding: false, moveX: 1, moveY: 0 }

function newLoop(seed = 42): CoreLoop {
  // 票 #36 有意规格变更:idle 抛竿须经交互点(钓位范围内才可抛)。
  // 既有用例的抛竿都发生在「钓位范围内」,助手统一注入恒定钓位来源;
  // 门禁本身的行为见「交互点门禁」一组(显式覆盖来源)。
  const l = new CoreLoop(new Rng(seed))
  l.setInteractionSource(() => ({ kind: 'spot' }))
  return l
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

/** 一整局:蓄满抛竿 → 等到咬钩 → 起竿 → 一直按住打到结算 */
function playFull(seed: number): CoreLoop {
  const l = newLoop(seed)
  castFull(l)
  runUntil(l, 10, IDLE, x => x.phase !== 'waiting')
  l.update(DT, HOLD)
  runUntil(l, 60, HOLD, x => x.phase === 'caught' || x.phase === 'escaped')
  return l
}

function fishAtBite(seed: number, fullPower: boolean): string {
  const l = newLoop(seed)
  if (fullPower) {
    l.update(DT, HOLD)
    run(l, 1, HOLD)
  } else {
    l.update(DT, HOLD) // 一帧轻点 → power ≈ 0
  }
  l.update(DT, IDLE)
  runUntil(l, 10, IDLE, x => x.phase !== 'waiting')
  expect(l.fish).not.toBeNull()
  return l.fish!.id
}

describe('核心循环状态机(接缝:CoreLoop)', () => {
  it('按下进入蓄力;起竿帧力度为 0,下一帧起增长,封顶为 1', () => {
    const l = newLoop()
    l.update(DT, HOLD)
    expect(l.phase).toBe('charging')
    expect(l.power).toBe(0)
    l.update(DT, HOLD)
    expect(l.power).toBeGreaterThan(0)
    run(l, 3, HOLD)
    expect(l.power).toBe(1)
  })

  it('松开进入等待,抛竿远近等于松开时的蓄力', () => {
    const l = newLoop()
    l.update(DT, HOLD)
    run(l, 0.5, HOLD)
    const p = l.power
    l.update(DT, IDLE)
    expect(l.phase).toBe('waiting')
    expect(l.bobberDist).toBeCloseTo(p, 10)
  })

  it('等待中短按不打断', () => {
    const l = newLoop()
    castFull(l)
    l.update(DT, HOLD)
    l.update(DT, IDLE)
    expect(l.phase).toBe('waiting')
  })

  it('等待中按住超过 reelHold → 主动收竿回 idle', () => {
    const l = newLoop()
    castFull(l)
    run(l, TUNE.bite.reelHold + 0.1, HOLD)
    expect(l.phase).toBe('idle')
  })

  it('无操作等待 → 出现咬钩窗口,且已确定上钩的鱼', () => {
    const l = newLoop()
    castFull(l)
    runUntil(l, 10, IDLE, x => x.phase !== 'waiting')
    expect(l.phase).toBe('bite')
    expect(l.fish).not.toBeNull()
  })

  it('咬钩窗口内点击 → 进入小游戏', () => {
    const l = newLoop()
    castFull(l)
    runUntil(l, 10, IDLE, x => x.phase !== 'waiting')
    l.update(DT, HOLD)
    expect(l.phase).toBe('minigame')
  })

  it('错过响应窗口 → 脱钩不计分,结算后自动回 idle', () => {
    const l = newLoop()
    castFull(l)
    runUntil(l, 10, IDLE, x => x.phase !== 'waiting')
    run(l, 2, IDLE) // 窗口(≤0.85s)耗尽 + 结算停留(1.1s)
    expect(l.phase).toBe('idle')
    expect(l.score).toBe(0)
  })

  it('输入缓冲:等待中预判连点,咬钩直接起竿,从不出现 bite 阶段', () => {
    const l = newLoop()
    castFull(l)
    for (let i = 0; i < 60 * 10; i++) {
      l.update(DT, i % 2 === 0 ? HOLD : IDLE)
      if (l.phase === 'minigame') break
      expect(l.phase).not.toBe('bite')
    }
    expect(l.phase).toBe('minigame')
  })

  it('小游戏打到结算:捕获计分并更新最高纪录,脱钩不计分', () => {
    const l = playFull(42)
    expect(['caught', 'escaped']).toContain(l.phase)
    if (l.phase === 'caught') {
      expect(l.fish).not.toBeNull()
      expect(l.score).toBe(l.fish!.score) // 期望值来自目录(独立来源)
      expect(l.best).toBe(l.score)
    } else {
      expect(l.score).toBe(0)
    }
  })

  it('同种子同输入 → 整局完全可复现(?seed 语义)', () => {
    const a = playFull(7)
    const b = playFull(7)
    expect(b.phase).toBe(a.phase)
    expect(b.score).toBe(a.score)
    expect(b.fish?.id).toBe(a.fish?.id)
  })

  it('重开会话:得分清零、最高纪录保留、回到 idle', () => {
    let caught: CoreLoop | null = null
    for (let s = 1; s <= 80 && !caught; s++) {
      const l = playFull(s)
      if (l.phase === 'caught') caught = l
    }
    expect(caught).not.toBeNull()
    const score = caught!.score
    expect(score).toBeGreaterThan(0)
    caught!.resetSession()
    expect(caught!.score).toBe(0)
    expect(caught!.best).toBe(score)
    expect(caught!.phase).toBe('idle')
  })

  it('移动:70 px/s 世界像素速度,方向分量直加(票 #34 有意规格变更:135→70)', () => {
    // 规格钉死:70 px/s ≈ 4.4 tile/s(spec §1.3);期望值用独立字面量
    expect(TUNE.move.speed).toBe(70)
    const l = newLoop()
    l.px = 100
    l.py = 100
    run(l, 1, RIGHT)
    expect(l.px).toBeCloseTo(170, 10)
    expect(l.py).toBe(100)
  })

  it('移动:斜走速度均匀(输入已归一化,合速度仍 70 px/s)', () => {
    const l = newLoop()
    l.px = 100
    l.py = 100
    const diag = { holding: false, moveX: Math.SQRT1_2, moveY: Math.SQRT1_2 }
    run(l, 1, diag)
    expect(l.px).toBeCloseTo(100 + 70 * Math.SQRT1_2, 10)
    expect(l.py).toBeCloseTo(100 + 70 * Math.SQRT1_2, 10)
  })

  it('移动:缺省世界(未注入)钳制在 480×270 单屏边界,脚部盒内缩', () => {
    const l = newLoop()
    run(l, 10, { holding: false, moveX: 1, moveY: 1 })
    expect(l.px).toBeCloseTo(480 - PLAYER_HALF_W, 10)
    expect(l.py).toBeCloseTo(270 - PLAYER_HALF_H, 10)
  })

  it('小游戏期间移动被冻结', () => {
    const l = newLoop()
    l.px = 100
    l.py = 100
    castFull(l)
    runUntil(l, 10, IDLE, x => x.phase !== 'waiting')
    l.update(DT, HOLD)
    expect(l.phase).toBe('minigame')
    const x = l.px
    const y = l.py
    run(l, 0.5, { holding: true, moveX: 1, moveY: 1 })
    expect(l.px).toBe(x)
    expect(l.py).toBe(y)
  })

  it('出鱼权重:蓄满时闪电梭出现率高于轻抛(蓄力偏向难鱼)', () => {
    const N = 200
    let full = 0
    let light = 0
    for (let s = 1; s <= N; s++) {
      if (fishAtBite(s, true) === 'shandiansuo') full++
      if (fishAtBite(s, false) === 'shandiansuo') light++
    }
    expect(full).toBeGreaterThan(light)
  })
})

describe('渔获品质(接缝:结算沿 roll,独立派生种子,票 #39 spec §4.2)', () => {
  /** 一竿打到结算:fullPower 蓄满抛竿,否则一帧轻点(power = 0);返回结果(未咬钩/脱钩 = null) */
  function fishOnce(
    seed: number,
    fullPower: boolean,
  ): { loop: CoreLoop; caught: boolean; quality: FishQuality } | null {
    const l = newLoop(seed)
    if (fullPower) {
      l.update(DT, HOLD)
      run(l, 1, HOLD)
      l.update(DT, IDLE)
    } else {
      l.update(DT, HOLD)
      l.update(DT, IDLE)
    }
    expect(l.phase).toBe('waiting')
    runUntil(l, 10, IDLE, x => x.phase !== 'waiting')
    if (l.fish === null) return null
    l.update(DT, HOLD) // 咬钩窗口内起竿
    runUntil(l, 60, HOLD, x => x.phase === 'caught' || x.phase === 'escaped')
    return { loop: l, caught: l.phase === 'caught', quality: l.caughtQuality }
  }

  it('捕获结算沿 roll 品质:caughtQuality 落在三档内,同种子同输入可复现', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const a = fishOnce(seed, true)
      const b = fishOnce(seed, true)
      expect(b!.caught).toBe(a!.caught)
      expect(b!.quality).toBe(a!.quality)
      if (a!.caught) {
        expect(a!.quality === 'normal' || a!.quality === 'silver' || a!.quality === 'gold').toBe(true)
        // 得分/图鉴轨不受品质影响:捕获得分恒 = 鱼分值(期望值来自目录,独立来源)
        expect(a!.loop.score).toBe(a!.loop.fish!.score)
      }
    }
  })

  it('品质 roll 走独立派生种子:首次捕获的品质 = sessionQualityRng 首签(主序列不含品质抽)', () => {
    let checked = 0
    for (let seed = 1; seed <= 60 && checked < 10; seed++) {
      const r = fishOnce(seed, true)
      if (!r?.caught) continue
      expect(r.quality).toBe(rollQuality(sessionQualityRng(seed), 1))
      checked++
    }
    expect(checked).toBeGreaterThanOrEqual(5)
  })

  it('蓄力越高星级概率越高:固定 120 种子下,蓄满捕获的银/金星占比高于轻抛', () => {
    const starRate = (fullPower: boolean): { stars: number; caught: number } => {
      let stars = 0
      let caught = 0
      for (let seed = 1; seed <= 120; seed++) {
        const r = fishOnce(seed, fullPower)
        if (!r?.caught) continue
        caught++
        if (r.quality !== 'normal') stars++
      }
      return { stars, caught }
    }
    const full = starRate(true)
    const tap = starRate(false)
    expect(full.caught).toBeGreaterThan(30) // 两种蓄力下都有足量捕获样本
    expect(tap.caught).toBeGreaterThan(30)
    expect(full.stars / full.caught).toBeGreaterThan(tap.stars / tap.caught)
  })
})

describe('竿档注入(接缝:换竿 → 物理生效)', () => {
  /** 组合根时序:先注入竿参数,再进入小游戏(解锁当竿 / 启动恢复同款) */
  function enterMinigame(seed: number, rod?: BarParams): CoreLoop {
    const l = newLoop(seed)
    if (rod) l.setRodParams(rod)
    castFull(l)
    runUntil(l, 10, IDLE, x => x.phase !== 'waiting')
    l.update(DT, HOLD)
    expect(l.phase).toBe('minigame')
    return l
  }

  it('未注入 = 现行手感:初始位置按现行绿条高度(0.36 = (1 − 0.28) / 2)', () => {
    const l = enterMinigame(42)
    expect(l.mg!.barY).toBeCloseTo(0.36, 10)
  })

  it('注入更高绿条(height 0.4):初始位置 0.3,同行输入下轨迹与现行竿分岔', () => {
    const taller: BarParams = { ...TUNE.bar, height: 0.4 }
    const a = enterMinigame(42, taller)
    expect(a.mg!.barY).toBeCloseTo(0.3, 10)
    const b = enterMinigame(42)
    run(a, 1, HOLD)
    run(b, 1, HOLD)
    expect(a.mg!.barY).not.toBe(b.mg!.barY)
  })

  it('只读暴露 rodParams:未注入 = 现行手感(绿条高度 0.28)', () => {
    expect(newLoop().rodParams.height).toBe(0.28)
  })

  it('只读暴露 rodParams:注入后返回注入值(渲染层绿条绘制跟随换竿)', () => {
    const l = newLoop()
    l.setRodParams({ ...TUNE.bar, height: 0.4 })
    expect(l.rodParams.height).toBe(0.4)
  })
})

describe('饵效果单缝注入(接缝:本竿饵效果 → 等待减半 × 浓饵权重,票 #19/#21 两缝合一)', () => {
  it('默认未注入 = 现行分布:种子 42 蓄满抛竿,等待时长与现行逐位一致', () => {
    const l = newLoop(42)
    castFull(l)
    // 期望值独立导出(不读实现):mulberry32(42) 首抽 u = 0.6011037519201636,
    // waitTime = TUNE.wait.min + (max − min) × u = 1.5 + 4.5 × u
    expect(l.waitTime).toBeCloseTo(4.204966883640736, 10)
  })

  it('注入 waitScale 0.5(香饵):同种子下等待时长恰为现行一半(min/max 同乘,分布形状不变)', () => {
    const a = newLoop(42)
    castFull(a)
    const b = newLoop(42)
    b.setBaitEffectSource(() => ({ waitScale: 0.5, richBait: false }))
    castFull(b)
    // 期望值独立导出:同一首抽 u,系数减半 → 1.5×0.5 + 4.5×0.5 × u
    expect(b.waitTime).toBeCloseTo(2.102483441820368, 10)
    // 关系侧写:同种子同输入,注入后的抽取序列与默认逐位一致,只是时长同乘系数
    expect(b.waitTime).toBeCloseTo(a.waitTime / 2, 12)
  })

  it('默认 = 现行权重:显式恒 null 来源与未注入同种子同输入出鱼逐位一致(未装备 = 现行)', () => {
    for (const seed of [7, 42, 123]) {
      const a = newLoop(seed)
      castFull(a)
      runUntil(a, 10, IDLE, x => x.phase !== 'waiting')
      const b = newLoop(seed)
      b.setBaitEffectSource(() => null)
      castFull(b)
      runUntil(b, 10, IDLE, x => x.phase !== 'waiting')
      expect(b.fish!.id).toBe(a.fish!.id)
    }
  })

  it('饵效果来源在抛竿时刻恰好调用一次:返回值决定本竿效果,等待/咬钩/小游戏/结算不再调用', () => {
    let calls = 0
    const l = newLoop(42)
    l.setBaitEffectSource(() => {
      calls += 1
      return null
    })
    castFull(l)
    expect(calls).toBe(1) // 抛竿边沿一次:组合根的消耗接线由此保证每竿只扣一支饵
    runUntil(l, 10, IDLE, x => x.phase !== 'waiting')
    l.update(DT, HOLD) // 起竿进小游戏、打到结算:来源不再被调用
    runUntil(l, 60, HOLD, x => x.phase === 'caught' || x.phase === 'escaped')
    expect(calls).toBe(1)
  })

  it('注入浓饵效果(richBait true,waitScale 1):固定环境(夏·日·晴)下,固定 120 种子的难鱼(闪电梭)命中数高于默认', () => {
    // 环境 = clock + weather 注入(既有 world 注入缝),统计在固定种子集上完全确定
    const world = { clock: () => new Date(2024, 6, 15, 12, 0, 0), weather: 'sunny' as const }
    const hardAtBite = (rich: boolean): number => {
      let hard = 0
      for (let seed = 1; seed <= 120; seed++) {
        const l = new CoreLoop(new Rng(seed), world)
        l.setInteractionSource(() => ({ kind: 'spot' })) // 票 #36:抛竿须在钓位范围内
        if (rich) l.setBaitEffectSource(() => ({ waitScale: 1, richBait: true }))
        castFull(l)
        runUntil(l, 10, IDLE, x => x.phase !== 'waiting')
        if (l.fish?.id === 'shandiansuo') hard += 1
      }
      return hard
    }
    const plain = hardAtBite(false)
    const rich = hardAtBite(true)
    expect(rich).toBeGreaterThan(plain)
  })
})

describe('交互点门禁(接缝:setInteractionSource,票 #36 有意规格变更:「原地任意处抛竿」→「钓位范围内才可抛」)', () => {
  it('未注入交互来源:idle 按下不蓄力(缺省世界无交互点,范围外无动作)', () => {
    const l = newLoop()
    l.setInteractionSource(() => null)
    l.update(DT, HOLD)
    expect(l.phase).toBe('idle')
    expect(l.power).toBe(0)
  })

  it('范围内最近是摊位(stall):按下不开竿(摊位动作 = 开商店,归组合根)', () => {
    const l = newLoop()
    l.setInteractionSource(() => ({ kind: 'stall' }))
    l.update(DT, HOLD)
    expect(l.phase).toBe('idle')
  })

  it('范围内是钓位(spot):按下蓄力、松开抛竿,手感与现行逐位一致', () => {
    const a = newLoop() // 助手已注入恒定钓位来源
    const b = newLoop()
    b.setInteractionSource(() => ({ kind: 'spot' }))
    castFull(a)
    castFull(b)
    expect(b.phase).toBe('waiting')
    expect(b.waitTime).toBe(a.waitTime) // 同种子同输入:门禁不改抽取序列
  })

  it('按下瞬间不在范围:这一按不作数(按住走进范围也不补蓄,松开再按才触发)', () => {
    let inRange = false
    const l = newLoop()
    l.setInteractionSource(() => (inRange ? { kind: 'spot' } : null))
    l.update(DT, HOLD) // 范围外按下
    expect(l.phase).toBe('idle')
    inRange = true
    run(l, 0.5, HOLD) // 按住走进范围:无按下边沿,不蓄力
    expect(l.phase).toBe('idle')
    l.update(DT, IDLE)
    l.update(DT, HOLD) // 重新按下
    expect(l.phase).toBe('charging')
  })
})

describe('垂钓全程锁移动(接缝:update 移动窗口,票 #36 有意规格变更:charging/waiting 可走 → 收紧为仅 idle)', () => {
  function stationAt(): CoreLoop {
    const l = newLoop()
    l.px = 100
    l.py = 100
    return l
  }

  it('蓄力中移动锁死:按住蓄力同时推方向,位置不动(抛竿起站定)', () => {
    const l = stationAt()
    l.update(DT, HOLD)
    expect(l.phase).toBe('charging')
    run(l, 0.5, { holding: true, moveX: 1, moveY: 1 })
    expect(l.px).toBe(100)
    expect(l.py).toBe(100)
  })

  it('等待中移动锁死:等待照走、收竿照常,但位置不动', () => {
    const l = stationAt()
    castFull(l)
    expect(l.phase).toBe('waiting')
    run(l, 0.5, { holding: false, moveX: 1, moveY: 1 })
    expect(l.px).toBe(100)
    expect(l.py).toBe(100)
  })

  it('回到 idle 恢复移动(结算停留后站走自如)', () => {
    const l = stationAt()
    castFull(l)
    runUntil(l, 10, IDLE, x => x.phase !== 'waiting')
    run(l, 2, IDLE) // 咬钩窗口耗尽 + 结算停留走完
    expect(l.phase).toBe('idle')
    run(l, 1, { holding: false, moveX: 1, moveY: 0 })
    expect(l.px).toBeCloseTo(100 + TUNE.move.speed, 10)
  })
})

describe('世界碰撞注入(接缝:setWorldCollision,票 #34)', () => {
  /**
   * 竖墙替身:x ∈ [192, 208) 的 tile 列不可走(核心不感知地图,
   * 只见「这个脚部盒是否被挡」的谓词输出)。
   */
  function walledLoop(): CoreLoop {
    const l = newLoop()
    l.setWorldCollision({
      widthPx: 960,
      heightPx: 416,
      blockedBox: (cx, cy, hw, hh) => cx + hw > 192 && cx - hw < 208 && cy - hh < 416 && cy + hh > 0,
    })
    return l
  }

  it('水 tile/大件挡人:X 轴停在盒贴墙一步之内,且不再穿墙', () => {
    const l = walledLoop()
    l.px = 100
    l.py = 200
    run(l, 5, RIGHT)
    // 一步 ≤ 70/60 ≈ 1.17px:被挡轴停在墙沿一个步长之内(try/cancel 语义)
    expect(l.px).toBeGreaterThanOrEqual(187 - 70 / 60)
    expect(l.px).toBeLessThanOrEqual(187)
    const stopped = l.px
    run(l, 2, RIGHT)
    expect(l.px).toBe(stopped) // 抵墙后位置稳定(无抖动、不穿墙)
  })

  it('轴分离滑动:斜向撞墙,X 被挡 Y 照常走(可沿墙滑行)', () => {
    const l = walledLoop()
    l.px = 100
    l.py = 100
    run(l, 2, { holding: false, moveX: Math.SQRT1_2, moveY: Math.SQRT1_2 })
    expect(l.px).toBeLessThanOrEqual(187)
    expect(l.px).toBeGreaterThanOrEqual(187 - 70 / 60)
    expect(l.py).toBeCloseTo(100 + 70 * Math.SQRT1_2 * 2, 10)
  })

  it('注入只换参数来源:未注入 = 缺省世界(单屏、无 tile 阻挡)', () => {
    const l = newLoop()
    l.px = 100
    l.py = 100
    run(l, 2, RIGHT)
    expect(l.px).toBeCloseTo(100 + 2 * 70, 10) // 未注入:一路走到单屏钳制前
  })
})
