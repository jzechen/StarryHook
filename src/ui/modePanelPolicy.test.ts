import { describe, expect, it } from 'vitest'
import { modePanelAllowed } from './modePanelPolicy'

describe('模式入口策略(接缝:纯函数,票 #24)', () => {
  it('仅待机可开;蓄力/等待/咬钩/小游戏/结算(捕获、脱钩)一律禁用(与既有面板同规则)', () => {
    expect(modePanelAllowed('idle')).toBe(true)
    for (const phase of ['charging', 'waiting', 'bite', 'minigame', 'caught', 'escaped'] as const) {
      expect(modePanelAllowed(phase), phase).toBe(false)
    }
  })
})
