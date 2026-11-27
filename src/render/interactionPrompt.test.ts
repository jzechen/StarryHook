import { describe, expect, it, vi } from 'vitest'
import { PassivePrompt, passiveBoxSize, promptBoxSize, PROMPT_GAP, PROMPT_KEY_W } from './interactionPrompt'

vi.mock('pixi.js', async (importOriginal) => {
  const pixi = await importOriginal<typeof import('pixi.js')>()
  // 桩只替代「画字」能力(测试环境无 canvas;沿 worldScene.test.ts 先例)
  class StubText extends pixi.Container {
    anchor = { set: () => {} }
  }
  return { ...pixi, Text: StubText }
})

/**
 * 浮签盒几何(接缝:promptBoxSize,票 #36 spec §2.1「像素浮签」):
 * 深底圆角小框 + E 键帽 + 动作短词;尺寸 = 键帽 + 词宽 + 内边距,
 * 全部落在 12px 像素字体网格上(期望值为独立字面量,钉死布局契约)。
 */
describe('浮签盒几何(接缝:promptBoxSize)', () => {
  it('两字短词(抛竿/商店):50×20(键帽 12 + 词 2×12 + 两侧内边 5×2 + 竖向内边 4×2)', () => {
    expect(promptBoxSize('抛竿')).toEqual({ width: 50, height: 20 })
    expect(promptBoxSize('商店')).toEqual({ width: 50, height: 20 })
  })

  it('字数决定宽度:查看/开启同宽,词变长盒变宽(后续票扩短词表不改布局)', () => {
    expect(promptBoxSize('查看')).toEqual({ width: 50, height: 20 })
    expect(promptBoxSize('查看'.repeat(2)).width).toBe(50 + 24)
  })

  it('几何全为正整数:画布内绘制取整像素的前提', () => {
    const { width, height } = promptBoxSize('抛竿')
    expect(Number.isInteger(width)).toBe(true)
    expect(Number.isInteger(height)).toBe(true)
  })
})

describe('被动浮签盒几何(票 #46 出口接近签:无键帽)', () => {
  it('「东 · 河谷 →」(8 字):106×20 = 两侧内边 5×2 + 8×12 + 竖向 4×2(无键帽段)', () => {
    expect(passiveBoxSize('东 · 河谷 →')).toEqual({ width: 106, height: 20 })
  })

  it('与主动浮签同高同族:宽 = 主动宽 − 键帽段(同网格,仅少键帽)', () => {
    expect(passiveBoxSize('抛竿').height).toBe(promptBoxSize('抛竿').height)
    expect(passiveBoxSize('抛竿').width).toBe(promptBoxSize('抛竿').width - PROMPT_KEY_W - PROMPT_GAP)
  })
})

describe('PassivePrompt(票 #46:出口接近签渲染,无键帽)', () => {
  it('showAt 显示、hide 隐藏;位置为整数像素(与主动浮签同悬停纪律)', () => {
    const prompt = new PassivePrompt()
    prompt.setLabel('东 · 河谷 →')
    prompt.showAt(888.4, 208.6, 1)
    expect(prompt.container.visible).toBe(true)
    expect(Number.isInteger(prompt.container.position.x)).toBe(true)
    expect(Number.isInteger(prompt.container.position.y)).toBe(true)
    prompt.hide()
    expect(prompt.container.visible).toBe(false)
  })

  it('重画不累积 Graphics 指令(clear → 重画稳态;同词重设不重画)', () => {
    const prompt = new PassivePrompt()
    prompt.setLabel('东 · 河谷 →')
    prompt.showAt(0, 0, 0)
    const bg = prompt.container.children[0] as unknown as { context: { instructions: unknown[] } }
    const drawCount = () => bg.context.instructions.length
    expect(drawCount()).toBeGreaterThan(0)
    const afterFirst = drawCount()
    for (let i = 0; i < 6; i++) {
      prompt.setLabel(i % 2 === 0 ? '东 · 河谷 →' : '西 · 村舍池塘 ←')
      prompt.showAt(0, 0, i * 0.016)
    }
    expect(drawCount()).toBe(afterFirst)
  })
})
