import { describe, expect, it } from 'vitest'
import { FISH } from '../core/fishCatalog'
import type { FishDef } from '../core/types'
import { sortFishByDifficulty } from './collectionPanelOrder'

/** 自造目录:难度故意打乱(3 → 1 → 2 → 2),目录顺序 ≠ 难度顺序 */
const SHUFFLED: FishDef[] = [
  { id: 'd3', name: '甲', behavior: 'dart', difficulty: 3, score: 50, color: 0x111111, shape: 'bolt' },
  { id: 'd1', name: '乙', behavior: 'mixed', difficulty: 1, score: 10, color: 0x222222, shape: 'slim' },
  { id: 'd2-first', name: '丙', behavior: 'sinker', difficulty: 2, score: 25, color: 0x333333, shape: 'heavy' },
  { id: 'd2-second', name: '丁', behavior: 'smooth', difficulty: 2, score: 25, color: 0x444444, shape: 'round' },
]

/**
 * 接缝:图鉴条目排序(纯函数,注入目录,期望值为独立字面量)。
 * spec(#3):面板按难度从低到高列出全部鱼种;同难度保持目录序。
 */
describe('sortFishByDifficulty(接缝:图鉴条目排序)', () => {
  it('目录顺序 ≠ 难度顺序时,仍按难度升序重排(不依赖数组序)', () => {
    expect(sortFishByDifficulty(SHUFFLED).map(f => f.id)).toEqual([
      'd1',
      'd2-first',
      'd2-second',
      'd3',
    ])
  })

  it('同难度平局保持目录相对顺序(稳定排序)', () => {
    expect(sortFishByDifficulty(SHUFFLED.slice(2, 4)).map(f => f.id)).toEqual([
      'd2-first',
      'd2-second',
    ])
  })

  it('生产目录:排序结果即难度升序(票 #53 扩容后 18 条;同难度保持目录序)', () => {
    expect(sortFishByDifficulty(FISH).map(f => f.id)).toEqual([
      // 难度 1
      'xiaobaitiao',
      'cuilinTaiyangyu',
      // 难度 2
      'wenzhongji',
      'niquQiu',
      'woliuShen',
      'jinlinLi',
      // 难度 3
      'qianzhuinian',
      'qiqiuHetun',
      'denglongNian',
      'tongxuJi',
      'yuyingZun',
      'jiliuHongzun',
      'wuyingLu',
      // 难度 4
      'tiejiaLing',
      'yexingzheNian',
      'yueyingMan',
      // 难度 5
      'shandiansuo',
      'shuangqiangGouyu',
    ])
  })

  it('纯函数:返回新数组,不改动传入目录', () => {
    const snapshot = SHUFFLED.map(f => f.id)
    sortFishByDifficulty(SHUFFLED)
    expect(SHUFFLED.map(f => f.id)).toEqual(snapshot)
  })
})
