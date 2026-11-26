import type { CollectionStore } from '../core/collection'

/**
 * 捕获时刻的收集册快照:捕获前后各取一份,喂给提示决策纯函数。
 * 字段与 CollectionStore 的公开读数一一对应,不含任何实现细节。
 */
export interface CollectionSnapshot {
  /** 该鱼种是否已收录 */
  hasFish: boolean
  /** 图鉴是否已集齐 */
  complete: boolean
  /** "池塘大满贯"是否已提示过(持久化标记) */
  acknowledged: boolean
}

/** 提示决策结果:两类提示可同时为真(最后一条鱼既新收录又集齐) */
export interface CollectionToastDecision {
  /** 首次收录该鱼种 → "新收录!" */
  newEntry: boolean
  /** 图鉴从未集齐变为集齐且未确认 → "池塘大满贯" */
  grandSlam: boolean
}

/**
 * 图鉴提示决策(纯函数):给定捕获前后的收集状态,决定弹哪些轻提示。
 * 新收录 = 该鱼种从未收录变为已收录(重复捕获不弹);
 * 大满贯 = 图鉴从未集齐变为集齐,且持久化标记未确认(一辈子只弹一次)。
 */
export function collectionToasts(
  before: CollectionSnapshot,
  after: CollectionSnapshot,
): CollectionToastDecision {
  return {
    newEntry: !before.hasFish && after.hasFish,
    grandSlam: !before.complete && after.complete && !after.acknowledged,
  }
}

/**
 * 从收集册读一份快照(纯读取,无副作用)。
 * 组合根在捕获边沿先读一份、登记后再读一份,两份喂给 collectionToasts。
 */
export function snapshotOf(collection: CollectionStore, fishId: string): CollectionSnapshot {
  return {
    hasFish: collection.has(fishId),
    complete: collection.isComplete(),
    acknowledged: collection.completionAcknowledged(),
  }
}
