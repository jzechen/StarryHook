import { describe, expect, it } from 'vitest'
import { waterSwitchAllowed } from './waterSwitchPolicy'

describe('换水域入口策略(接缝:纯函数,票 #15)', () => {
  it('待机可开;蓄力/等待/咬钩/小游戏/结算(捕获、脱钩)一律禁用', () => {
    expect(waterSwitchAllowed('idle')).toBe(true)
    for (const phase of ['charging', 'waiting', 'bite', 'minigame', 'caught', 'escaped'] as const) {
      expect(waterSwitchAllowed(phase), phase).toBe(false)
    }
  })
})
