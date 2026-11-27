import { describe, expect, it } from 'vitest'
import { backpackPanelAllowed } from './backpackPanelPolicy'

describe('背包面板开关策略(接缝:backpackPanelAllowed,票 #40)', () => {
  it('待机/蓄力/等待可开(与图鉴同口径);咬钩/小游戏/结算禁用', () => {
    expect(backpackPanelAllowed('idle')).toBe(true)
    expect(backpackPanelAllowed('charging')).toBe(true)
    expect(backpackPanelAllowed('waiting')).toBe(true)
    expect(backpackPanelAllowed('bite')).toBe(false)
    expect(backpackPanelAllowed('minigame')).toBe(false)
    expect(backpackPanelAllowed('caught')).toBe(false)
    expect(backpackPanelAllowed('escaped')).toBe(false)
  })
})
