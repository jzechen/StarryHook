import { describe, expect, it } from 'vitest'
import { AREA_PALETTES } from './areaPalette'

describe('水域演出色调表(接缝:渲染层纯数据,票 #15)', () => {
  it('池塘 = 既有默认观感:tint 全白(素材原样),池底/描边 = 既有两色', () => {
    expect(AREA_PALETTES.pond).toEqual({ fill: 0x5c9ce2, stroke: 0x0f3a4d, water: 0xffffff, bank: 0xffffff })
  })

  it('三水域色调两两可区分(池底色与水面 tint 均互不相同)', () => {
    const ids = ['pond', 'river', 'lake'] as const
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        expect(AREA_PALETTES[ids[i]!].fill, `${ids[i]} vs ${ids[j]} fill`).not.toBe(AREA_PALETTES[ids[j]!].fill)
        expect(AREA_PALETTES[ids[i]!].water, `${ids[i]} vs ${ids[j]} water`).not.toBe(AREA_PALETTES[ids[j]!].water)
      }
    }
  })
})
