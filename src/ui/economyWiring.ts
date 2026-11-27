import { BAITS } from '../config'
import type { BackpackStore } from '../core/backpack'
import type { ChestDef } from '../core/chests'
import type { BaitEffect } from '../core/coreLoop'
import { FISH } from '../core/fishCatalog'
import { deliveryPlan, orderReward, type OrderBoardStore } from '../core/orderBoard'
import { sellPriceFor } from '../core/quality'
import type { FishQuality } from '../core/types'
import type { WalletStore } from '../core/wallet'
import type { ShopBuyOutcome, ShopSellOutcome } from './shopPanel'

/** 香饵的等待时长修正系数(票 #19):TUNE.wait.min/max 同乘,分布形状不变 */
export const SCENTED_BAIT_WAIT_SCALE = 0.5

/**
 * 本竿饵效果来源(组合根注入缝的工厂,经济接线可测单源):
 * 返回的闭包在每次抛竿时刻被核心循环调用恰好一次(调用纪律由核心循环保证)——
 * 先读装备槽,再抛竿消耗一支,按饵种产出效果:
 * - 香饵(xianger)→ 等待时长减半;
 * - 浓饵(nonger)→ 难鱼权重提升(等待不减半——浓饵不减半等待、香饵不提升权重,
 *   互斥由装备槽既有语义保证:同一时间只装备一种,切换不清余量);
 * - 未装备/耗尽 → null(本竿无饵效果,现行行为,自动回退)。
 * 消耗与效果同源:单缝下不再有调用次序契约,每竿恰好消耗一支。
 */
export function baitEffectSource(wallet: WalletStore): () => BaitEffect | null {
  return () => {
    const equipped = wallet.equippedBait()
    const consumed = wallet.consumeBaitForCast() ? equipped : null
    if (consumed === 'xianger') return { waitScale: SCENTED_BAIT_WAIT_SCALE, richBait: false }
    if (consumed === 'nonger') return { waitScale: 1, richBait: true }
    return null
  }
}

/**
 * 商店购饵回调(组合根接线):购买成功即**自动装备**(review 修复——买到即生效,
 * 玩家无需再找装备入口,效果实玩可达;重复购买同种饵仍按既有槽位语义无副作用)。
 * 失败映射:余额不足 → insufficient;目录外/非法 id → meaningless。
 */
export function buyBaitOutcome(wallet: WalletStore): (baitId: string) => ShopBuyOutcome {
  return baitId => {
    const result = wallet.buyBait(baitId)
    if (!result.ok) return result.reason === 'insufficient' ? 'insufficient' : 'meaningless'
    wallet.equip(baitId)
    return 'ok'
  }
}

/**
 * 装备中鱼饵的徽章视图(顶栏「垂钓中可见的饵余量」,review 修复):
 * 未装备(含目录外装备态降级)→ null;装备 → 饵名(由 BAITS 表派生)+ 实时余量,
 * 交 baitBadgeText 派生文案(耗尽 → 文案 null,徽章自动消失)。
 */
export function equippedBaitView(wallet: WalletStore): { name: string; count: number } | null {
  const id = wallet.equippedBait()
  const bait = BAITS.find(b => b.id === id)
  return bait ? { name: bait.name, count: wallet.baitCount(bait.id) } : null
}

/**
 * 摊位卖鱼回调(组合根接线,票 #39 spec §4.3):从背包取出 n 条渔获,
 * 按(鱼分值 × 品质倍率)经 wallet 既有 earn 入账——金币唯一来源 = 卖鱼 + 宝箱。
 * 空堆叠/目录外鱼种 → 'empty'(不取货、不入账);count 超出余量按余量钳制
 * (背包 take 的钳制语义),入账与取货同一次调用完成,不存在中间态。
 */
export function sellFishOutcome(
  backpack: BackpackStore,
  wallet: WalletStore,
): (fishId: string, quality: FishQuality, count: number) => ShopSellOutcome {
  return (fishId, quality, count) => {
    const fish = FISH.find(f => f.id === fishId)
    if (!fish) return 'empty'
    const taken = backpack.take(fishId, quality, count)
    if (taken <= 0) return 'empty'
    wallet.earn(sellPriceFor(fish.score, quality) * taken)
    return 'ok'
  }
}

/**
 * 宝箱掉落结算(组合根接线,票 #41 spec §4.5「开箱即结算」):按内容表把
 * 一次掉落直接送进既有库存路径,无中间态——金币 wallet.earn(金币唯一来源
 * = 卖鱼 + 宝箱)、鱼饵 wallet.grantBait(库存直加,无扣款)、收藏品
 * backpack.addCollectible(目录外忽略)。一次性判定不在此处:组合根先经
 * ChestOpenedStore.open 恰好一次成功后才调用(开箱态为结算唯一入口)。
 */
export function grantChestLoot(chest: ChestDef, wallet: WalletStore, backpack: BackpackStore): void {
  const loot = chest.loot
  if (loot.type === 'coins') wallet.earn(loot.coins)
  else if (loot.type === 'bait') wallet.grantBait(loot.baitId, loot.count)
  else backpack.addCollectible(loot.collectibleId)
}

/**
 * 一次订单交付的语义结果(回调返回,行内反馈沿 ShopBuyOutcome 风格,票 #55):
 * ok = 已交付并出新单;missing = 缺鱼(该鱼种数量不足);quality = 品质不足
 * (总数够、达标堆不够)。拒绝时状态原样不动(不扣包、不入账、不换单)。
 */
export type OrderDeliverOutcome = 'ok' | 'missing' | 'quality'

/**
 * 订单交付回调(组合根接线,票 #55):公告板当前订单 × 背包堆叠 → 交付。
 * 一体完成,无中间态:按交付计划(达标堆叠低品质在前的贪心)扣背包渔获 →
 * 酬金 = 鱼分值 × 数量 × 1.5 经 wallet.earn 入账 → OrderBoardStore.complete()
 * 随即出新单(队列制同时仅一单)。拒绝分支(缺鱼/品质不足)在任何写入前返回,
 * 状态原样。校验单源 = deliveryPlan(纯函数),本接线只做执行与入账。
 */
export function deliverOrderOutcome(
  board: OrderBoardStore,
  backpack: BackpackStore,
  wallet: WalletStore,
): () => OrderDeliverOutcome {
  return () => {
    const order = board.current()
    const counts: Record<FishQuality, number> = {
      normal: backpack.count(order.fishId, 'normal'),
      silver: backpack.count(order.fishId, 'silver'),
      gold: backpack.count(order.fishId, 'gold'),
    }
    const plan = deliveryPlan(order, counts)
    if (!plan.ok) return plan.reason
    let taken = 0
    for (const take of plan.takes) taken += backpack.take(order.fishId, take.quality, take.count)
    // 计划读数与取货处于同一同步块(与 sellFishOutcome 同款原子假设),
    // 短取不可达;防御分支保持状态可解释(不刷酬金)
    if (taken !== order.count) return 'missing'
    const fish = FISH.find(f => f.id === order.fishId)
    if (!fish) return 'missing' // 池表校验已挡,理论不可达
    wallet.earn(orderReward(fish.score, order.count))
    board.complete()
    return 'ok'
  }
}
