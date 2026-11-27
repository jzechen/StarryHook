import { Assets, Rectangle, Texture } from 'pixi.js'
import type { FishDef, Facing } from '../core/types'
import { FISH_FRAME_COUNT, FISH_FRAME_SIZE, FISH_SHAPE_ROW } from './fishAtlas'

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
 * - tiny-town.png       Kenney「Tiny Town」packed 表(原样,票 #34):12 列 × 11 行,
 *                       行优先编号 tile_N = packed (N÷12, N%12)(调研留痕:票 #26)
 * - tiny-dungeon.png    Kenney「Tiny Dungeon」packed 表(原样,票 #41):同 12 列 × 11 行
 *                       行优先编号;本票只取宝箱两态帧(90 = 闭箱 / 91 = 开箱,见下)
 * - scene-atlas.png     自绘浮标图集(scripts/generate-bobber-atlas.mjs 生成,无第三方版权)
 * - fish-atlas.png      自绘鱼精灵图集(scripts/generate-fish-atlas.mjs 生成,无第三方版权)
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
/** Kenney Tiny Town packed 表列数(village.json tileset 契约同源,票 #34) */
export const TOWN_COLUMNS = 12
/** Kenney Tiny Town packed 表 tile 总数(12 列 × 11 行) */
export const TOWN_TILE_COUNT = 132
/** Kenney Tiny Dungeon 宝箱闭箱帧(tile id,行优先 packed 编号,票 #41) */
export const CHEST_TILE_CLOSED = 89
/** Kenney Tiny Dungeon 宝箱开箱帧(盖板掀起 = 空箱外观,票 #41) */
export const CHEST_TILE_OPEN = 90
/** 鱼精灵每鱼帧数(fish-atlas.png,帧 0 = 常态 / 帧 1 = 游动) */
export { FISH_FRAME_COUNT } from './fishAtlas'

/** 角色朝向(核心状态,票 #35 迁至 core/types;此处沿用其行序契约:下/上/左/右) */
export type { Facing }
/** 岸线波纹贴边(shoreline-waves.png 行序:上/右/下/左,土侧朝外) */
export type WaveEdge = 'top' | 'right' | 'bottom' | 'left'

export interface SceneTextures {
  /** 池水流动帧(按周期轮换 = 流水动画) */
  waterFrames: Texture[]
  /**
   * OGA 草块(press 暗化派生):pondScene 时代的整屏基底;世界场景(票 #34)
   * 改用 townTiles[0] Kenney 平草后暂无消费方,素材与切片保留(派生管线不删,
   * 票 #42 主题化/调色复检可能复用)。
   */
  grassTile: Texture
  /** 岸线波纹:每条边一组泡沫动画帧 */
  waveFrames: Record<WaveEdge, Texture[]>
  /** 角色:每向一组行走帧(帧 0 = 待机) */
  playerFrames: Record<Facing, Texture[]>
  /** Kenney Tiny Town packed 表切片(下标 = tile id,行优先;世界地图渲染用,票 #34) */
  townTiles: Texture[]
  /** 宝箱两态帧(票 #41,spec §4.5):闭箱 / 开箱(空箱外观),由已开态切换 */
  chestFrames: { closed: Texture; open: Texture }
  /** 浮标:单个精灵贴图 */
  bobber: Texture
  /** 鱼精灵:每种鱼 2 帧游动动画(帧 0 = 常态),按鱼形取用 */
  fishFrames: Record<FishDef['shape'], Texture[]>
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

/** packed 表 tile id → 帧矩形(12 列行优先:tile_N = (N÷12, N%12),票 #26 编号表) */
function chestFrame(tileId: number): Rectangle {
  return new Rectangle((tileId % 12) * TILE, Math.floor(tileId / 12) * TILE, TILE, TILE)
}

/** 加载并切片全部场景素材;main 启动时 await 一次,把结果注入场景(WorldScene) */
export async function loadSceneTextures(): Promise<SceneTextures> {
  const [flow, waveSheet, grass, chars, town, dungeon, props, fishAtlas] = await Promise.all([
    Assets.load<Texture>('/sprites/water-flow.png'),
    Assets.load<Texture>('/sprites/shoreline-waves.png'),
    Assets.load<Texture>('/sprites/grass.png'),
    Assets.load<Texture>('/sprites/character.png'),
    Assets.load<Texture>('/sprites/tiny-town.png'),
    Assets.load<Texture>('/sprites/tiny-dungeon.png'),
    Assets.load<Texture>('/sprites/scene-atlas.png'),
    Assets.load<Texture>('/sprites/fish-atlas.png'),
  ])
  const waveRows = sliceGrid(waveSheet.source, 4, WAVE_FRAME_COUNT, TILE, TILE)
  const charRows = sliceGrid(chars.source, 4, PLAYER_FRAME_COUNT, TILE, TILE)
  // 鱼图集:行 = 鱼(行序契约见 fishAtlas.ts),列 = 帧;逐鱼显式取行,
  // core 鱼形全集与图集行序的对应关系由 Record 类型兜底(缺行/多行都报类型错)
  const fishRows = sliceGrid(fishAtlas.source, Object.keys(FISH_SHAPE_ROW).length, FISH_FRAME_COUNT, FISH_FRAME_SIZE, FISH_FRAME_SIZE)
  const fishFrames = {
    slim: fishRows[FISH_SHAPE_ROW.slim],
    round: fishRows[FISH_SHAPE_ROW.round],
    heavy: fishRows[FISH_SHAPE_ROW.heavy],
    puff: fishRows[FISH_SHAPE_ROW.puff],
    bolt: fishRows[FISH_SHAPE_ROW.bolt],
  }
  return {
    waterFrames: sliceStrip(flow.source, WATER_FRAME_COUNT, TILE, TILE),
    grassTile: slice(grass.source, new Rectangle(0, 0, TILE, TILE)),
    // 行序与素材表一致:上/右/下/左(土侧朝外,泡沫朝水内)
    waveFrames: { top: waveRows[0], right: waveRows[1], bottom: waveRows[2], left: waveRows[3] },
    // 行序与素材表一致:下/上/左/右
    playerFrames: { down: charRows[0], up: charRows[1], left: charRows[2], right: charRows[3] },
    // Kenney packed 表:12 列 × 11 行行优先切片,下标 = tile id(地图 gid − firstGid)
    townTiles: sliceGrid(town.source, TOWN_TILE_COUNT / TOWN_COLUMNS, TOWN_COLUMNS, TILE, TILE).flat(),
    // 宝箱两态帧(票 #41):Tiny Dungeon packed 表按同一 12 列行优先编号取格
    chestFrames: {
      closed: slice(dungeon.source, chestFrame(CHEST_TILE_CLOSED)),
      open: slice(dungeon.source, chestFrame(CHEST_TILE_OPEN)),
    },
    bobber: slice(props.source, new Rectangle(0, 0, TILE, TILE)),
    fishFrames,
  }
}
