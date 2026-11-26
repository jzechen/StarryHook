/**
 * 生成道具图集:public/sprites/scene-atlas.png(16×16,单块)。
 *
 * 票 #10(场景换皮)起,水面/岸线/草地/角色已换为 OGA CC0 正式素材
 * (见 public/sprites/README.md 的署名与派生说明),本图集只保留
 * 自绘浮标贴图(红顶白底,与现行配色一致)。自绘无第三方版权,等效 CC0。
 *
 * 图集布局:整块 16×16,浮标 8×12 居中(x 4..11,y 2..13),
 * src/render/textures.ts 的 BOBBER_RECT 与此对应。
 *
 * 运行:node scripts/generate-placeholder-atlas.mjs(或 pnpm gen:placeholders)
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const W = 16
const H = 16

/** 字符 → RGBA(配色沿用原型几何渲染,换皮前后气质连续) */
const PALETTE = {
  X: [42, 34, 38, 255], // 描边
  R: [228, 87, 61, 255], // 红顶(原浮标 0xe4573d)
  r: [240, 131, 106, 255], // 红顶高光
  W: [244, 244, 244, 255], // 白底(原 0xf4f4f4)
  s: [194, 206, 212, 255], // 白底阴影
  '.': [0, 0, 0, 0], // 透明
}

/** 浮标 8×12:红顶白底,中段一道水线 */
const BOBBER = [
  '..XXXX..',
  '.XRRRRX.',
  'XRrRRRRX',
  'XRrRRRRX',
  'XRRRRRRX',
  'XRRRRRRX',
  'XWWWWWWX',
  'XWsWWWWX',
  'XWWWWWWX',
  '.XWWWWX.',
  '..XXXX..',
  '........',
]

/** 浮标居中放进 16×16:x 偏移 4,y 偏移 2 */
function atlasRow(y) {
  if (y < 2 || y > 13) return '................'
  return '....' + BOBBER[y - 2] + '....'
}

// —— PNG 编码(无三方依赖:zlib 原始扫描线 + 手写 CRC32) ——
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

const raw = Buffer.alloc(H * (1 + W * 4))
for (let y = 0; y < H; y++) {
  const row = atlasRow(y)
  if (row.length !== W) throw new Error(`第 ${y} 行宽度 ${row.length} ≠ ${W}`)
  const off = y * (1 + W * 4)
  raw[off] = 0 // 过滤器:None
  for (let x = 0; x < W; x++) {
    const [r, g, b, a] = PALETTE[row[x]] ?? PALETTE['.']
    const p = off + 1 + x * 4
    raw[p] = r
    raw[p + 1] = g
    raw[p + 2] = b
    raw[p + 3] = a
  }
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(W, 0)
ihdr.writeUInt32BE(H, 4)
ihdr[8] = 8 // 位深
ihdr[9] = 6 // RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
])

const outPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sprites', 'scene-atlas.png')
mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, png)
console.log(`已生成 ${outPath}(${W}×${H},${png.length} 字节)`)
