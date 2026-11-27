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

  it('无面板、叙事物在前:按下 = 读彩蛋文案(票 #37:路牌/井石台)', () => {
    expect(stallPressAction(false, 'sign')).toBe('read-narrative')
    expect(stallPressAction(false, 'note')).toBe('read-narrative')
  })

  it('无面板、储物箱在前:按下 = 开储物箱面板(票 #40,spec §2.1/§4.4)', () => {
    expect(stallPressAction(false, 'storage')).toBe('open-storage')
  })

  it('无面板、宝箱在前:按下 = 开箱(票 #41,spec §4.5;一次性由已开态 store 把关)', () => {
    expect(stallPressAction(false, 'chest')).toBe('open-chest')
  })

  it('面板打开时宝箱同样让位关面板(关闭口径优先,票 #41 沿用 #36 优先级)', () => {
    expect(stallPressAction(true, 'chest')).toBe('close-panel')
  })

  it('面板打开时储物箱同样让位关面板(关闭口径优先,票 #40 沿用 #36 优先级)', () => {
    expect(stallPressAction(true, 'storage')).toBe('close-panel')
  })

  it('面板打开时叙事物同样让位关面板(关闭口径优先,票 #37 沿用 #36 优先级)', () => {
    expect(stallPressAction(true, 'sign')).toBe('close-panel')
    expect(stallPressAction(true, 'note')).toBe('close-panel')
  })

  it('无面板、公告板在前:按下 = 开公告板面板(票 #55,查看订单/交付)', () => {
    expect(stallPressAction(false, 'board')).toBe('open-board')
  })

  it('面板打开时公告板同样让位关面板(关闭口径优先,票 #55 沿用 #36 优先级)', () => {
    expect(stallPressAction(true, 'board')).toBe('close-panel')
  })
})
