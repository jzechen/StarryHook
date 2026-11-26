import { describe, expect, it } from 'vitest'
import { countdownBadgeText } from './countdownBadgeText'

describe('顶栏倒计时文案(接缝:纯函数,票 #24)', () => {
  it('无限模式恒 null:顶栏完全不显示,切回无限无残留', () => {
    expect(countdownBadgeText('casual', 120)).toBeNull()
    expect(countdownBadgeText('casual', 0)).toBeNull()
  })

  it('限时模式按分:秒格式化;走秒内向上取整(未走满一秒仍显示整秒)', () => {
    expect(countdownBadgeText('timed', 120)).toBe('2:00')
    expect(countdownBadgeText('timed', 119.4)).toBe('2:00')
    expect(countdownBadgeText('timed', 119)).toBe('1:59')
    expect(countdownBadgeText('timed', 65)).toBe('1:05')
    expect(countdownBadgeText('timed', 60)).toBe('1:00')
    expect(countdownBadgeText('timed', 59.5)).toBe('1:00')
  })

  it('秒数两位补零;归零定格 0:00', () => {
    expect(countdownBadgeText('timed', 5)).toBe('0:05')
    expect(countdownBadgeText('timed', 0)).toBe('0:00')
  })
})
