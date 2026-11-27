/**
 * 农夫立绘生成器(票 #49):Kenney「Tiny Farm」packed 表 tile 0109(草帽农夫,
 * 朝下)→ 16x16 透明底立绘 public/sprites/farmer.png。
 *
 * 派生规则(登记于 public/sprites/README.md「文件清单/派生规则」):
 * 1. 表内角色件以深梅色实底承托(tile 内非透明),索引 0 为表级透明(只出现在
 *    四角)——两色都置透明,得到角色剪影;
 * 2. 剪影外扩 1px 回填深梅色作描边(8 邻接),还原 Kenney 角色件的描边观感;
 *    腿间空隙因与底色连通被键出,描边只沿真实剪影生长。
 *
 * 无三方依赖:调色板 PNG(colortype 3、位深 8)手写解码 + png-encode 编码,
 * 「同像素输入 → 同字节输出」与既有图集生成器同纪律;产物已入库,脚本留档可复现。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import { encodePng } from './png-encode.mjs'

const SRC = 'public/sprites/oga-src/tiny-farm-tilemap_packed.png'
const OUT = 'public/sprites/farmer.png'
const TILE = 16
/** 农夫件编号(行优先 packed:109 → (9,1),票 #26 编号表同源) */
const FARMER_TILE = 109

// —— 调色板 PNG 解码(colortype 3、bit depth 8,本表契约) ——
const png = readFileSync(SRC)
if (png.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG')
let pos = 8
let width = 0
let height = 0
let colorType = 0
let bitDepth = 0
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
  } else if (type === 'PLTE') palette = data
  else if (type === 'tRNS') trns = data
  else if (type === 'IDAT') idat.push(data)
  else if (type === 'IEND') break
  pos += 12 + len
}
if (colorType !== 3 || bitDepth !== 8) throw new Error(`unexpected PNG shape: ct=${colorType} bd=${bitDepth}`)

// —— 反过滤(0..4 全型) ——
const raw = inflateSync(Buffer.concat(idat))
const bpp = 1
const stride = width * bpp
const rows = []
const prev = Buffer.alloc(stride)
for (let y = 0; y < height; y++) {
  const ftype = raw[y * (stride + 1)]
  const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)))
  for (let i = 0; i < stride; i++) {
    const a = i >= bpp ? line[i - bpp] : 0
    const b = prev[i]
    const c = i >= bpp ? prev[i - bpp] : 0
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

// —— 索引 → RGBA ——
const transparent = new Set()
if (trns) for (let i = 0; i < trns.length; i++) transparent.add(trns[i])
const rgbOf = (idx) => [palette[idx * 3], palette[idx * 3 + 1], palette[idx * 3 + 2]]

const tx = (FARMER_TILE % 12) * TILE
const ty = Math.floor(FARMER_TILE / 12) * TILE
const idx = (x, y) => rows[ty + y][tx + x]

// 表级透明索引(0)与角色件实底色(按票内出现最多且不在剪影内的色判定 = 众数底色)
const counts = new Map()
for (let y = 0; y < TILE; y++)
  for (let x = 0; x < TILE; x++) {
    const i = idx(x, y)
    if (!transparent.has(i)) counts.set(i, (counts.get(i) ?? 0) + 1)
  }
const backdropIndex = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]

// 1) 键出:表级透明 + 实底 → 剪影
let px = Buffer.alloc(TILE * TILE * 4)
for (let y = 0; y < TILE; y++)
  for (let x = 0; x < TILE; x++) {
    const i = idx(x, y)
    const opaque = !transparent.has(i) && i !== backdropIndex
    const [r, g, b] = rgbOf(i)
    const o = (y * TILE + x) * 4
    px[o] = r
    px[o + 1] = g
    px[o + 2] = b
    px[o + 3] = opaque ? 255 : 0
  }

// 2) 剪影外扩 1px 回填底色作描边(8 邻接;底色取「实底色」原值)
const backdrop = rgbOf(backdropIndex)
const outlined = Buffer.from(px)
const at = (x, y) => x >= 0 && y >= 0 && x < TILE && y < TILE && px[(y * TILE + x) * 4 + 3] === 255
for (let y = 0; y < TILE; y++)
  for (let x = 0; x < TILE; x++) {
    if (px[(y * TILE + x) * 4 + 3] === 255) continue
    let touch = false
    for (let dy = -1; dy <= 1 && !touch; dy++)
      for (let dx = -1; dx <= 1 && !touch; dx++) if (at(x + dx, y + dy)) touch = true
    if (touch) {
      const o = (y * TILE + x) * 4
      outlined[o] = backdrop[0]
      outlined[o + 1] = backdrop[1]
      outlined[o + 2] = backdrop[2]
      outlined[o + 3] = 255
    }
  }

writeFileSync(OUT, encodePng(TILE, TILE, outlined))
console.log(`farmer.png: tile ${FARMER_TILE} @ (${tx},${ty}), backdrop idx ${backdropIndex} rgb(${backdrop.join(',')}) → ${OUT}`)
