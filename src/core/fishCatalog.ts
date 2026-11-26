import type { FishDef } from './types'

/**
 * 鱼类目录:纯数据,每种鱼绑定一种鱼类行为。
 * 后续图鉴 / 成长 / 多水域系统直接扩展这里。
 */
export const FISH: FishDef[] = [
  { id: 'xiaobaitiao', name: '小白条', behavior: 'mixed', difficulty: 1, score: 10, color: 0xb8c4ce, shape: 'slim' },
  { id: 'wenzhongji', name: '稳重鲫', behavior: 'smooth', difficulty: 2, score: 15, color: 0x5fae8f, shape: 'round' },
  { id: 'qianzhuinian', name: '铅坠鲶', behavior: 'sinker', difficulty: 3, score: 25, color: 0x6f6678, shape: 'heavy' },
  { id: 'qiqiuHetun', name: '气球河豚', behavior: 'floater', difficulty: 3, score: 25, color: 0xe88fb0, shape: 'puff' },
  { id: 'shandiansuo', name: '闪电梭', behavior: 'dart', difficulty: 5, score: 50, color: 0xf2c94c, shape: 'bolt' },
]
