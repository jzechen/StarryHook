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
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { encodePng } from './png-encode.mjs'

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

// 逐像素展开成 RGBA 数组(PNG 包装/压缩统一交给 scripts/png-encode.mjs)
const px = new Uint8Array(W * H * 4)
for (let y = 0; y < H; y++) {
  const row = atlasRow(y)
  if (row.length !== W) throw new Error(`第 ${y} 行宽度 ${row.length} ≠ ${W}`)
  for (let x = 0; x < W; x++) {
    const [r, g, b, a] = PALETTE[row[x]] ?? PALETTE['.']
    const p = (y * W + x) * 4
    px[p] = r
    px[p + 1] = g
    px[p + 2] = b
    px[p + 3] = a
  }
}

const outPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sprites', 'scene-atlas.png')
mkdirSync(dirname(outPath), { recursive: true })
const png = encodePng(W, H, px)
writeFileSync(outPath, png)
console.log(`已生成 ${outPath}(${W}×${H},${png.length} 字节)`)
