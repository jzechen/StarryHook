import { describe, expect, it } from 'vitest'
import type { LoopPhase } from '../core/types'
import { BITE_SHAKE, CATCH_SHAKE, ScreenShake, shakeOffset, shakeTrigger } from './screenShake'

/**
 * 咬钩屏幕 shake(接缝:shakeTrigger 触发策略 + shakeOffset 轨迹纯函数 +
 * ScreenShake 状态壳,票 #43,spec §5.2)。
 *
 * 强度口径:克制(幅度个位数像素)、单次 <1s、相机偏移整数取整;
 * 触发点仅咬钩/捕获两处(spec §5.2 唯二屏幕级反馈,其余相位转移零 shake)。
 */

describe('shake 触发策略(接缝:shakeTrigger 纯函数)', () => {
  it('仅咬钩/捕获两触发点:进入 bite / caught 边沿给档位', () => {
    expect(shakeTrigger('waiting', 'bite')).toBe('bite')
    expect(shakeTrigger('minigame', 'caught')).toBe('catch')
  })

  it('其余相位转移一律 null(收竿/脱钩/回待机/小游戏内不 shake)', () => {
    const phases: LoopPhase[] = ['idle', 'charging', 'waiting', 'bite', 'minigame', 'caught', 'escaped']
    for (const prev of phases) {
      for (const next of phases) {
        const kind = shakeTrigger(prev, next)
        if (next === 'bite' && prev !== 'bite') expect(kind).toBe('bite')
        else if (next === 'caught' && prev !== 'caught') expect(kind).toBe('catch')
        else expect(kind).toBeNull()
      }
    }
  })
})

describe('shake 轨迹(接缝:shakeOffset 纯函数)', () => {
  it('幅度有界且为整数像素(克制口径,无亚像素抖动)', () => {
    for (const kind of ['bite', 'catch'] as const) {
      const spec = kind === 'bite' ? BITE_SHAKE : CATCH_SHAKE
      for (let ms = 0; ms < spec.duration * 1000; ms += 7) {
        const off = shakeOffset(kind, ms / 1000)
        expect(Number.isInteger(off.x)).toBe(true)
        expect(Number.isInteger(off.y)).toBe(true)
        expect(Math.abs(off.x)).toBeLessThanOrEqual(spec.amplitude)
        expect(Math.abs(off.y)).toBeLessThanOrEqual(spec.amplitude)
      }
    }
  })

  it('幅度随时长线性衰减:起点不小于终点,寿命尽归零', () => {
    const spec = CATCH_SHAKE
    const first = shakeOffset('catch', 0)
    const late = shakeOffset('catch', spec.duration * 0.9)
    expect(Math.abs(late.x)).toBeLessThanOrEqual(Math.abs(first.x))
    expect(Math.abs(late.y)).toBeLessThanOrEqual(Math.abs(first.y))
    expect(shakeOffset('catch', spec.duration)).toEqual({ x: 0, y: 0 })
    expect(shakeOffset('catch', spec.duration + 5)).toEqual({ x: 0, y: 0 })
  })

  it('同刻采样逐位一致(确定性),步进换向在半幅内必改变方向', () => {
    expect(shakeOffset('bite', 0.04)).toEqual(shakeOffset('bite', 0.04))
    const spec = BITE_SHAKE
    const steps = Math.ceil(spec.duration / 0.04)
    const xs = Array.from({ length: steps }, (_, i) => shakeOffset('bite', (i * spec.duration) / steps).x)
    // 抖动 = 往复:全程恒 0 不是 shake;恒非 0 也不是(须换向)
    expect(xs.some(v => v !== 0)).toBe(true)
    expect(new Set(xs).size).toBeGreaterThan(1)
  })

  it('两档时长均 <1s(单次效果口径)', () => {
    expect(BITE_SHAKE.duration).toBeLessThan(1)
    expect(CATCH_SHAKE.duration).toBeLessThan(1)
    expect(BITE_SHAKE.amplitude).toBeLessThanOrEqual(CATCH_SHAKE.amplitude)
  })
})

describe('shake 状态壳(接缝:ScreenShake.update)', () => {
  it('触发后推进给出偏移,寿命尽自动停止(回到 0,active 翻否)', () => {
    const shake = new ScreenShake()
    expect(shake.active).toBe(false)
    expect(shake.update(0.016)).toEqual({ x: 0, y: 0 })

    shake.trigger('bite')
    expect(shake.active).toBe(true)
    const off = shake.update(0.016)
    expect(Number.isInteger(off.x)).toBe(true)

    // 推进超过 bite 寿命:偏移归零且不再 active
    for (let i = 0; i < 30; i++) shake.update(0.016)
    expect(shake.active).toBe(false)
    expect(shake.update(0.016)).toEqual({ x: 0, y: 0 })
  })

  it('演出中再触发 = 重新计时(bite 后随即捕获,捕获档完整播放)', () => {
    const shake = new ScreenShake()
    shake.trigger('bite')
    shake.update(BITE_SHAKE.duration / 2)
    shake.trigger('catch')
    // 若未重置,catch 档此刻应已衰减近半;重触发后按满幅起
    const off = shake.update(0.016)
    expect(shakeOffset('catch', 0.016)).toEqual(off)
  })

  it('不触发时长期推进恒 0(零开销路径)', () => {
    const shake = new ScreenShake()
    for (let i = 0; i < 600; i++) {
      expect(shake.update(1 / 60)).toEqual({ x: 0, y: 0 })
    }
  })
})
