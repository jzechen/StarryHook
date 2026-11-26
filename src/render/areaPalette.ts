import type { WaterAreaId } from '../core/types'

/**
 * 水域演出色调表(纯数据,票 #15,spec #13):三水域共用一套素材,
 * 以 PixiJS tint(乘法混色)在现有贴图/几何上做色调区分,不新增素材。
 *
 * 方案:池塘 = 既有亮蓝(tint 全白 = 素材原样,既有观感零变化);
 * 河流偏青灰、湖偏靛蓝。池底矩形与描边走「白底几何 + tint = 目标色」
 * (乘法下与直接 fill 同色),流水贴图与草地岸块走降通道 tint。
 * 浮标/角色/鱼精灵不在此表——实体不 tint,只有背景与水面换调。
 */
export interface AreaPalette {
  /** 池底矩形色(pondScene 的 pondFill,白底 + tint = 此色) */
  fill: number
  /** 池塘描边色(pondStroke,同上) */
  stroke: number
  /** 流水贴图 tint(乘法,作用于水面纹理) */
  water: number
  /** 草地岸块 tint(乘法,作用于背景) */
  bank: number
}

export const AREA_PALETTES: Record<WaterAreaId, AreaPalette> = {
  /** 池塘:既有默认亮蓝,白 tint = 素材原样 */
  pond: { fill: 0x5c9ce2, stroke: 0x0f3a4d, water: 0xffffff, bank: 0xffffff },
  /**
   * 河流:青灰——流水贴图底色约 #61a1e3(亮蓝),乘 0xa8cba6 ≈ #408094 的
   * 去饱和青灰:压红蓝、留青绿,白色泡沫读作灰白。岸块同向压红偏灰绿。
   */
  river: { fill: 0x52909a, stroke: 0x1b3a3f, water: 0xa8cba6, bank: 0xc4ded4 },
  /**
   * 湖:靛蓝——乘 0x9972d5 ≈ #3a48be 的深靛:狠压绿、保蓝紫,与池塘亮蓝
   * 一眼可分。岸块压红绿偏冷,暗示深水阴影。
   */
  lake: { fill: 0x4353b5, stroke: 0x151c4a, water: 0x9972d5, bank: 0xc3c9ee },
}
