import { describe, expect, it } from 'vitest'
import { stallPressAction } from './interactionPolicy'

describe('动作键意图(接缝:stallPressAction,票 #36)', () => {
  it('面板打开时按下动作键 = 关面板(关闭口径:ESC/关钮/再按动作键)', () => {
    expect(stallPressAction(true, 'spot')).toBe('close-panel')
    expect(stallPressAction(true, 'stall')).toBe('close-panel')
    expect(stallPressAction(true, null)).toBe('close-panel')
  })

  it('无面板、摊位在前:按下 = 开商店', () => {
    expect(stallPressAction(false, 'stall')).toBe('open-shop')
  })

  it('无面板、钓位在前或范围外:组合根无动作(抛竿门禁在核心,经交互来源注入)', () => {
    expect(stallPressAction(false, 'spot')).toBe('none')
    expect(stallPressAction(false, null)).toBe('none')
  })
})
