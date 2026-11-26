import { BAITS } from '../config'
import type { BaitEffect } from '../core/coreLoop'
import type { WalletStore } from '../core/wallet'
import type { ShopBuyOutcome } from './shopPanel'

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
