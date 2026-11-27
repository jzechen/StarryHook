/**
 * 动作键意图策略(纯函数,票 #36):动作键按下边沿时组合根该做什么。
 *
 * 优先级(关闭口径优先:面板开着时动作键只关面板,不再触发世界动作,
 * 同一次按下不会「关面板又开竿」):面板打开 = 关面板;否则摊位在前 = 开商店;
 * 钓位与范围外 = 无动作——钓位的「按住蓄力抛竿」由核心经交互点来源门禁
 * (setInteractionSource)处理,不经过本策略。
 */
export type StallPressAction = 'close-panel' | 'open-shop' | 'none'

export function stallPressAction(panelOpen: boolean, targetKind: string | null): StallPressAction {
  if (panelOpen) return 'close-panel'
  if (targetKind === 'stall') return 'open-shop'
  return 'none'
}
