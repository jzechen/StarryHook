/**
 * 鱼精灵图集布局(票 #11):public/sprites/fish-atlas.png 的几何约定,
 * 是生成器(scripts/generate-fish-atlas.mjs)与两处消费端之间唯一的行序契约——
 * - src/render/textures.ts 按行序切片出每鱼 2 帧
 * - src/ui/collectionPanel.ts 按行序消费 fishSpriteOffsetY 定位(图鉴条目精灵)
 */

/** 单帧边长(逻辑像素,16x16 基线) */
export const FISH_FRAME_SIZE = 16
/** 每鱼帧数:0 = 常态,1 = 游动 */
export const FISH_FRAME_COUNT = 2

/** 鱼形 → 图集行序(与 src/core/fishCatalog 的 shape 一一对应) */
export const FISH_SHAPE_ROW = { slim: 0, round: 1, heavy: 2, puff: 3, bolt: 4 } as const

/** 图集行序里的鱼形(键集即鱼形全集,core 新增鱼形时此处缺键会在 textures.ts 报类型错) */
export type FishSpriteShape = keyof typeof FISH_SHAPE_ROW

/**
 * 鱼形精灵在 scale 倍显示下的 Y 偏移(切片契约单源):行序 × 帧边长 × scale 取负,
 * 直接可写进 CSS background-position-y。UI 不自行换算行序,缩放倍率由调用方传入
 * (图鉴侧见 collectionPanel.ts 的 SPRITE_SCALE,index.html 的 .fish-sprite 同值互指)。
 */
export function fishSpriteOffsetY(shape: FishSpriteShape, scale: number): number {
  // 写作 0 - x 而非 -x:行 0 归一化为 +0(不用 -0 混入数值契约)
  return 0 - FISH_SHAPE_ROW[shape] * FISH_FRAME_SIZE * scale
}
