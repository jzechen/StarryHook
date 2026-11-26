/**
 * 生成极简占位素材图集:public/sprites/scene-atlas.png(64×16,单行排布)。
 *
 * 票 #9(视口与精灵化地基)用:目的是打通「素材文件 → 图集切片 → 精灵」管线,
 * 素材本身为脚本生成的自绘占位(无任何第三方版权,可视为 CC0 等效的自有素材);
 * 视觉打磨批一的后续票会用 OpenGameArt CC0 的 16x16 水面/岸块正式素材替换,
 * 届时只需重跑本脚本换像素画(或换成下载素材)并核对 textures.ts 的切片区域。
 *
 * 图集布局(区域常量与 src/render/textures.ts 保持一致):
 *   [0,16)   水面帧 A   [16,32)  水面帧 B(两帧交替 = 波光动画)
 *   [32,48)  草地岸块   [48,56)  浮标 8×12(纵向从 y=2 到 y=13)
 *
 * 运行:node scripts/generate-placeholder-atlas.mjs(或 pnpm gen:placeholders)
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const W = 64
const H = 16

/** 字符 → RGBA。基色取自现行几何渲染配色,换皮前后气质连续 */
const PALETTE = {
  // 水面
  b: [23, 80, 107, 255], // 基色(原池塘填充 0x17506b)
  d: [18, 67, 88, 255], // 深水斑
  m: [30, 106, 134, 255], // 次级波
  h: [159, 216, 232, 255], // 波光(原涟漪色 0x9fd8e8)
  // 草地
  g: [44, 59, 42, 255], // 基色(原岸地 0x2c3b2a)
  G: [59, 82, 56, 255], // 亮草
  k: [34, 48, 31, 255], // 暗草
  L: [74, 106, 74, 255], // 草叶
  // 浮标
  X: [42, 34, 38, 255], // 描边
  R: [228, 87, 61, 255], // 红顶(原浮标 0xe4573d)
  r: [240, 131, 106, 255], // 红顶高光
  W: [244, 244, 244, 255], // 白底(原 0xf4f4f4)
  s: [194, 206, 212, 255], // 白底阴影
  '.': [0, 0, 0, 0], // 透明
}

/** 水面帧 A:波光在第 2/11/4 列一带 */
const WATER_A = [
  'bbbbbbbbbbbbbbbb',
  'bbbbbbbbbbbbdbbb',
  'bbbbbbbbbbbbbbbb',
  'bbhhhbbbbbbbbbbb',
  'bbbbbbbbbbbbbbbb',
  'bbbbbbbbmmmmbdbb',
  'bbbbbbbbbbbbbbbb',
  'bbbbbbbbbbbbbbbb',
  'bbbbbbbbbbbhhbbb',
  'bbbbbbbbbbbbbbbb',
  'bbmmbbbbdbbbbbbb',
  'bbbbbbbbbbbbbbbb',
  'bbbbbbbbbbbbbbbb',
  'bdbbhhhbbbbbbbbb',
  'bbbbbbbbbbbbbbbb',
  'bbbbbbbbbbbbbbbb',
]

/** 水面帧 B:波光平移 → 与 A 交替产生闪烁 */
const WATER_B = [
  'bbbbbbbbbbbbbbbb',
  'bbdbbbbbbbbbbbbb',
  'bbbbbbbbbbbbbbbb',
  'bbbbbbbhhhbbbbbb',
  'bbbbbbbbbbbbbbbb',
  'bbmmmmbbbbbbbdbb',
  'bbbbbbbbbbbbbbbb',
  'bbbbbbbbbbbbbbbb',
  'bbhhbbbbbbbbbbbb',
  'bbbbbbbbbbbbbbbb',
  'bbbbbbbbbmmmbbbb',
  'bbbbbbbbbbbbbbbb',
  'bbbbbbbbbbbbbbbb',
  'bbbbbbbbbbbhbbbb',
  'bbbbbbbdbbbbbbbb',
  'bbbbbbbbbbbbbbbb',
]

/** 草地岸块:稀疏草叶与明暗斑 */
const GRASS = [
  'gggggggggggggggg',
  'ggGggggggggggkgg',
  'gggggggggggggggg',
  'gggggggLgggggggg',
  'gggggggggggggggg',
  'ggggggggggGggggg',
  'gggkgggggggggggg',
  'gggggggggggggggg',
  'gggggggggggggGgg',
  'ggLggggggggggggg',
  'gggggggggggggggg',
  'gggggggggkgggggg',
  'gggggggggggggggg',
  'ggGggggggggggggg',
  'gggggggLgggggggg',
  'gggggggggggggggg',
]

/** 浮标 8×12(放在 y=2..13):红顶白底,中段一道水线 */
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

/** 拼出整行:水面 A | 水面 B | 草地 | 浮标 | 空垫 */
function atlasRow(y) {
  const bobber = y >= 2 && y <= 13 ? BOBBER[y - 2] : '........'
  return WATER_A[y] + WATER_B[y] + GRASS[y] + bobber + '........'
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
