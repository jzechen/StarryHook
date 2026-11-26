import { describe, expect, it } from 'vitest'
import { Rng } from './rng'

describe('Rng(接缝:可复现随机)', () => {
  it('同种子产生完全一致的序列', () => {
    const a = new Rng(123)
    const b = new Rng(123)
    for (let i = 0; i < 8; i++) {
      expect(a.float()).toBe(b.float())
    }
  })

  it('不同种子产生不同序列', () => {
    const ra = new Rng(1)
    const rb = new Rng(2)
    const a = Array.from({ length: 5 }, () => ra.float())
    const b = Array.from({ length: 5 }, () => rb.float())
    expect(a).not.toEqual(b)
  })

  it('range 结果始终落在 [min, max)', () => {
    const r = new Rng(7)
    for (let i = 0; i < 50; i++) {
      const v = r.range(2, 5)
      expect(v).toBeGreaterThanOrEqual(2)
      expect(v).toBeLessThan(5)
    }
  })

  it('pick 权重为 0 的项永远不会被抽中', () => {
    const r = new Rng(9)
    const items = ['a', 'b', 'c'] as const
    for (let i = 0; i < 30; i++) {
      expect(r.pick(items, [1, 0, 0])).toBe('a')
      expect(r.pick(items, [0, 1, 0])).toBe('b')
    }
  })
})
