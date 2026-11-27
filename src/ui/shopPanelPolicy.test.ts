import { describe, expect, it } from 'vitest'
import { shopPanelAllowed } from './shopPanelPolicy'

describe('商店入口策略(接缝:纯函数,票 #20)', () => {
  it('仅待机可开;蓄力/等待/咬钩/小游戏/结算(捕获、脱钩)一律禁用', () => {
    expect(shopPanelAllowed('idle')).toBe(true)
    for (const phase of ['charging', 'waiting', 'bite', 'minigame', 'caught', 'escaped'] as const) {
      expect(shopPanelAllowed(phase), phase).toBe(false)
    }
  })
})
