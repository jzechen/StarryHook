import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BackpackStore } from '../core/backpack'
import { CoreLoop } from '../core/coreLoop'
import { FISH } from '../core/fishCatalog'
import { ORDERS_KEY, OrderBoardStore, orderReward } from '../core/orderBoard'
import { Rng } from '../core/rng'
import type { FishQuality } from '../core/types'
import { WalletStore } from '../core/wallet'
import { memoryStorage } from '../testing/memoryStorage'
import { deliverOrderOutcome } from './economyWiring'
import { OrderPanel } from './orderPanel'
import { PanelExclusion } from './panelExclusion'

const DT = 1 / 60
const HOLD = { holding: true, moveX: 0, moveY: 0 }

/**
 * 公告板面板(票 #55):查看订单、交付(扣背包渔获、酬金入钱包)、出新单。
 * 全链走真实 store 与真实接线(deliverOrderOutcome)——面板缝的行为断言
 * 即组合层集成(组合根以同一形态注入;shopPanel.test 的展示缝先例 + 桩
 * 点击承接)。测试环境为 node(无 DOM):最小元素替身沿 shopPanel.test,
 * 额外支持 addEventListener 捕获 + click() 驱动交付钮。
 */

/** 面板用到的最小元素子集:children 收容 + 文本/显隐写回 + 点击捕获 */
class StubElement {
  readonly children: StubElement[] = []
  hidden = false
  textContent = ''
  className = ''
  type = ''
  private handlers: Record<string, (() => void)[]> = {}
  addEventListener(event: string, handler: () => void): void {
        ;(this.handlers[event] ??= []).push(handler)
  }
  click(): void {
    for (const handler of this.handlers['click'] ?? []) handler()
  }
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
  vi.stubGlobal('document', {
    getElementById: (id: string): StubElement => {
      let el = byId.get(id)
      if (!el) {
        el = new StubElement()
        byId.set(id, el)
      }
      return el
    },
    createElement: (): StubElement => new StubElement(),
  })
  // 行内反馈的自动消失定时器:node 环境无 window,桩成不触发的句柄
  vi.stubGlobal('window', { setTimeout: (): number => 1, clearTimeout: (): void => {} })
})

/** 公告板当前订单 = 快照直写(不依赖池表抽签顺序,测试钉死已知一单) */
function boardWithOrder(order: { fishId: string; minQuality: FishQuality; count: number }): {
  board: OrderBoardStore
  storage: ReturnType<typeof memoryStorage>
} {
  const storage = memoryStorage()
  storage.set(ORDERS_KEY, JSON.stringify({ current: order }))
  return { board: new OrderBoardStore(new Rng(1), { storage, key: ORDERS_KEY }), storage }
}

/** 组真实全链面板(公告板 + 背包 + 钱包 + deliverOrderOutcome 接线) */
function makePanel(order: { fishId: string; minQuality: FishQuality; count: number }): {
  panel: OrderPanel
  board: OrderBoardStore
  backpack: BackpackStore
  wallet: WalletStore
  core: CoreLoop
} {
  const { board } = boardWithOrder(order)
  const wallet = new WalletStore(memoryStorage())
  const backpack = new BackpackStore(FISH.map(f => f.id))
  const core = new CoreLoop(new Rng(1))
  const panel = new OrderPanel(board, backpack, deliverOrderOutcome(board, backpack, wallet))
  return { panel, board, backpack, wallet, core }
}

/** 面板内容行(唯一一单):root(.shop-item)下的名称/详情/交付钮 */
function rowOf(panel: OrderPanel): StubElement {
  panel.open()
  panel.update(new CoreLoop(new Rng(1)))
  const body = byId.get('order-body')!
  expect(body.children).toHaveLength(1)
  return body.children[0]!
}

describe('OrderPanel:查看订单(接缝:refresh 签名守卫)', () => {
  it('打开即显示当前订单:鱼名 + 品质门槛 + 数量 + 酬金 + 持有进度', () => {
    const { panel, backpack } = makePanel({ fishId: 'xiaobaitiao', minQuality: 'silver', count: 3 })
    backpack.addFish('xiaobaitiao', 'silver', 1)
    const row = rowOf(panel)
    expect(row.children[0]!.textContent).toBe('小白条·银星以上')
    expect(row.children[2]!.textContent).toBe('×3 · 酬金 45 金币 · 持有 1/3')
  })

  it('普通门槛不注星:名称就是鱼名(普通即可,无星标噪音)', () => {
    const { panel } = makePanel({ fishId: 'wenzhongji', minQuality: 'normal', count: 4 })
    const row = rowOf(panel)
    expect(row.children[0]!.textContent).toBe('稳重鲫')
    expect(row.children[2]!.textContent).toBe('×4 · 酬金 90 金币 · 持有 0/4')
  })

  it('签名未变不重建行(每帧刷新零 DOM 写入);订单或持有变化才重建', () => {
    const { panel, backpack } = makePanel({ fishId: 'xiaobaitiao', minQuality: 'normal', count: 2 })
    panel.open()
    const core = new CoreLoop(new Rng(1))
    panel.update(core)
    const body = byId.get('order-body')!
    const first = body.children[0]!
    panel.update(core)
    expect(body.children[0]).toBe(first) // 同一元素对象 = 未重建
    backpack.addFish('xiaobaitiao', 'normal', 1)
    panel.update(core)
    expect(body.children[0]!.children[2]!.textContent).toContain('持有 1/2')
    expect(body.children[0]).not.toBe(first)
  })
})

describe('OrderPanel:交付(接缝:交付钮 → deliverOrderOutcome → 行内反馈)', () => {
  it('交付成功:行内确认(酬金到账),面板随即显示新单(出新单)', () => {
    const { panel, board, backpack, wallet } = makePanel({ fishId: 'xiaobaitiao', minQuality: 'silver', count: 3 })
    backpack.addFish('xiaobaitiao', 'silver', 3)
    const row = rowOf(panel)
    const deliverBtn = row.children[1] as StubElement
    deliverBtn.click()
    expect(wallet.coins()).toBe(orderReward(10, 3)) // 45
    expect(backpack.count('xiaobaitiao', 'silver')).toBe(0)
    expect(board.current()).not.toEqual({ fishId: 'xiaobaitiao', minQuality: 'silver', count: 3 })
    // 行内反馈 + 新单一帧内可见
    const feedback = byId.get('order-feedback')!
    expect(feedback.hidden).toBe(false)
    expect(feedback.textContent).toContain('+45 金币')
    panel.update(new CoreLoop(new Rng(1)))
    expect(byId.get('order-body')!.children[0]!.children[0]!.textContent).not.toContain('小白条·银星以上')
  })

  it('缺鱼拒绝(missing):行内文案明示还差几条,订单原样', () => {
    const order = { fishId: 'qiqiuHetun', minQuality: 'normal' as const, count: 3 }
    const { panel, board, backpack, wallet } = makePanel(order)
    backpack.addFish('qiqiuHetun', 'normal', 1)
    const row = rowOf(panel)
    ;(row.children[1] as StubElement).click()
    expect(wallet.coins()).toBe(0)
    expect(backpack.count('qiqiuHetun', 'normal')).toBe(1)
    expect(board.current()).toEqual(order)
    expect(byId.get('order-feedback')!.textContent).toBe('渔获不足:「气球河豚」还差 2 条')
  })

  it('品质不足拒绝(quality 分列):不扣包、不入账、不换单', () => {
    const order = { fishId: 'wenzhongji', minQuality: 'silver' as const, count: 2 }
    const { panel, board, backpack, wallet } = makePanel(order)
    backpack.addFish('wenzhongji', 'normal', 10)
    const row = rowOf(panel)
    ;(row.children[1] as StubElement).click()
    expect(wallet.coins()).toBe(0)
    expect(backpack.count('wenzhongji', 'normal')).toBe(10)
    expect(board.current()).toEqual(order)
    expect(byId.get('order-feedback')!.textContent).toBe('品质不足:「稳重鲫」需要银星以上')
  })
})

describe('OrderPanel:开关口径(互斥/自动收起/关闭)', () => {
  it('经 PanelExclusion 互斥:公告板打开即收起其余面板', () => {
    const exclusion = new PanelExclusion()
    const other = { close: vi.fn() }
    exclusion.register(other)
    const { board } = boardWithOrder({ fishId: 'xiaobaitiao', minQuality: 'normal', count: 2 })
    const panel = new OrderPanel(
      board,
      new BackpackStore(FISH.map(f => f.id)),
      deliverOrderOutcome(board, new BackpackStore(FISH.map(f => f.id)), new WalletStore(memoryStorage())),
      exclusion,
    )
    panel.open()
    expect(panel.isOpen()).toBe(true)
    expect(other.close).toHaveBeenCalled()
  })

  it('离开待机自动收起(垂钓中不开公告板);垂钓中打开请求被忽略', () => {
    const { panel, core } = makePanel({ fishId: 'xiaobaitiao', minQuality: 'normal', count: 2 })
    core.setInteractionSource(() => ({ kind: 'spot' })) // 钓位范围内(可蓄力)
    panel.open()
    expect(panel.isOpen()).toBe(true)
    core.update(DT, HOLD) // 蓄力(进入 charging)
    panel.update(core)
    expect(panel.isOpen()).toBe(false)
    panel.open()
    expect(panel.isOpen()).toBe(false)
  })

  it('关闭口径:关闭钮收起面板', () => {
    const { panel } = makePanel({ fishId: 'xiaobaitiao', minQuality: 'normal', count: 2 })
    panel.open()
    byId.get('order-close')!.click()
    expect(panel.isOpen()).toBe(false)
  })
})
