import { describe, expect, it, vi } from 'vitest'
import { PanelExclusion } from './panelExclusion'

/**
 * 接缝:面板互斥协调器(注册 + 打开通知,纯内存无 DOM)。
 * 期望值为 close 调用记录(替身面板),不重算实现内部状态。
 * 现行为契约(组合根双闭包逐项平移):任一面板打开即收起其余,不查打开状态、
 * 收起不回调;自动收起等面板内语义不进协调器。
 */

/** 替身面板:只记录 close 次数(协调器契约只需要「能收起」) */
function fakePanel() {
  return { close: vi.fn() }
}

describe('面板互斥协调器(接缝:注册 + 打开通知)', () => {
  it('任一面板打开:其余已注册面板全部收起,自身不动(三面板注册制,商店面板即插即用)', () => {
    const exclusion = new PanelExclusion()
    const water = fakePanel()
    const collection = fakePanel()
    const shop = fakePanel()
    exclusion.register(water)
    exclusion.register(collection)
    exclusion.register(shop)

    exclusion.notifyOpened(collection)

    expect(water.close).toHaveBeenCalledTimes(1)
    expect(shop.close).toHaveBeenCalledTimes(1)
    expect(collection.close).not.toHaveBeenCalled()
  })

  it('互斥对称且与注册顺序无关:A 开收其余,B 开也收其余', () => {
    const exclusion = new PanelExclusion()
    const a = fakePanel()
    const b = fakePanel()
    exclusion.register(b)
    exclusion.register(a)

    exclusion.notifyOpened(a)
    expect(b.close).toHaveBeenCalledTimes(1)
    expect(a.close).not.toHaveBeenCalled()

    exclusion.notifyOpened(b)
    expect(a.close).toHaveBeenCalledTimes(1)
    // b 自身打开不收自己:close 仍只有第一步(A 开时被收)那一次,未新增
    expect(b.close).toHaveBeenCalledTimes(1)
  })

  it('每次打开通知都收其余,不查打开状态:对已收起面板重复收起无害(与现组合根行为一致)', () => {
    const exclusion = new PanelExclusion()
    const a = fakePanel()
    const b = fakePanel()
    exclusion.register(a)
    exclusion.register(b)

    exclusion.notifyOpened(a)
    exclusion.notifyOpened(a)
    expect(b.close).toHaveBeenCalledTimes(2)
  })
})
