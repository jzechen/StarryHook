import { describe, expect, it } from 'vitest'
import { catchSettlementText, roundSettlementText } from './roundSettlementText'

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

describe('捕获结算文本(接缝:catchSettlementText,结算文本注品质,票 #39)', () => {
  it('普通渔获不注星:文案与现行捕获提示逐字一致', () => {
    expect(catchSettlementText('小白条', 10, 'normal')).toBe('钓到了「小白条」 +10 分!')
  })

  it('银星/金星渔获在鱼名后注品质(普通无星标,故不注)', () => {
    expect(catchSettlementText('小白条', 10, 'silver')).toBe('钓到了「小白条」·银星 +10 分!')
    expect(catchSettlementText('闪电梭', 50, 'gold')).toBe('钓到了「闪电梭」·金星 +50 分!')
  })
})
