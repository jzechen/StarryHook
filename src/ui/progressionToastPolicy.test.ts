import { describe, expect, it } from 'vitest'
import { progressionToastText } from './progressionToastPolicy'

describe('升级提示文案(接缝:成长反馈)', () => {
  it('未升级(levelsGained = 0)不弹:返回 null', () => {
    expect(progressionToastText({ levelsGained: 0, rodName: null, level: 1 })).toBeNull()
  })

  it('升 1 级 + 解锁新竿:「升级!解锁碳竿」', () => {
    expect(progressionToastText({ levelsGained: 1, rodName: '碳竿', level: 3 })).toBe(
      '升级!解锁碳竿',
    )
  })

  it('升 1 级无新竿:「升级!Lv.2」(Lv 取登记后的当前等级)', () => {
    expect(progressionToastText({ levelsGained: 1, rodName: null, level: 2 })).toBe('升级!Lv.2')
  })

  it('连升 N 级 + 解锁新竿:「连升 3 级!解锁星钩」(合并为一条)', () => {
    expect(progressionToastText({ levelsGained: 3, rodName: '星钩', level: 4 })).toBe(
      '连升 3 级!解锁星钩',
    )
  })

  it('连升但无新竿:「连升 2 级!」(不带 Lv 后缀)', () => {
    expect(progressionToastText({ levelsGained: 2, rodName: null, level: 4 })).toBe('连升 2 级!')
  })

  it('连升跨档(1 级直冲 L6,竹竿 → 星钩):最终竿只报一次,为「连升 5 级!解锁星钩」', () => {
    expect(progressionToastText({ levelsGained: 5, rodName: '星钩', level: 6 })).toBe(
      '连升 5 级!解锁星钩',
    )
  })
})
