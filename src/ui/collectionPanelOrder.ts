import type { FishDef } from '../core/types'

/**
 * 图鉴条目排序(纯函数):按难度从低到高排列目录(spec #3),
 * 不依赖目录数组序;同难度平局保持目录相对顺序(显式按下标裁决,稳定)。
 * 返回新数组,不改动传入目录。
 */
export function sortFishByDifficulty(catalog: readonly FishDef[]): FishDef[] {
  return catalog
    .map((fish, index) => ({ fish, index }))
    .sort((a, b) => a.fish.difficulty - b.fish.difficulty || a.index - b.index)
    .map(entry => entry.fish)
}
