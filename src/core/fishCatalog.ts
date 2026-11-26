import type { FishDef } from './types'

/**
 * 鱼类目录:纯数据,每种鱼绑定一种鱼类行为与出没条件(亲和)。
 * 后续图鉴 / 成长 / 多水域系统直接扩展这里。
 *
 * 亲和设计(世界系统 #14):
 * - 小白条 = 万金油锚点鱼:不声明亲和(全域、全季节昼夜、无修正),
 *   结构上保证任意(水域,季节,昼夜,天气)组合至少它可达;
 * - 全部 5 种鱼都可达池塘且不设季节/昼夜硬门(池塘任意真实时间全可达,
 *   护既有统计测试与 130 测零回归);水域硬门差异集中在河流/湖;
 * - 季节/昼夜/天气用软倍率制造构成差异(不归零,权重永为正)。
 */
export const FISH: FishDef[] = [
  {
    id: 'xiaobaitiao', name: '小白条', behavior: 'mixed', difficulty: 1, score: 10, color: 0xb8c4ce, shape: 'slim',
    // 无 habitat:全水域、无门、无修正——任何环境下的保底鱼
  },
  {
    id: 'wenzhongji', name: '稳重鲫', behavior: 'smooth', difficulty: 2, score: 15, color: 0x5fae8f, shape: 'round',
    habitat: { areas: ['pond', 'river', 'lake'], seasonMul: { summer: 0.8, autumn: 1.4 }, daylightMul: { day: 1.2 }, weatherMul: { rain: 1.2 } },
  },
  {
    id: 'qianzhuinian', name: '铅坠鲶', behavior: 'sinker', difficulty: 3, score: 25, color: 0x6f6678, shape: 'heavy',
    habitat: { areas: ['pond', 'river'], seasonMul: { winter: 0.8, summer: 1.2 }, daylightMul: { night: 1.6, day: 0.7 }, weatherMul: { rain: 1.3 } },
  },
  {
    id: 'qiqiuHetun', name: '气球河豚', behavior: 'floater', difficulty: 3, score: 25, color: 0xe88fb0, shape: 'puff',
    habitat: { areas: ['pond', 'lake'], seasonMul: { winter: 0.7, summer: 1.5 }, daylightMul: { day: 1.2 }, weatherMul: { sunny: 1.2 } },
  },
  {
    id: 'shandiansuo', name: '闪电梭', behavior: 'dart', difficulty: 5, score: 50, color: 0xf2c94c, shape: 'bolt',
    habitat: { areas: ['pond', 'river'], seasonMul: { spring: 1.3, winter: 0.7 }, daylightMul: { night: 0.8, day: 1.3 }, weatherMul: { rain: 0.7, sunny: 1.3 } },
  },
]
