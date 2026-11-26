import { describe, expect, it } from 'vitest'
import { collectionPanelAllowed } from './collectionPanelPolicy'

/**
 * 接缝:图鉴面板开关策略(纯函数,固定输入,期望值为独立字面量)。
 * 可开阶段 = 待机 / 蓄力 / 等待;禁用阶段 = 咬钩 / 钓鱼小游戏 / 结算(捕获、脱钩)。
 */
describe('collectionPanelAllowed(接缝:图鉴面板开关策略)', () => {
  it('待机、蓄力、等待阶段允许打开面板', () => {
    expect(collectionPanelAllowed('idle')).toBe(true)
    expect(collectionPanelAllowed('charging')).toBe(true)
    expect(collectionPanelAllowed('waiting')).toBe(true)
  })

  it('咬钩阶段禁用:对抗响应时刻不被面板遮挡与误触', () => {
    expect(collectionPanelAllowed('bite')).toBe(false)
  })

  it('钓鱼小游戏阶段禁用', () => {
    expect(collectionPanelAllowed('minigame')).toBe(false)
  })

  it('结算阶段(捕获、脱钩)禁用', () => {
    expect(collectionPanelAllowed('caught')).toBe(false)
    expect(collectionPanelAllowed('escaped')).toBe(false)
  })
})
