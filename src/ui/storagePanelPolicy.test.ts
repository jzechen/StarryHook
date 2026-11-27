import { describe, expect, it } from 'vitest'
import { storagePanelAllowed } from './storagePanelPolicy'

describe('储物箱面板开关策略(接缝:storagePanelAllowed,票 #40)', () => {
  it('仅待机可开(与商店同口径):垂钓进行中不开箱', () => {
    expect(storagePanelAllowed('idle')).toBe(true)
    expect(storagePanelAllowed('charging')).toBe(false)
    expect(storagePanelAllowed('waiting')).toBe(false)
    expect(storagePanelAllowed('bite')).toBe(false)
    expect(storagePanelAllowed('minigame')).toBe(false)
    expect(storagePanelAllowed('caught')).toBe(false)
    expect(storagePanelAllowed('escaped')).toBe(false)
  })
})
