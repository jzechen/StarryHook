/**
 * 生成鱼精灵图集:public/sprites/fish-atlas.png(32×288 = 18 种鱼 × 2 帧,每帧 16×16)。
 *
 * 票 #11:5 种鱼形手绘像素矩阵(见 fish-sprite-data.mjs,深描边 + 平涂 + 少量高光,
 * 与 OGA 场景素材同风格),无第三方版权,等效 CC0。
 * 票 #53:图集行序契约从「鱼形」扩为「鱼种」(行 = 鱼目录序,18 行),同形鱼种
 * 按 derivePalette 重锚配色(色相变体,同形不同色);渲染消费端见
 * src/render/fishAtlas.ts(FISH_SPECIES_ROW)。
 * 列 = 帧(0 常态 / 1 游动)。消费端:textures.ts 切片(小游戏轨道)、
 * collectionPanel.ts 背景定位(图鉴)。
 *
 * 落盘前断言(CODING_STANDARDS「生成管线必须断言输出差异」):
 * - 换帧可见:每行相邻帧像素差 > 0(死帧拒写);
 * - 同形可辨:同形鱼种行间像素差 > 0(色相变体落空拒写)。
 * 同时在 worktree 根产出 ×8 放大预览 fish-atlas-preview.png(人工把关用,不入库)。
 *
 * 运行:node scripts/generate-fish-atlas.mjs(或 pnpm gen:fish-atlas)
 */
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FISH_SPRITES, OUTLINE, GLINT } from './fish-sprite-data.mjs'
import { encodePng } from './png-encode.mjs'

const FRAME = 16
/** 预览放大倍数(人工把关用) */
const PREVIEW_SCALE = 8

/** 字符 → RGBA;未知字母/越界行宽直接抛错(手绘矩阵的格式护栏) */
function pixelColor(letter, palette) {
  if (letter === '.') return [0, 0, 0, 0]
  if (letter === 'X') return OUTLINE
  if (letter === 'g') return GLINT
  const c = palette[letter]
  if (!c) throw new Error(`鱼出现未知像素字母 "${letter}"`)
  return c
}

/** 校验并把一帧字符矩阵编码成 RGBA 像素数组(行长必须恰为 16,行数必须恰为 16) */
function encodeFrame(matrix, palette, id) {
  if (matrix.length !== FRAME) throw new Error(`鱼 ${id} 帧行数 ${matrix.length} ≠ ${FRAME}`)
  const px = new Uint8Array(FRAME * FRAME * 4)
  for (let y = 0; y < FRAME; y++) {
    const row = matrix[y]
    if (row.length !== FRAME) throw new Error(`鱼 ${id} 第 ${y} 行宽 ${row.length} ≠ ${FRAME}`)
    for (let x = 0; x < FRAME; x++) {
      const [r, g, b, a] = pixelColor(row[x], palette)
      const p = (y * FRAME + x) * 4
      px[p] = r
      px[p + 1] = g
      px[p + 2] = b
      px[p + 3] = a
    }
  }
  return px
}

// PNG 编码统一走 scripts/png-encode.mjs(共享工艺,产物字节不变)

const rows = FISH_SPRITES.length

// —— 合成图集:行 = 鱼种(目录序),列 = 帧 ——
export function buildAtlasRgba() {
  const w = FRAME * 2
  const h = FRAME * rows
  const px = new Uint8Array(w * h * 4)
  for (const [r, fish] of FISH_SPRITES.entries()) {
    if (fish.frames.length !== 2) throw new Error(`鱼 ${fish.id} 帧数 ${fish.frames.length} ≠ 2`)
    for (const [c, matrix] of fish.frames.entries()) {
      const frame = encodeFrame(matrix, fish.palette, fish.id)
      for (let y = 0; y < FRAME; y++) {
        for (let x = 0; x < FRAME; x++) {
          const src = (y * FRAME + x) * 4
          const dst = ((r * FRAME + y) * w + c * FRAME + x) * 4
          px[dst] = frame[src]
          px[dst + 1] = frame[src + 1]
          px[dst + 2] = frame[src + 2]
          px[dst + 3] = frame[src + 3]
        }
      }
    }
  }
  return { w, h, px }
}

/** 每行相邻帧的像素差(18 行);换帧契约 = 全部 > 0 */
export function frameDiffs(atlas) {
  const w = FRAME * 2
  return FISH_SPRITES.map((fish, row) => {
    let n = 0
    for (let y = 0; y < FRAME; y++) {
      for (let x = 0; x < FRAME; x++) {
        const a = ((row * FRAME + y) * w + x) * 4
        const b = ((row * FRAME + y) * w + FRAME + x) * 4
        if (atlas[a] !== atlas[b] || atlas[a + 1] !== atlas[b + 1] || atlas[a + 2] !== atlas[b + 2] || atlas[a + 3] !== atlas[b + 3]) n++
      }
    }
    if (n === 0) throw new Error(`鱼 ${fish.id} 存在死帧(帧 0 = 帧 1)`)
    return n
  })
}

/** 同形鱼种的行间像素差(按鱼形分组);同形可辨契约 = 组内全部 > 0 */
export function shapeRowDiffs(atlas) {
  const w = FRAME * 2
  const byShape = new Map()
  for (const [row, fish] of FISH_SPRITES.entries()) {
    if (!byShape.has(fish.shape)) byShape.set(fish.shape, [])
    byShape.get(fish.shape).push(row)
  }
  const diffs = {}
  for (const [shape, rowsOfShape] of byShape) {
    const pairs = []
    for (let i = 1; i < rowsOfShape.length; i++) {
      const a = rowsOfShape[i - 1]
      const b = rowsOfShape[i]
      let n = 0
      for (let y = 0; y < FRAME; y++) {
        for (let x = 0; x < w; x++) {
          const pa = ((a * FRAME + y) * w + x) * 4
          const pb = ((b * FRAME + y) * w + x) * 4
          if (atlas[pa] !== atlas[pb] || atlas[pa + 1] !== atlas[pb + 1] || atlas[pa + 2] !== atlas[pb + 2] || atlas[pa + 3] !== atlas[pb + 3]) n++
        }
      }
      if (n === 0) throw new Error(`鱼形 ${shape} 行 ${a}/${b} 像素相同(色相变体落空)`)
      pairs.push(n)
    }
    if (pairs.length > 0) diffs[shape] = pairs
  }
  return diffs
}

// —— ×8 预览:水色棋盘底,人工把关轮廓/配色/帧差 ——
function buildPreviewRgba(atlas) {
  const s = PREVIEW_SCALE
  const w = atlas.w * s
  const h = atlas.h * s
  const px = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // 8px 水色棋盘:能同时读出透明边界与在水里的对比
      const cell = (Math.floor(x / 8) + Math.floor(y / 8)) % 2
      const p = (y * w + x) * 4
      px[p] = cell ? 0x5c : 0x4f
      px[p + 1] = cell ? 0x9c : 0x8f
      px[p + 2] = cell ? 0xe2 : 0xd4
      px[p + 3] = 255
    }
  }
  for (let ay = 0; ay < atlas.h; ay++) {
    for (let ax = 0; ax < atlas.w; ax++) {
      const src = (ay * atlas.w + ax) * 4
      const [r, g, b, a] = [atlas.px[src], atlas.px[src + 1], atlas.px[src + 2], atlas.px[src + 3]]
      for (let dy = 0; dy < s; dy++) {
        for (let dx = 0; dx < s; dx++) {
          const p = ((ay * s + dy) * w + ax * s + dx) * 4
          if (a === 0) continue // 透明:保留棋盘
          if (a < 255) {
            // 半透明像素与棋盘混色(当前矩阵无此类像素,兜底)
            const t = a / 255
            px[p] = Math.round(r * t + px[p] * (1 - t))
            px[p + 1] = Math.round(g * t + px[p + 1] * (1 - t))
            px[p + 2] = Math.round(b * t + px[p + 2] * (1 - t))
          } else {
            px[p] = r
            px[p + 1] = g
            px[p + 2] = b
          }
          px[p + 3] = 255
        }
      }
    }
  }
  return { w, h, px }
}

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

function main() {
  const atlas = buildAtlasRgba()
  const frameDiffsPerRow = frameDiffs(atlas.px)
  const variantDiffs = shapeRowDiffs(atlas.px)
  const atlasPath = join(repoRoot, 'public', 'sprites', 'fish-atlas.png')
  writeFileSync(atlasPath, encodePng(atlas.w, atlas.h, atlas.px))
  console.log(`已生成 ${atlasPath}(${atlas.w}×${atlas.h},${rows} 种鱼;帧差 = ${frameDiffsPerRow.join(',')};同形变体差 = ${JSON.stringify(variantDiffs)})`)

  const preview = buildPreviewRgba(atlas)
  const previewPath = join(repoRoot, 'fish-atlas-preview.png')
  writeFileSync(previewPath, encodePng(preview.w, preview.h, preview.px))
  console.log(`已生成预览 ${previewPath}(×${PREVIEW_SCALE},人工把关用,不入库)`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
