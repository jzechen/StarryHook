import { describe, expect, it } from 'vitest'
import { baitBadgeText } from './baitBadgeText'

describe('装备中鱼饵的顶栏徽章文案(纯函数)', () => {
  it('装备且有余量:「饵名 ×剩余数」', () => {
    expect(baitBadgeText({ name: '香饵', count: 9 })).toBe('香饵 ×9')
    expect(baitBadgeText({ name: '浓饵', count: 1 })).toBe('浓饵 ×1')
  })

  it('余量耗尽(count 0)→ null:徽章自动消失(耗尽语义随状态走)', () => {
    expect(baitBadgeText({ name: '香饵', count: 0 })).toBeNull()
  })

  it('未装备(null)→ null:无饵常驻展示', () => {
    expect(baitBadgeText(null)).toBeNull()
  })

  it('异常负数余量按耗尽处理 → null,不产生「×-1」类文案', () => {
    expect(baitBadgeText({ name: '香饵', count: -3 })).toBeNull()
  })
})
