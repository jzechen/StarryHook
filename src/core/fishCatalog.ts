import type { FishDef } from './types'

/**
 * 鱼类目录:纯数据,每种鱼绑定一种鱼类行为与出没条件(亲和)。
 * 后续图鉴 / 成长 / 多水域系统直接扩展这里。
 *
 * 亲和设计(世界系统 #14):
 * - 小白条 = 万金油锚点鱼:不声明亲和(全域、全季节昼夜、无修正),
 *   结构上保证任意(水域,季节,昼夜,天气)组合至少它可达;
 * - 池塘既有 5 种不设季节/昼夜硬门(池塘任意真实时间全可达的目录侧红线,
 *   票 #53 扩容后仍只护这 5 种;新鱼只做加法,按名册挂硬门/软倍率);
 * - 季节/昼夜/天气用软倍率制造构成差异(不归零,权重永为正)。
 *
 * 内容扩容(票 #53,spec #52):5 → 18 种,名册 13 条钉在票评论区——
 * 三水域各 +4~5 种,条件矩阵覆盖全「季节 × 昼夜 × 天气」,稀有组合挂
 * 双硬门(雾影鲈 = 雨天+夜晚,霜枪狗鱼 = 冬季+夜晚,图鉴压轴);
 * 行为五型全覆盖、难度 1~5 梯度完整(难度 4 = 分值 35,内插既有梯度)。
 * 目录序 = 图集行序契约(render/fishAtlas.ts FISH_SPECIES_ROW):既有 5 种
 * 保持在前(既有测试索引稳定),新 13 条按 村舍→河谷→湖畔 追加。
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
  // —— 票 #53 名册 13 条(村舍 4 / 河谷 5 / 湖畔 4)——
  {
    id: 'niquQiu', name: '泥趣鳅', behavior: 'sinker', difficulty: 2, score: 15, color: 0x8a6a45, shape: 'slim',
    habitat: { areas: ['pond'], weatherMul: { rain: 3 } },
  },
  {
    id: 'denglongNian', name: '灯笼鲇', behavior: 'floater', difficulty: 3, score: 25, color: 0xd98245, shape: 'heavy',
    habitat: { areas: ['pond'], daylight: ['night'] },
  },
  {
    id: 'cuilinTaiyangyu', name: '翠鳞太阳鱼', behavior: 'smooth', difficulty: 1, score: 10, color: 0x55c85a, shape: 'round',
    habitat: { areas: ['pond'], seasonMul: { spring: 2 }, daylightMul: { day: 2 } },
  },
  {
    id: 'tongxuJi', name: '铜须鲫', behavior: 'mixed', difficulty: 3, score: 25, color: 0xb06a35, shape: 'round',
    habitat: { areas: ['pond'], seasonMul: { autumn: 2 } },
  },
  {
    id: 'yuyingZun', name: '雨影鳟', behavior: 'smooth', difficulty: 3, score: 25, color: 0x6f8fb8, shape: 'slim',
    habitat: { areas: ['river'], weatherMul: { rain: 3 } },
  },
  {
    id: 'tiejiaLing', name: '铁甲鲮', behavior: 'sinker', difficulty: 4, score: 35, color: 0x6f8fa0, shape: 'heavy',
    habitat: { areas: ['river'], seasons: ['winter'] },
  },
  {
    id: 'jiliuHongzun', name: '急流虹鳟', behavior: 'dart', difficulty: 3, score: 25, color: 0xd470a0, shape: 'bolt',
    habitat: { areas: ['river'], seasonMul: { spring: 2 }, daylightMul: { day: 2 } },
  },
  {
    id: 'yexingzheNian', name: '夜行者鲶', behavior: 'mixed', difficulty: 4, score: 35, color: 0x4a4f6e, shape: 'heavy',
    habitat: { areas: ['river'], daylightMul: { night: 2 } },
  },
  {
    id: 'woliuShen', name: '涡流鲹', behavior: 'smooth', difficulty: 2, score: 15, color: 0x4a8fb5, shape: 'round',
    habitat: { areas: ['river'], weatherMul: { sunny: 2 } },
  },
  {
    id: 'yueyingMan', name: '月影鳗', behavior: 'mixed', difficulty: 4, score: 35, color: 0xb0a8d4, shape: 'slim',
    habitat: { areas: ['lake'], daylight: ['night'] },
  },
  {
    id: 'jinlinLi', name: '金鳞鲤', behavior: 'floater', difficulty: 2, score: 15, color: 0xe0b54a, shape: 'round',
    habitat: { areas: ['lake'], seasonMul: { summer: 2 }, daylightMul: { day: 2 } },
  },
  {
    id: 'wuyingLu', name: '雾影鲈', behavior: 'smooth', difficulty: 3, score: 25, color: 0x9a92b0, shape: 'round',
    habitat: { areas: ['lake'], weather: ['rain'], daylight: ['night'] },
  },
  {
    id: 'shuangqiangGouyu', name: '霜枪狗鱼', behavior: 'dart', difficulty: 5, score: 50, color: 0x86d9de, shape: 'bolt',
    habitat: { areas: ['lake'], seasons: ['winter'], daylight: ['night'] },
  },
]
