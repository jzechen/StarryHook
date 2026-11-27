import { describe, expect, it } from 'vitest'
import { countdownTick } from './countdownTick'

/** 快照字面量(结构最小面,CoreLoop 公开只读 getter 满足此形) */
function timed(remaining: number) {
  return { mode: 'timed' as const, roundActive: true, timeRemaining: remaining }
}

/**
 * 接缝:限时局倒计时 tick(纯函数,票 #44)。期望值为独立语义钉死:
 * 仅限时局中、剩余 ≤10s 时,整秒边沿(向下的跨秒)各响一次;归零帧不响。
 */
describe('countdownTick(接缝:最后 10 秒每秒一响)', () => {
  it('限时局中跨入最后 10 秒的整秒边沿触发(10.4 → 9.97)', () => {
    expect(countdownTick(10.4, timed(9.97))).toBe(true)
  })

  it('同一秒内推进不触发(0.5 → 0.2 未跨秒)', () => {
    expect(countdownTick(0.5, timed(0.2))).toBe(false)
  })

  it('恰好跨到 10.0 整秒触发(宣布「10 秒」)', () => {
    expect(countdownTick(10.4, timed(10.0))).toBe(true)
  })

  it('剩余仍在 10 秒以上不触发(11.0 → 10.9)', () => {
    expect(countdownTick(11.0, timed(10.9))).toBe(false)
  })

  it('最后一响 = 跨到剩 1 秒内(1.01 → 0.99)', () => {
    expect(countdownTick(1.01, timed(0.99))).toBe(true)
  })

  it('归零强制结算帧不触发(0.98 → 0,归零不新增音效)', () => {
    expect(countdownTick(0.98, timed(0))).toBe(false)
  })

  it('非限时模式不触发(无限休闲没有倒计时)', () => {
    expect(countdownTick(10.4, { mode: 'casual' as const, roundActive: false, timeRemaining: 0 })).toBe(false)
  })

  it('限时但局已结束(roundActive = false)不触发', () => {
    expect(countdownTick(9.5, { mode: 'timed' as const, roundActive: false, timeRemaining: 0 })).toBe(false)
  })

  it('单帧大跳跨多个整秒边沿至多一响(一帧一响,不连响)', () => {
    expect(countdownTick(10.4, timed(8.3))).toBe(true)
  })

  it('时间倒流式输入不触发(防御:剩余变大不响)', () => {
    expect(countdownTick(3.2, timed(4.1))).toBe(false)
  })
})
