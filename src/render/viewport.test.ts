import { describe, expect, it } from 'vitest'
import { computeViewportFit, LOGICAL_HEIGHT, LOGICAL_WIDTH } from './viewport'

describe('视口信箱 fit(接缝:纯函数)', () => {
  /** 期望值全部为独立字面量(手算/独立推得),不与实现共用公式 */
  const CASES: {
    name: string
    win: [number, number]
    scale: number
    offset: [number, number]
    size: [number, number]
  }[] = [
    { name: '标准 16:9 窗口 960×540:整数 2x 满铺,无信箱留边', win: [960, 540], scale: 2, offset: [0, 0], size: [960, 540] },
    { name: '宽窗 1920×540:倍数受短边钳制 2x,左右各留 480', win: [1920, 540], scale: 2, offset: [480, 0], size: [960, 540] },
    { name: '21:9 超宽屏 2560×1080:4x,左右各留 320', win: [2560, 1080], scale: 4, offset: [320, 0], size: [1920, 1080] },
    { name: '竖窗 540×960:倍数受宽度钳制 1x,四周留边', win: [540, 960], scale: 1, offset: [30, 345], size: [480, 270] },
    { name: '16:10 非整除窗 1280×800:2x,上下各留 130', win: [1280, 800], scale: 2, offset: [160, 130], size: [960, 540] },
    { name: '差一个像素到 2x 的 959×539:退回 1x,留边取整', win: [959, 539], scale: 1, offset: [239, 134], size: [480, 270] },
    { name: '恰好等于逻辑分辨率 480×270:1x 满铺', win: [480, 270], scale: 1, offset: [0, 0], size: [480, 270] },
    { name: '超大 4K 窗 3840×2160:8x 满铺', win: [3840, 2160], scale: 8, offset: [0, 0], size: [3840, 2160] },
    { name: '小于逻辑分辨率 320×200:降级钳 1x,居中负偏移(溢出裁切)', win: [320, 200], scale: 1, offset: [-80, -35], size: [480, 270] },
  ]

  for (const c of CASES) {
    it(c.name, () => {
      const fit = computeViewportFit(c.win[0], c.win[1], LOGICAL_WIDTH, LOGICAL_HEIGHT)
      expect(fit.scale).toBe(c.scale)
      expect(fit.offsetX).toBe(c.offset[0])
      expect(fit.offsetY).toBe(c.offset[1])
      expect(fit.width).toBe(c.size[0])
      expect(fit.height).toBe(c.size[1])
    })
  }

  it('极端小窗 1×1 不崩,仍钳 1x 且偏移取整', () => {
    const fit = computeViewportFit(1, 1, LOGICAL_WIDTH, LOGICAL_HEIGHT)
    expect(fit.scale).toBe(1)
    expect(fit.offsetX).toBe(-240)
    expect(fit.offsetY).toBe(-135)
    expect(fit.width).toBe(480)
    expect(fit.height).toBe(270)
  })

  it('降级红线:任意奇形怪状的窗口,倍数恒为 >=1 的整数(永不拉伸)', () => {
    for (const [w, h] of [
      [0, 0], [7, 13], [100, 1000], [3000, 300], [639, 359], [479, 269], [1440, 899], [240, 135],
    ]) {
      const fit = computeViewportFit(w, h, LOGICAL_WIDTH, LOGICAL_HEIGHT)
      expect(Number.isInteger(fit.scale)).toBe(true)
      expect(fit.scale).toBeGreaterThanOrEqual(1)
      expect(Number.isInteger(fit.offsetX)).toBe(true)
      expect(Number.isInteger(fit.offsetY)).toBe(true)
    }
  })
})
