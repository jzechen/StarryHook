/**
 * 动作键意图策略(纯函数,票 #36):动作键按下边沿时组合根该做什么。
 *
 * 优先级(关闭口径优先:面板开着时动作键只关面板,不再触发世界动作,
 * 同一次按下不会「关面板又开竿」):面板打开 = 关面板;否则摊位在前 = 开商店;
 * 储物箱在前 = 开储物箱面板(票 #40);宝箱在前 = 开箱(票 #41,一次性由
 * 已开态 store 把关,组合根按 open() 返回值结算掉落);叙事物在前 = 读彩蛋
 * 文案(票 #37,文案由组合根取物件 text 弹 toast);钓位与范围外 = 无动作
 * ——钓位的「按住蓄力抛竿」由核心经交互点来源门禁(setInteractionSource)
 * 处理,不经过本策略。
 */
import { isNarrativeKind } from '../world/interactions'

export type StallPressAction = 'close-panel' | 'open-shop' | 'open-storage' | 'open-chest' | 'read-narrative' | 'none'

export function stallPressAction(panelOpen: boolean, targetKind: string | null): StallPressAction {
  if (panelOpen) return 'close-panel'
  if (targetKind === 'stall') return 'open-shop'
  if (targetKind === 'storage') return 'open-storage'
  if (targetKind === 'chest') return 'open-chest'
  if (targetKind !== null && isNarrativeKind(targetKind)) return 'read-narrative'
  return 'none'
}
