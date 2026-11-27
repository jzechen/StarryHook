import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BackpackStore } from '../core/backpack'
import { CoreLoop } from '../core/coreLoop'
import { FISH } from '../core/fishCatalog'
import { ProgressionStore } from '../core/progression'
import { Rng } from '../core/rng'
import { memoryStorage } from '../testing/memoryStorage'
import { WalletStore } from '../core/wallet'
import { ShopPanel } from './shopPanel'

/**
 * 商店面板渔获区块(票 #39,review 修复):关面板期间捕获入包后重开商店,
 * 渔获列表必须随背包堆叠重建——即使钱包/竿签名未变(refresh 的余额/库存/竿
 * 守卫不得拦下渔获区块自持签名的刷新,捕获自票 #39 起不再动金币/饵/竿)。
 *
 * 测试环境为 node(无 DOM):面板只消费 getElementById / createElement 的
 * 极小子集(className/textContent/hidden/children/append 系),以最小桩替身
 * 承接(沿 worldDirector.test.ts 的桩替换哲学;行为断言全部走公开缝:
 * open/close/update 与区块 DOM 的可见结果)。
 */

/** 面板用到的最小元素子集:children 收容 + 文本/显隐写回 */
class StubElement {
  readonly children: StubElement[] = []
  hidden = false
  textContent = ''
  className = ''
  type = ''
  addEventListener(): void {}
  blur(): void {}
  append(...els: StubElement[]): void {
    this.children.push(...els)
  }
  appendChild(el: StubElement): StubElement {
    this.children.push(el)
    return el
  }
  replaceChildren(): void {
    this.children.length = 0
  }
}

let byId: Map<string, StubElement>

beforeEach(() => {
  byId = new Map()
  const node = (): StubElement => new StubElement()
  vi.stubGlobal('document', {
    getElementById: (id: string): StubElement => {
      let el = byId.get(id)
      if (!el) {
        el = node()
        byId.set(id, el)
      }
      return el
    },
    createElement: (): StubElement => node(),
  })
})

/** 建面板(回调全为桩:本组用例只驱动展示缝,不点购买/卖出) */
function makePanel(): { panel: ShopPanel; backpack: BackpackStore } {
  const backpack = new BackpackStore(FISH.map(f => f.id))
  const panel = new ShopPanel(
    new WalletStore(memoryStorage()),
    new ProgressionStore(memoryStorage()),
    () => 'ok',
    () => 'ok',
    () => {},
    backpack,
    () => 'ok',
  )
  return { panel, backpack }
}

describe('ShopPanel:渔获区块(关面板期间的捕获,重开即随堆叠重建)', () => {
  it('关闭面板期间捕获入包 → 重开后渔获列表随签名重建(钱包/竿签名不变也刷新)', () => {
    const { panel, backpack } = makePanel()
    const core = new CoreLoop(new Rng(1))
    panel.open()
    panel.update(core)

    const catchList = byId.get('shop-catch-list')!
    const catchEmpty = byId.get('shop-catch-empty')!
    expect(catchList.children).toHaveLength(0) // 空包:占位提示常驻
    expect(catchEmpty.hidden).toBe(false)

    // 关面板 → 捕获两条(同堆叠)→ 重开;全程不动金币/饵/竿(renderSignature 冻结)
    panel.close()
    backpack.addFish('xiaobaitiao', 'silver')
    backpack.addFish('xiaobaitiao', 'silver')
    panel.open()
    panel.update(core)

    expect(catchList.children).toHaveLength(1) // 渔获行按堆叠重建
    expect(catchEmpty.hidden).toBe(true) // 空包占位退场
  })
})
