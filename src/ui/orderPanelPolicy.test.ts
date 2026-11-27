import { describe, expect, it } from 'vitest'
import { orderPanelAllowed } from './orderPanelPolicy'

describe('公告板面板开关策略(接缝:orderPanelAllowed,票 #55)', () => {
  it('仅待机可开;垂钓各相位与结算一律禁用(与商店/储物箱同口径)', () => {
    expect(orderPanelAllowed('idle')).toBe(true)
    for (const phase of ['charging', 'waiting', 'bite', 'minigame', 'caught', 'escaped'] as const) {
      expect(orderPanelAllowed(phase)).toBe(false)
    }
  })
})
