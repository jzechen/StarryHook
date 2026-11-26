/**
 * PNG 编码器契约(接缝:encodePng 纯函数)。
 *
 * scripts/png-encode.mjs 是两个图集生成器(generate-bobber-atlas /
 * generate-fish-atlas)共享的无三方依赖 PNG 编码工艺,契约要点:
 * 编码确定性(同像素输入 → 同字节输出,产物字节由图集契约测试与 git 锁定)、
 * 标准块结构(IHDR/IDAT/IEND)、扫描线 = 每行过滤器 0 + RGBA 原样 packed。
 *
 * 期望值全部为独立字面量:CRC 用测试内另写的按位实现校验,
 * IDAT 用 zlib 解码反向验证,另有冻结的金标准字节锁 level 9。
 */
import { inflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { encodePng } from './png-encode.mjs'

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/** 独立按位 CRC32(无查表,与实现的查表法互为印证) */
function crc32Bitwise(bytes) {
  let c = 0xffffffff
  for (const b of bytes) {
    c ^= b
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  }
  return (c ^ 0xffffffff) >>> 0
}

/** 顺序读出 PNG 的全部块:{ type, data, crc } */
function* chunks(png) {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength)
  let off = 8 // 跳过签名
  while (off < png.length) {
    const length = view.getUint32(off)
    yield {
      type: Buffer.from(png.subarray(off + 4, off + 8)).toString('ascii'),
      data: png.subarray(off + 8, off + 8 + length),
      crc: view.getUint32(off + 8 + length),
    }
    off += 12 + length
  }
}

describe('PNG 编码器(png-encode.mjs,接缝:encodePng)', () => {
  // 样例:2×1 图像,红、绿两个像素;期望值均为手写独立字面量
  const px = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255])
  const png = encodePng(2, 1, px)

  it('签名 + IHDR:尺寸 2×1、位深 8、色型 6(RGBA)', () => {
    expect([...png.subarray(0, 8)]).toEqual(PNG_SIGNATURE)
    const [ihdr] = chunks(png)
    expect(ihdr.type).toBe('IHDR')
    expect([...ihdr.data]).toEqual([0, 0, 0, 2, 0, 0, 0, 1, 8, 6, 0, 0, 0])
  })

  it('每个块的 CRC 字段都能被独立按位 CRC32 校验通过', () => {
    for (const { type, data, crc } of chunks(png)) {
      expect(crc32Bitwise(Buffer.concat([Buffer.from(type, 'ascii'), data]))).toBe(crc)
    }
  })

  it('IDAT 经 zlib 解回「过滤器 0 + RGBA 扫描线」,并逐字节等于冻结金标准;IEND 为空', () => {
    const [, idat, iend] = chunks(png)
    expect(idat.type).toBe('IDAT')
    expect(iend.type).toBe('IEND')
    expect([...iend.data]).toEqual([])
    // 原始扫描线:每行 1 字节过滤器(0 = None)+ 每像素 4 字节 RGBA
    expect([...inflateSync(idat.data)]).toEqual([0, 255, 0, 0, 255, 0, 255, 0, 255])
    // 金标准(冻结于评审时点):deflate level 9 的确定性输出,锁死产物字节
    expect([...idat.data]).toEqual([120, 218, 99, 248, 207, 192, 240, 31, 4, 1, 16, 248, 3, 253])
  })
})
