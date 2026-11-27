import { describe, expect, it } from 'vitest'
import { promptBoxSize } from './interactionPrompt'

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
