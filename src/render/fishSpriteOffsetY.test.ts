import { describe, expect, it } from 'vitest'
import { fishSpriteOffsetY } from './fishAtlas'

/**
 * 鱼行序 → sprite 定位的换算契约(接缝:纯函数)。
 *
 * 图鉴 DOM 的 background-position-y 不再在 UI 里手写换算——
 * 「行序 × 帧边长 × 缩放取负」属于图集切片契约,单源于
 * render/fishAtlas.ts,UI 只消费其结果。
 *
 * 票 #53:行序契约从鱼形键改为鱼种键(行 = 鱼种,目录序),本测期望值
 * 全部为独立字面量(手算:行序 × 16 × scale 取负),不从 FISH_SPECIES_ROW
 * / FISH_FRAME_SIZE 推导,避免同义反复。
 */
describe('鱼精灵定位换算(接缝:fishSpriteOffsetY 纯函数,按鱼种)', () => {
  it('图鉴默认 2x:抽查首/中/尾行,偏移 = 行序 × 16 × 2 取负(目录序 = 图集行序)', () => {
    expect(fishSpriteOffsetY('xiaobaitiao', 2)).toEqual(0) // 行 0
    expect(fishSpriteOffsetY('wenzhongji', 2)).toBe(-32) // 行 1
    expect(fishSpriteOffsetY('niquQiu', 2)).toBe(-160) // 行 5
    expect(fishSpriteOffsetY('yueyingMan', 2)).toBe(-448) // 行 14
    expect(fishSpriteOffsetY('shuangqiangGouyu', 2)).toBe(-544) // 行 17(压轴)
  })

  it('缩放是参数:1x 按 16px/行,1.5x 按比例(像素可非整)', () => {
    expect(fishSpriteOffsetY('wenzhongji', 1)).toBe(-16)
    expect(fishSpriteOffsetY('niquQiu', 1.5)).toBe(-120)
  })

  it('行 0 在 DOM 上必须渲染为 "0px"(不得出现 "-0px")', () => {
    expect(`${fishSpriteOffsetY('xiaobaitiao', 2)}px`).toBe('0px')
  })

  it('目录外的鱼种 id 抛错(拼错即红,不静默错位)', () => {
    expect(() => fishSpriteOffsetY('幽灵鱼', 2)).toThrow()
  })
})
