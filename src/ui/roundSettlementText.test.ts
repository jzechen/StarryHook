import { describe, expect, it } from 'vitest'
import { roundSettlementText } from './roundSettlementText'

describe('限时局结算提示文案(接缝:纯函数,票 #24)', () => {
  it('本局得分必现(归零定格分,期望值为独立字面量)', () => {
    expect(roundSettlementText(0, false)).toBe('本局得分 0')
    expect(roundSettlementText(87, false)).toBe('本局得分 87')
  })

  it('破纪录才追加「破纪录!」;未破不追加', () => {
    expect(roundSettlementText(120, true)).toBe('本局得分 120 · 破纪录!')
    expect(roundSettlementText(120, false)).toBe('本局得分 120')
  })
})
