import { Assets, Rectangle, Texture } from 'pixi.js'

/**
 * 场景纹理:素材文件 → 图集切片的唯一入口(ADR-0002 精灵化地基)。
 *
 * 素材来源与许可:public/sprites/scene-atlas.png 由本仓库
 * scripts/generate-placeholder-atlas.mjs 脚本生成,自绘极简占位,
 * 无第三方版权(等效 CC0);视觉打磨批一后续票将替换为
 * OpenGameArt CC0 的 16x16 水面/岸块,替换时同步更新下方切片区域常量。
 *
 * 基线像素密度:16x16(spec #8 统一约定),480×270 = 30×17 tile。
 */

/** 逻辑分辨率下的 tile 边长(像素) */
export const TILE = 16

/** 图集内区域(与生成脚本的布局注释保持一致) */
const WATER_A_RECT = new Rectangle(0, 0, TILE, TILE)
const WATER_B_RECT = new Rectangle(TILE, 0, TILE, TILE)
const GRASS_RECT = new Rectangle(TILE * 2, 0, TILE, TILE)
const BOBBER_RECT = new Rectangle(TILE * 3, 2, 8, 12)

export interface SceneTextures {
  /** 水面两帧:每 0.55s 交替 = 波光动画(后续鱼/场景帧动画同路径) */
  waterFrames: [Texture, Texture]
  /** 草地岸块:全屏平铺 */
  grassTile: Texture
  /** 浮标:单个精灵贴图 */
  bobber: Texture
}

/** 加载并切片场景图集;main 启动时 await 一次,把结果注入 PondScene */
export async function loadSceneTextures(): Promise<SceneTextures> {
  const atlas = await Assets.load<Texture>('/sprites/scene-atlas.png')
  const source = atlas.source
  const slice = (frame: Rectangle): Texture => new Texture({ source, frame })
  return {
    waterFrames: [slice(WATER_A_RECT), slice(WATER_B_RECT)],
    grassTile: slice(GRASS_RECT),
    bobber: slice(BOBBER_RECT),
  }
}
