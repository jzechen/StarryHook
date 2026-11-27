/**
 * 角色行走图生成器:OGA「Character sprite + walk animation」ch003.png(Flixberry
 * Entertainment,CC0)→ 16x16 四向 × 4 帧行走图 public/sprites/character.png。
 *
 * 派生规则(登记于 public/sprites/README.md「派生规则」;review 修复:历史产物
 * 每向 4 帧逐像素相同——腿部动画在旧管线里被压没,行走换帧从未生效,票 #49):
 * 1. 原件 128×128 = 4 向(行序 下/上/左/右)× 4 帧(列序)的 32×32 帧;
 * 2. 逐帧独立 2×2 众数降采样为 16×16:**只统计不透明像素**(alpha > 0),
 *    块内全不透明才判透明——细腿/摆臂在 2×2 块内是少数派,混入透明像素一起
 *    计众数会被投没(旧管线帧间全同的根源);众数平局取扫描序先见者(确定性);
 * 3. 帧序与行序沿用原件,拼 64×64 图集。
 *
 * 产物契约(scripts/character-sprite.test.mjs 与 git 字节锁共同钉住):
 * 每向相邻帧像素差 > 0(行走换帧可见)+ 产物与重派生逐像素一致(可复现)。
 * 无三方依赖:PNG 手写解码(depth 8,colortype 0/2/3/4/6)+ png-encode 编码,
 * 「同像素输入 → 同字节输出」与既有图集生成器同纪律。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { inflateSync } from 'node:zlib'
import { encodePng } from './png-encode.mjs'

const SRC = 'public/sprites/oga-src/ch003.png'
const OUT = 'public/sprites/character.png'
/** 原件帧尺寸(32×32)与降采样倍率(2×2 → 16×16) */
const SRC_FRAME = 32
const OUT_FRAME = 16
const DIRECTIONS = 4
const FRAMES_PER_DIRECTION = 4

/** 解码 PNG(bit depth 8、非隔行,colortype 0/2/3/4/6)→ { width, height, px(RGBA) } */
export function decodePng(path) {
  const png = readFileSync(path)
  if (png.readUInt32BE(0) !== 0x89504e47) throw new Error(`not a PNG: ${path}`)
  let pos = 8
  let width = 0
  let height = 0
  let colorType = 0
  let bitDepth = 0
  let interlace = 0
  const idat = []
  let palette = null
  let trns = null
  while (pos < png.length) {
    const len = png.readUInt32BE(pos)
    const type = png.toString('ascii', pos + 4, pos + 8)
    const data = png.subarray(pos + 8, pos + 8 + len)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
      interlace = data[12]
    } else if (type === 'PLTE') palette = data
    else if (type === 'tRNS') trns = data
    else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    pos += 12 + len
  }
  if (bitDepth !== 8) throw new Error(`不支持的位深:${bitDepth}(只支持 8)`)
  if (interlace !== 0) throw new Error(`不支持的隔行:Adam7`)
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType]
  if (channels === undefined) throw new Error(`不支持的 colortype:${colorType}`)
  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * channels
  if (raw.length !== height * (stride + 1)) throw new Error(`IDAT 解压长度不符:${raw.length}`)
  // 反过滤(0..4 全型;bpp = 每像素字节数)
  const rows = []
  const prev = Buffer.alloc(stride)
  for (let y = 0; y < height; y++) {
    const ftype = raw[y * (stride + 1)]
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)))
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? line[i - channels] : 0
      const b = prev[i]
      const c = i >= channels ? prev[i - channels] : 0
      if (ftype === 1) line[i] = (line[i] + a) & 0xff
      else if (ftype === 2) line[i] = (line[i] + b) & 0xff
      else if (ftype === 3) line[i] = (line[i] + ((a + b) >> 1)) & 0xff
      else if (ftype === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a)
        const pb = Math.abs(p - b)
        const pc = Math.abs(p - c)
        line[i] = (line[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff
      }
    }
    rows.push(line)
    prev.set(line)
  }
  // 行扫描 → RGBA
  const px = Buffer.alloc(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = x * channels
      const o = (y * width + x) * 4
      if (colorType === 6) {
        px[o] = rows[y][i]; px[o + 1] = rows[y][i + 1]; px[o + 2] = rows[y][i + 2]; px[o + 3] = rows[y][i + 3]
      } else if (colorType === 2) {
        px[o] = rows[y][i]; px[o + 1] = rows[y][i + 1]; px[o + 2] = rows[y][i + 2]; px[o + 3] = 255
      } else if (colorType === 0) {
        px[o] = px[o + 1] = px[o + 2] = rows[y][i]; px[o + 3] = 255
      } else if (colorType === 4) {
        px[o] = px[o + 1] = px[o + 2] = rows[y][i]; px[o + 3] = rows[y][i + 1]
      } else {
        const idx = rows[y][i]
        const t = trns ? trns[idx] : undefined
        px[o] = palette[idx * 3]; px[o + 1] = palette[idx * 3 + 1]; px[o + 2] = palette[idx * 3 + 2]
        px[o + 3] = t === undefined ? 255 : t
      }
    }
  }
  return { width, height, px }
}

/**
 * 单帧 32×32 → 16×16 的 2×2 众数降采样(只统计不透明像素;全透明块才判透明;
 * 平局取扫描序先见者)。返回 16×16×4 的 RGBA。
 */
export function downsampleFrame(frame) {
  const out = Buffer.alloc(OUT_FRAME * OUT_FRAME * 4)
  for (let by = 0; by < OUT_FRAME; by++) {
    for (let bx = 0; bx < OUT_FRAME; bx++) {
      const counts = new Map()
      let opaqueTotal = 0
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const o = ((by * 2 + dy) * SRC_FRAME + bx * 2 + dx) * 4
          if (frame[o + 3] === 0) continue
          opaqueTotal++
          const key = (frame[o] << 24) | (frame[o + 1] << 16) | (frame[o + 2] << 8) | frame[o + 3]
          counts.set(key, (counts.get(key) ?? 0) + 1)
        }
      }
      const o = (by * OUT_FRAME + bx) * 4
      if (opaqueTotal === 0) continue // 全透明块:保持 0,0,0,0
      let bestKey = null
      let bestCount = 0
      for (const [key, count] of counts) {
        if (count > bestCount) { bestCount = count; bestKey = key }
      }
      out[o] = (bestKey >>> 24) & 0xff
      out[o + 1] = (bestKey >>> 16) & 0xff
      out[o + 2] = (bestKey >>> 8) & 0xff
      out[o + 3] = bestKey & 0xff
    }
  }
  return out
}

/** 原件(128×128,4 向 × 4 帧)→ 64×64 图集(行序沿用原件:下/上/左/右) */
export function deriveCharacterAtlas(src) {
  if (src.width !== SRC_FRAME * DIRECTIONS || src.height !== SRC_FRAME * DIRECTIONS) {
    throw new Error(`原件尺寸不符:期望 ${SRC_FRAME * DIRECTIONS}×${SRC_FRAME * DIRECTIONS},现 ${src.width}×${src.height}`)
  }
  const atlas = Buffer.alloc(64 * 64 * 4)
  for (let row = 0; row < DIRECTIONS; row++) {
    for (let f = 0; f < FRAMES_PER_DIRECTION; f++) {
      // 源帧像素抽取 + 降采样
      const frame = Buffer.alloc(SRC_FRAME * SRC_FRAME * 4)
      for (let y = 0; y < SRC_FRAME; y++) {
        for (let x = 0; x < SRC_FRAME; x++) {
          const so = ((row * SRC_FRAME + y) * src.width + f * SRC_FRAME + x) * 4
          const o = (y * SRC_FRAME + x) * 4
          frame[o] = src.px[so]; frame[o + 1] = src.px[so + 1]
          frame[o + 2] = src.px[so + 2]; frame[o + 3] = src.px[so + 3]
        }
      }
      const small = downsampleFrame(frame)
      for (let y = 0; y < OUT_FRAME; y++) {
        for (let x = 0; x < OUT_FRAME; x++) {
          const so = (y * OUT_FRAME + x) * 4
          const o = ((row * OUT_FRAME + y) * 64 + f * OUT_FRAME + x) * 4
          atlas[o] = small[so]; atlas[o + 1] = small[so + 1]
          atlas[o + 2] = small[so + 2]; atlas[o + 3] = small[so + 3]
        }
      }
    }
  }
  return atlas
}

/** 每向相邻帧的像素差(4 行 × 3 对);行走换帧契约 = 全部 > 0 */
export function frameDiffs(atlas) {
  const diffs = []
  for (let row = 0; row < DIRECTIONS; row++) {
    const rowDiffs = []
    for (let f = 1; f < FRAMES_PER_DIRECTION; f++) {
      let n = 0
      for (let y = 0; y < OUT_FRAME; y++) {
        for (let x = 0; x < OUT_FRAME; x++) {
          const a = ((row * OUT_FRAME + y) * 64 + (f - 1) * OUT_FRAME + x) * 4
          const b = ((row * OUT_FRAME + y) * 64 + f * OUT_FRAME + x) * 4
          if (atlas[a] !== atlas[b] || atlas[a + 1] !== atlas[b + 1] || atlas[a + 2] !== atlas[b + 2] || atlas[a + 3] !== atlas[b + 3]) n++
        }
      }
      rowDiffs.push(n)
    }
    diffs.push(rowDiffs)
  }
  return diffs
}

/** 命令行入口:派生 → 断言帧间有差 → 落盘(生成器脚本断言,防再产出死帧) */
function main() {
  const root = fileURLToPath(new URL('..', import.meta.url))
  const src = decodePng(`${root}/${SRC}`)
  const atlas = deriveCharacterAtlas(src)
  const diffs = frameDiffs(atlas)
  const dead = diffs.flatMap((row, i) => row.map((d, j) => (d === 0 ? `行${i} 帧${j}-${j + 1}` : null))).filter(Boolean)
  if (dead.length > 0) {
    console.error(`派生结果存在死帧(帧间像素差 = 0):${dead.join(', ')}——拒绝落盘`)
    process.exit(1)
  }
  writeFileSync(`${root}/${OUT}`, encodePng(64, 64, atlas))
  console.log(`character.png: ${SRC} 2×2 不透明众数逐帧降采样 → 64×64;帧间像素差 = ${diffs.map((r) => r.join('/')).join(' | ')} → ${OUT}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
