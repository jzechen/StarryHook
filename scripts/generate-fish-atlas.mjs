/**
 * 生成鱼精灵图集:public/sprites/fish-atlas.png(32×80 = 5 种鱼 × 2 帧,每帧 16×16)。
 *
 * 票 #11:5 种鱼(小白条/稳重鲫/铅坠鲶/气球河豚/闪电梭)全部手绘像素矩阵
 * (见 fish-sprite-data.mjs,深描边 + 平涂 + 少量高光,与 OGA 场景素材同风格),
 * 无第三方版权,等效 CC0。行序 = src/render/fishAtlas.ts 的 FISH_SHAPE_ROW,
 * 列 = 帧(0 常态 / 1 游动)。消费端:textures.ts 切片(小游戏轨道)、
 * collectionPanel.ts 背景定位(图鉴)。
 *
 * 同时在 worktree 根产出 ×8 放大预览 fish-atlas-preview.png(人工把关用,不入库)。
 *
 * 运行:node scripts/generate-fish-atlas.mjs(或 pnpm gen:fish-atlas)
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FISH_SPRITES, OUTLINE, GLINT, PALETTES } from './fish-sprite-data.mjs'

const FRAME = 16
/** 预览放大倍数(人工把关用) */
const PREVIEW_SCALE = 8

/** 字符 → RGBA;未知字母/越界行宽直接抛错(手绘矩阵的格式护栏) */
function pixelColor(letter, shape) {
  if (letter === '.') return [0, 0, 0, 0]
  if (letter === 'X') return OUTLINE
  if (letter === 'g') return GLINT
  const c = PALETTES[shape][letter]
  if (!c) throw new Error(`鱼 ${shape} 出现未知像素字母 "${letter}"`)
  return c
}

/** 校验并把一帧字符矩阵编码成 RGBA 像素数组(行长必须恰为 16,行数必须恰为 16) */
function encodeFrame(matrix, shape) {
  if (matrix.length !== FRAME) throw new Error(`鱼 ${shape} 帧行数 ${matrix.length} ≠ ${FRAME}`)
  const px = new Uint8Array(FRAME * FRAME * 4)
  for (let y = 0; y < FRAME; y++) {
    const row = matrix[y]
    if (row.length !== FRAME) throw new Error(`鱼 ${shape} 第 ${y} 行宽 ${row.length} ≠ ${FRAME}`)
    for (let x = 0; x < FRAME; x++) {
      const [r, g, b, a] = pixelColor(row[x], shape)
      const p = (y * FRAME + x) * 4
      px[p] = r
      px[p + 1] = g
      px[p + 2] = b
      px[p + 3] = a
    }
  }
  return px
}

// —— PNG 编码(无三方依赖:zlib 原始扫描线 + 手写 CRC32,与 #9 占位图生成器同工艺) ——
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(bytes) {
  let c = 0xffffffff
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'ascii')
  data.copy(out, 8)
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
  return out
}

/** RGBA 像素数组 → PNG Buffer */
function encodePng(width, height, px) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // 位深
  ihdr[9] = 6 // RGBA
  const raw = Buffer.alloc(height * (1 + width * 4))
  for (let y = 0; y < height; y++) {
    const off = y * (1 + width * 4)
    raw[off] = 0 // 过滤器:None
    px.copy ? px.copy(raw, off + 1, y * width * 4, (y + 1) * width * 4) : raw.set(px.subarray(y * width * 4, (y + 1) * width * 4), off + 1)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const rows = FISH_SPRITES.length

// —— 合成图集:行 = 鱼,列 = 帧 ——
function buildAtlasRgba() {
  const w = FRAME * 2
  const h = FRAME * rows
  const px = new Uint8Array(w * h * 4)
  for (const [r, fish] of FISH_SPRITES.entries()) {
    if (fish.frames.length !== 2) throw new Error(`鱼 ${fish.shape} 帧数 ${fish.frames.length} ≠ 2`)
    for (const [c, matrix] of fish.frames.entries()) {
      const frame = encodeFrame(matrix, fish.shape)
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

const atlas = buildAtlasRgba()
const atlasPath = join(repoRoot, 'public', 'sprites', 'fish-atlas.png')
writeFileSync(atlasPath, encodePng(atlas.w, atlas.h, atlas.px))
console.log(`已生成 ${atlasPath}(${atlas.w}×${atlas.h})`)

const preview = buildPreviewRgba(atlas)
const previewPath = join(repoRoot, 'fish-atlas-preview.png')
writeFileSync(previewPath, encodePng(preview.w, preview.h, preview.px))
console.log(`已生成预览 ${previewPath}(×${PREVIEW_SCALE},人工把关用,不入库)`)
