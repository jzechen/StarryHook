import { BAITS } from '../config'
import { collectibleName } from './collectibles'

/**
 * 宝箱内容表(票 #41,spec §4.5):世界宝箱的固定掉落,**表驱动、纯函数、不随机**。
 *
 * - 金币:开箱即 wallet.earn(既有入账路径,组合根接线,金币唯一来源 = 卖鱼 + 宝箱);
 * - 鱼饵:走库存直加(wallet.grantBait,与 buyBait 的入库段同构,无扣款);
 * - 收藏品:backpack.addCollectible(目录 = collectibles 表,目录外忽略)。
 *
 * 一次性与已开态持久归 chestState.ts(kv 自开键);地图物件按 `chest` 属性引用
 * 本表 id(interactions.ts 解析期校验,拼写错挡在解析期)。
 */
export interface ChestDef {
  /** 宝箱 id(kv 已开态快照与地图物件 `chest` 属性引用;跨图唯一) */
  id: string
  /** 显示名(开箱提示主语) */
  name: string
  /** 固定掉落(一次结算;单掉落 = 内容表最小决策面) */
  loot: ChestLoot
}

/** 一种掉落(金币 / 鱼饵 / 收藏品;开箱即结算,不进流程中间态) */
export type ChestLoot =
  | { type: 'coins'; coins: number }
  | { type: 'bait'; baitId: string; count: number }
  | { type: 'collectible'; collectibleId: string }

/** 宝箱表(id 唯一;掉落引用饵/收藏品目录,纪律由 chests.test 钉住) */
export const CHESTS: readonly ChestDef[] = [
  { id: 'village-hedge', name: '篱笆角的宝箱', loot: { type: 'coins', coins: 30 } },
  { id: 'village-grove', name: '树影的宝箱', loot: { type: 'collectible', collectibleId: 'willow-carving' } },
  { id: 'river-bend', name: '河湾的宝箱', loot: { type: 'bait', baitId: 'xianger', count: 5 } },
  { id: 'lake-shore', name: '湖畔的宝箱', loot: { type: 'collectible', collectibleId: 'pearl' } },
]

/** id 查宝箱定义(目录外 = null;地图解析期与已开态快照校验共用) */
export function chestDef(id: string): ChestDef | null {
  return CHESTS.find(c => c.id === id) ?? null
}

/** 掉落摘要(开箱提示文案单源):「30 金币」/「香饵 ×5」/ 收藏品目录名 */
export function chestLootText(loot: ChestLoot): string {
  if (loot.type === 'coins') return `${loot.coins} 金币`
  if (loot.type === 'bait') {
    const bait = BAITS.find(b => b.id === loot.baitId)
    return `${bait?.name ?? loot.baitId} ×${loot.count}`
  }
  return collectibleName(loot.collectibleId) ?? loot.collectibleId
}

/** 开箱提示:宝箱名 + 掉落摘要(toast 单源;组合根开箱沿时弹一句) */
export function chestOpenToastText(def: ChestDef): string {
  return `${def.name}:${chestLootText(def.loot)}`
}
