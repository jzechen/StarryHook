/**
 * PNG 编码(无三方依赖):zlib 原始扫描线 + 手写 CRC32。
 *
 * 图集生成器(scripts/generate-bobber-atlas.mjs、scripts/generate-fish-atlas.mjs)
 * 共享的唯一编码工艺,保证「同像素输入 → 同字节输出」单源——生成器只负责
 * 摆像素,包装/压缩/校验全部在这里,产物字节由图集契约测试与 git 锁定。
 */
import { deflateSync } from 'node:zlib'

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

/** RGBA 像素数组(Uint8Array,长度 = width × height × 4)→ PNG Buffer */
export function encodePng(width, height, px) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // 位深
  ihdr[9] = 6 // RGBA
  // 原始扫描线:每行前置 1 字节过滤器(0 = None),行内 RGBA 原样 packed
  const raw = Buffer.alloc(height * (1 + width * 4))
  for (let y = 0; y < height; y++) {
    const off = y * (1 + width * 4)
    raw[off] = 0
    raw.set(px.subarray(y * width * 4, (y + 1) * width * 4), off + 1)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}
