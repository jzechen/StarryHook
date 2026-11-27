import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * 鱼精灵图集产物契约(票 #11,票 #53 扩容):生成器 scripts/generate-fish-atlas.mjs
 * 与两个消费端(src/render/textures.ts 切片、src/ui/collectionPanel.ts 背景定位)
 * 之间的公共接口。布局 = 独立字面量期望值:
 *   32 宽 = 每鱼 2 帧 × 16px;288 高 = 18 种鱼 × 16px(行序 = 鱼种,目录序,
 *   见 render/fishAtlas.ts FISH_SPECIES_ROW)。
 * 像素美术本身不在此测(逐张人工把关,见 worktree 根 ×8 预览 PNG;
 * 换帧/同形可辨/可复现契约在 scripts/fish-atlas.test.mjs)。
 */
const ATLAS_URL = new URL('../../public/sprites/fish-atlas.png', import.meta.url)

function pngSize(bytes: Uint8Array): { width: number; height: number } {
  // PNG 签名 8 字节 + IHDR 长度/类型 8 字节后,即 IHDR 数据:宽高各 4 字节大端
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}

describe('鱼精灵图集产物(fish-atlas.png)', () => {
  it('存在且为合法 PNG(签名 89505 04e47 0d0a1a0a)', () => {
    const bytes = readFileSync(ATLAS_URL)
    expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  })

  it('尺寸 32×288:2 帧 × 18 种鱼,每帧 16×16(16x16 基线,行 = 鱼种)', () => {
    const bytes = readFileSync(ATLAS_URL)
    const { width, height } = pngSize(bytes)
    expect(width).toBe(32)
    expect(height).toBe(288)
  })
})
