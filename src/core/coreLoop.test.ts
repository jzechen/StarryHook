import { describe, expect, it } from 'vitest'
import { CoreLoop, type UpdateInput } from './coreLoop'
import { Rng } from './rng'
import { TUNE } from '../config'

const DT = 1 / 60
const HOLD: UpdateInput = { holding: true, moveX: 0, moveY: 0 }
const IDLE: UpdateInput = { holding: false, moveX: 0, moveY: 0 }
const RIGHT: UpdateInput = { holding: false, moveX: 1, moveY: 0 }

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

  it('移动:被池塘下沿、上沿与左岸依次阻挡(绕行半圈)', () => {
    const l = newLoop()
    run(l, 0.8, RIGHT) // 走到池塘正下方 px≈0.5
    run(l, 2, { holding: false, moveX: 0, moveY: -1 })
    expect(l.py).toBeCloseTo(0.818, 5) // 0.8(池塘下沿) + 0.018(角色半径)
    run(l, 0.8, { holding: false, moveX: -1, moveY: 0 }) // 沿底边向左绕出(px≈0.1,池外)
    run(l, 2, { holding: false, moveX: 0, moveY: -1 })
    expect(l.py).toBeCloseTo(0.06, 5) // 屏幕上缘钳制(px=0.1 在池塘 x 范围外)
    run(l, 0.85, RIGHT) // 顶部右移到池塘正上方 px≈0.5
    run(l, 2, { holding: false, moveX: 0, moveY: 1 })
    expect(l.py).toBeCloseTo(0.122, 5) // 0.14(池塘上沿) - 0.018
    run(l, 0.8, { holding: false, moveX: -1, moveY: 0 }) // 左移回池外 px≈0.1
    run(l, 0.8, { holding: false, moveX: 0, moveY: 1 }) // 下到池腰 py≈0.522(池外)
    run(l, 1, RIGHT) // 向右 → 挡在池塘左岸
    expect(l.px).toBeCloseTo(0.142, 5) // 0.16(池塘左沿) - 0.018
  })

  it('移动:向下走到屏幕下缘被钳制', () => {
    const l = newLoop()
    run(l, 5, { holding: false, moveX: 0, moveY: 1 })
    expect(l.py).toBeCloseTo(0.95, 5)
  })

  it('小游戏期间移动被冻结', () => {
    const l = newLoop()
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
