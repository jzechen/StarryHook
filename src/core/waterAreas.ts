import type { WaterAreaId } from './types'

/**
 * 水域注册表:纯数据(spec #13 沿用鱼类目录的数据先例)。
 * 每片水域 = 基底鱼池(鱼 id → 基底权重,蓄力与环境修正在此之上叠乘)+ 代表鱼。
 * 出鱼权重的最终构成由 fishPool.computePoolWeights 引擎按环境计算;
 * 本表只声明「哪里有什么鱼、基底多少」。
 *
 * 设计约束(护既有测试红线):池塘 = 全部 5 种鱼、无硬门(任意真实时间全可达);
 * 硬门差异集中在河流/湖(气球河豚不进河流;铅坠鲶/闪电梭不进湖)。
 */
export interface WaterAreaDef {
  id: WaterAreaId
  /** 显示名(顶栏/切换面板用) */
  name: string
  /** 基底鱼池:可能咬钩的鱼及其基底权重(引擎输入;不在表中的鱼在该水域权重为 0) */
  baseWeights: Readonly<Record<string, number>>
  /** 代表鱼(切换面板提示用,须在自身鱼池内) */
  signatureFishId: string
}

export const WATER_AREAS: WaterAreaDef[] = [
  {
    id: 'pond',
    name: '池塘',
    signatureFishId: 'wenzhongji',
    // 基底全 1:现行 cast 公式的基底形态(环境与蓄力修正在引擎层叠乘)
    baseWeights: { xiaobaitiao: 1, wenzhongji: 1, qianzhuinian: 1, qiqiuHetun: 1, shandiansuo: 1 },
  },
  {
    id: 'river',
    name: '河流',
    signatureFishId: 'shandiansuo',
    // 以铅坠鲶/闪电梭为主;气球河豚不进河流(亲和硬门)
    baseWeights: { xiaobaitiao: 0.8, wenzhongji: 0.8, qianzhuinian: 1.6, shandiansuo: 1.6 },
  },
  {
    id: 'lake',
    name: '湖',
    signatureFishId: 'qiqiuHetun',
    // 以气球河豚/稳重鲫为主;铅坠鲶/闪电梭不进湖(亲和硬门)
    baseWeights: { xiaobaitiao: 0.8, wenzhongji: 1.6, qiqiuHetun: 1.6 },
  },
]

/** 默认水域:池塘(既有玩家行为不变) */
export const DEFAULT_AREA: WaterAreaId = 'pond'

/** 按 id 取水域定义;未知 id 抛错(挡住拼错的水域 id 流入状态机) */
export function waterAreaOf(id: WaterAreaId): WaterAreaDef {
  const area = WATER_AREAS.find(a => a.id === id)
  if (!area) throw new Error(`未知水域:${id}`)
  return area
}
