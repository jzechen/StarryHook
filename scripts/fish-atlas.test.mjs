/**
 * 鱼精灵图集契约(接缝:public/sprites/fish-atlas.png 产物 + 生成管线,票 #53)。
 *
 * 布局从「行 = 鱼形」扩为「行 = 鱼种」(18 种,目录序),同形鱼种按种重锚配色
 * (body 色取自鱼目录 color 字段)——两条视觉契约钉死:
 * 1. 换帧可见:每行相邻帧像素差 > 0(死帧即红,CODING_STANDARDS 生成管线断言);
 * 2. 同形可辨:同形鱼种的行间像素差 > 0(色相变体不落空)。
 * 另钉「产物可复现」(committed 件与重生成逐像素一致)与「目录对齐」
 * (SPECIES 行序/体色 = src/core/fishCatalog 的目录序/color)。
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { decodePng } from './generate-character-sprite.mjs'
import { FISH_SPRITES, SPECIES } from './fish-sprite-data.mjs'
import { buildAtlasRgba, frameDiffs, shapeRowDiffs } from './generate-fish-atlas.mjs'
import { FISH } from '../src/core/fishCatalog.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const ASSET = `${root}/public/sprites/fish-atlas.png`

describe('fish-atlas.png(鱼精灵图集契约:票 #53 扩容 18 种)', () => {
  it('尺寸 32×288:每鱼 2 帧 × 16px,18 行(行 = 鱼种,目录序)', () => {
    const img = decodePng(`${ASSET}`)
    expect(img.width).toBe(32)
    expect(img.height).toBe(18 * 16)
  })

  it('产物可复现:committed 件与重生成逐像素一致(字节由契约测试与 git 锁定)', () => {
    const committed = decodePng(`${ASSET}`).px
    const derived = buildAtlasRgba().px
    expect(Buffer.compare(Buffer.from(committed), Buffer.from(derived))).toBe(0)
  })

  it('换帧可见:每行相邻帧像素差 > 0(18 行全查,死帧即红)', () => {
    const diffs = frameDiffs(decodePng(`${ASSET}`).px)
    expect(diffs).toHaveLength(18)
    diffs.forEach((d, row) => expect(d, `行 ${row}(${SPECIES[row].id})存在死帧`).toBeGreaterThan(0))
  })

  it('同形可辨:同形鱼种的行间像素差 > 0(色相变体不落空,票 #53 验收)', () => {
    const diffs = shapeRowDiffs(decodePng(`${ASSET}`).px)
    for (const [shape, rows] of Object.entries(diffs)) {
      for (const d of rows) expect(d, `鱼形 ${shape} 存在不可辨的同色行`).toBeGreaterThan(0)
    }
  })

  it('目录对齐:SPECIES 行序 = FISH 目录序,id 一一对应', () => {
    expect(SPECIES.map(s => s.id)).toEqual(FISH.map(f => f.id))
    expect(FISH_SPRITES).toHaveLength(FISH.length)
  })

  it('目录对齐:每个鱼种的体色 = 目录 color 字段(图集配色与图鉴目录不漂移)', () => {
    const byId = new Map(FISH.map(f => [f.id, f.color]))
    for (const s of SPECIES) {
      const color = byId.get(s.id)
      expect(color, `目录缺少鱼种 ${s.id}`).toBeDefined()
      expect(s.body).toEqual([(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff])
    }
  })

  it('目录对齐:每个鱼种声明的鱼形在图集形状全集内(拼错即红)', () => {
    const shapes = new Set(FISH_SPRITES.map(s => s.shape))
    for (const s of SPECIES) expect(shapes.has(s.shape), `${s.id} 鱼形 ${s.shape} 未知`).toBe(true)
  })
})
