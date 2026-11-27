/**
 * 角色行走图契约(接缝:public/sprites/character.png 产物 + 派生管线)。
 *
 * 票 #49 review 修复的回归锁:历史产物每向 4 帧逐像素相同(2×2 众数把腿部
 * 动画压没,行走换帧从未生效)。两条契约钉死:
 * 1. 行走换帧可见——每向相邻帧像素差 > 0(4 向 × 3 对全查);
 * 2. 产物可复现——committed 件与从 oga-src/ch003.png 重派生的图集逐像素一致
 *   (「产物字节由图集契约测试与 git 锁定」纪律,与 bobber/fish 图集同款)。
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { decodePng, deriveCharacterAtlas, frameDiffs } from './generate-character-sprite.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const ASSET = `${root}/public/sprites/character.png`
const SOURCE = `${root}/public/sprites/oga-src/ch003.png`

describe('character.png(角色行走图契约:换帧可见 + 可复现)', () => {
  it('尺寸 64×64(4 向 × 4 帧 × 16×16,textures.ts 切片契约)', () => {
    const img = decodePng(ASSET)
    expect(img.width).toBe(64)
    expect(img.height).toBe(64)
  })

  it('行走换帧确有差异:每向相邻帧像素差 > 0(4 向 × 3 对,死帧即红)', () => {
    const diffs = frameDiffs(decodePng(ASSET).px)
    for (let row = 0; row < diffs.length; row++) {
      for (const d of diffs[row]) {
        expect(d, `方向行 ${row} 存在死帧`).toBeGreaterThan(0)
      }
    }
  })

  it('产物与重派生逐像素一致(oga-src/ch003.png → 2×2 不透明众数,可复现)', () => {
    const committed = decodePng(ASSET).px
    const derived = deriveCharacterAtlas(decodePng(SOURCE))
    expect(Buffer.compare(committed, derived)).toBe(0)
  })
})
