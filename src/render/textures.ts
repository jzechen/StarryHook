import { Assets, Rectangle, Texture } from 'pixi.js'

/**
 * 场景纹理:素材文件 → 图集切片的唯一入口(ADR-0002 精灵化)。
 *
 * 素材来源与许可(全部 CC0,署名与派生规则详见 public/sprites/README.md):
 * - water-flow.png      OGA「Animated flowing water 2d 16x16」13 帧流水条(原样)
 * - shoreline-waves.png 派生自 OGA「16x16 Shoreline Wave Animation Tiles」BASE 行
 *                       8 帧(品红键色与泥土像素置透明,只留白色泡沫,旋转出四边贴图)
 * - grass.png           派生自 OGA「16x16 tileset: water, grass and sand」(1,0) 纯草块,整体压暗
 * - character.png       派生自 OGA「Character sprite + walk animation」ch003.png
 *                       (32x32 四向行走帧众数降采样为 16x16)
 * - scene-atlas.png     自绘浮标道具图集(scripts/generate-placeholder-atlas.mjs 生成,无第三方版权)
 *
 * 基线像素密度:16x16(spec #8 统一约定),480×270 = 30×17 tile。
 */

/** 逻辑分辨率下的 tile 边长(像素) */
export const TILE = 16

/** 流水条帧数(water-flow.png 208×16) */
export const WATER_FRAME_COUNT = 13
/** 岸线波纹帧数(shoreline-waves.png 单边 8 帧) */
export const WAVE_FRAME_COUNT = 8
/** 角色每向帧数(character.png 每向 4 帧,帧 0 = 待机) */
export const PLAYER_FRAME_COUNT = 4

/** 角色朝向(character.png 行序:下/上/左/右) */
export type Facing = 'down' | 'up' | 'left' | 'right'
/** 岸线波纹贴边(shoreline-waves.png 行序:上/右/下/左,土侧朝外) */
export type WaveEdge = 'top' | 'right' | 'bottom' | 'left'

export interface SceneTextures {
  /** 池水流动帧(按周期轮换 = 流水动画) */
  waterFrames: Texture[]
  /** 草地岸块:全屏平铺 */
  grassTile: Texture
  /** 岸线波纹:每条边一组泡沫动画帧 */
  waveFrames: Record<WaveEdge, Texture[]>
  /** 角色:每向一组行走帧(帧 0 = 待机) */
  playerFrames: Record<Facing, Texture[]>
  /** 浮标:单个精灵贴图 */
  bobber: Texture
}

/** 从纹理源切出单帧 */
function slice(source: Texture['source'], frame: Rectangle): Texture {
  return new Texture({ source, frame })
}

/** 横向条带切片:单行 count 帧,每帧 frameW×frameH */
function sliceStrip(source: Texture['source'], count: number, frameW: number, frameH: number): Texture[] {
  return Array.from({ length: count }, (_, i) => slice(source, new Rectangle(i * frameW, 0, frameW, frameH)))
}

/** 网格切片:rows 行 × 每行 count 帧,行序自上而下 */
function sliceGrid(
  source: Texture['source'],
  rows: number,
  count: number,
  frameW: number,
  frameH: number,
): Texture[][] {
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: count }, (_, c) =>
      slice(source, new Rectangle(c * frameW, r * frameH, frameW, frameH)),
    ),
  )
}

/** 加载并切片全部场景素材;main 启动时 await 一次,把结果注入 PondScene */
export async function loadSceneTextures(): Promise<SceneTextures> {
  const [flow, waveSheet, grass, chars, props] = await Promise.all([
    Assets.load<Texture>('/sprites/water-flow.png'),
    Assets.load<Texture>('/sprites/shoreline-waves.png'),
    Assets.load<Texture>('/sprites/grass.png'),
    Assets.load<Texture>('/sprites/character.png'),
    Assets.load<Texture>('/sprites/scene-atlas.png'),
  ])
  const waveRows = sliceGrid(waveSheet.source, 4, WAVE_FRAME_COUNT, TILE, TILE)
  const charRows = sliceGrid(chars.source, 4, PLAYER_FRAME_COUNT, TILE, TILE)
  return {
    waterFrames: sliceStrip(flow.source, WATER_FRAME_COUNT, TILE, TILE),
    grassTile: slice(grass.source, new Rectangle(0, 0, TILE, TILE)),
    // 行序与素材表一致:上/右/下/左(土侧朝外,泡沫朝水内)
    waveFrames: { top: waveRows[0], right: waveRows[1], bottom: waveRows[2], left: waveRows[3] },
    // 行序与素材表一致:下/上/左/右
    playerFrames: { down: charRows[0], up: charRows[1], left: charRows[2], right: charRows[3] },
    bobber: slice(props.source, new Rectangle(0, 0, TILE, TILE)),
  }
}
