import { describe, expect, it } from 'vitest'
import { FOOTSTEP_INTERVAL_S, advanceStepClock } from './footstepClock'

/**
 * 接缝:脚步步频钟(纯函数,票 #44)。期望值为独立语义钉死:
 * 实际位移超阈值才积累相位、按步距逐次触发;停步即归零,复走从零起步。
 */
describe('advanceStepClock(接缝:行走步频)', () => {
  it('静止(位移≈0)不触发且相位归零(停止即停)', () => {
    expect(advanceStepClock(0.1, 0.016, 0)).toEqual({ accum: 0, fire: false })
    expect(advanceStepClock(0.27, 0.016, 0.05)).toEqual({ accum: 0, fire: false })
  })

  it('移动中按步距积累,恰好跨过步距时触发一次并保留余量', () => {
    // 步距 0.28:三帧 0.1s = 0.1 / 0.2 / 0.3 → 第三帧触发,余量 0.02(浮点容差)
    expect(advanceStepClock(0, 0.1, 5)).toEqual({ accum: 0.1, fire: false })
    expect(advanceStepClock(0.1, 0.1, 5)).toEqual({ accum: 0.2, fire: false })
    const third = advanceStepClock(0.2, 0.1, 5)
    expect(third.fire).toBe(true)
    expect(third.accum).toBeCloseTo(0.02, 10)
  })

  it('复走从零积累:停步归零后不会立刻连响', () => {
    // 停步(相位归零)→ 重新走,第一步仍要等满一个步距
    expect(advanceStepClock(0, 0.1, 5).fire).toBe(false)
    expect(advanceStepClock(0.27, 0.016, 0).accum).toBe(0)
  })

  it('碰撞抵消的帧(位移 < 阈值)视同静止,不积累', () => {
    expect(advanceStepClock(0.25, 0.016, 0.08).fire).toBe(false)
    expect(advanceStepClock(0.25, 0.016, 0.08).accum).toBe(0)
  })

  it('掉帧大步长跨过多个步距只触发一次(一帧一响,不补响)', () => {
    const r = advanceStepClock(0, 0.9, 5)
    expect(r.fire).toBe(true)
    expect(r.accum).toBeLessThan(FOOTSTEP_INTERVAL_S)
  })

  it('步距可注入(自定义值按注入值触发)', () => {
    expect(advanceStepClock(0, 0.5, 5, 0.5)).toEqual({ accum: 0, fire: true })
    expect(advanceStepClock(0, 0.4, 5, 0.5)).toEqual({ accum: 0.4, fire: false })
  })
})
