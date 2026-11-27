import { FISH } from '../core/fishCatalog'
import type { FishDef } from '../core/types'

/**
 * 鱼精灵图集布局(票 #11 起步,票 #53 扩容):public/sprites/fish-atlas.png 的
 * 几何约定,是生成器(scripts/generate-fish-atlas.mjs)与两处消费端之间唯一的
 * 行序契约——
 * - src/render/textures.ts 按行序切片出每鱼 2 帧
 * - src/ui/collectionPanel.ts 按行序消费 fishSpriteOffsetY 定位(图鉴条目精灵)
 *
 * 票 #53:行序契约从「鱼形」改为「鱼种」——18 种鱼同形者多,按形取行会让
 * 同形鱼共用一张贴图(色相变体无处落地);行 = 鱼种(目录序),行内配色由
 * 生成器按种重锚(色相变体,同形不同色)。
 */

/** 单帧边长(逻辑像素,16x16 基线) */
export const FISH_FRAME_SIZE = 16
/** 每鱼帧数:0 = 常态,1 = 游动 */
export const FISH_FRAME_COUNT = 2

/**
 * 鱼种 id → 图集行序(行序 = core 目录序,单一来源由目录本身给出):
 * 目录加鱼即得新行,无需在此维护第二份键表;拼错的鱼种 id 在
 * fishSpriteOffsetY 处显式抛错(不静默错位)。
 */
export const FISH_SPECIES_ROW: Readonly<Record<string, number>> = Object.fromEntries(
  FISH.map((fish, index) => [fish.id, index]),
)

/** 鱼种 id(目录键集即鱼种全集) */
export type FishSpriteSpecies = FishDef['id']

/**
 * 鱼种精灵在 scale 倍显示下的 Y 偏移(切片契约单源):行序 × 帧边长 × scale 取负,
 * 直接可写进 CSS background-position-y。UI 不自行换算行序,缩放倍率由调用方传入
 * (图鉴侧见 collectionPanel.ts 的 SPRITE_SCALE,index.html 的 .fish-sprite 同值互指)。
 */
export function fishSpriteOffsetY(speciesId: FishSpriteSpecies, scale: number): number {
  const row = FISH_SPECIES_ROW[speciesId]
  if (row === undefined) throw new Error(`未知鱼种:${speciesId}`)
  // 写作 0 - x 而非 -x:行 0 归一化为 +0(不用 -0 混入数值契约)
  return 0 - row * FISH_FRAME_SIZE * scale
}
