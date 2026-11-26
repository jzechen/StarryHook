import { describe, expect, it } from 'vitest'
import { fishSpriteOffsetY } from './fishAtlas'

/**
 * 鱼行序 → sprite 定位的换算契约(接缝:纯函数)。
 *
 * 图鉴 DOM 的 background-position-y 不再在 UI 里手写换算——
 * 「行序 × 帧边长 × 缩放取负」属于图集切片契约,单源于
 * render/fishAtlas.ts,UI 只消费其结果。
 *
 * 期望值全部为独立字面量(手算:行序 × 16 × scale 取负),
 * 不从 FISH_SHAPE_ROW / FISH_FRAME_SIZE 推导,避免同义反复。
 */
describe('鱼精灵定位换算(接缝:fishSpriteOffsetY 纯函数)', () => {
  it('图鉴默认 2x:各鱼行序的 Y 偏移为行序 × 16 × 2 取负', () => {
    expect(fishSpriteOffsetY('slim', 2)).toEqual(0) // 行 0
    expect(fishSpriteOffsetY('round', 2)).toBe(-32) // 行 1
    expect(fishSpriteOffsetY('heavy', 2)).toBe(-64) // 行 2
    expect(fishSpriteOffsetY('puff', 2)).toBe(-96) // 行 3
    expect(fishSpriteOffsetY('bolt', 2)).toBe(-128) // 行 4
  })

  it('缩放是参数:1x 按 16px/行,1.5x 按比例(像素可非整)', () => {
    expect(fishSpriteOffsetY('heavy', 1)).toBe(-32)
    expect(fishSpriteOffsetY('puff', 1.5)).toBe(-72)
  })

  it('行 0 在 DOM 上必须渲染为 "0px"(不得出现 "-0px")', () => {
    expect(`${fishSpriteOffsetY('slim', 2)}px`).toBe('0px')
  })
})
