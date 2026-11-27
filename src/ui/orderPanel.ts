import type { BackpackStore } from '../core/backpack'
import type { CoreLoop } from '../core/coreLoop'
import { FISH } from '../core/fishCatalog'
import {
  orderReward,
  qualifyingCount,
  type OrderBoardStore,
  type OrderDef,
} from '../core/orderBoard'
import { qualityLabel } from './qualityLabel'
import { PanelExclusion } from './panelExclusion'
import { orderPanelAllowed } from './orderPanelPolicy'
import type { OrderDeliverOutcome } from './economyWiring'

/** 交付反馈的停留时长(行内提示自动消失;关闭面板立即清除;沿商店口径) */
const FEEDBACK_MS = 3000

/** 品质门槛文案(订单行名称缀与拒绝文案单源):普通不注星,星档「×以上」 */
function thresholdLabel(minQuality: OrderDef['minQuality']): string {
  const mark = qualityLabel(minQuality)
  return mark ? `${mark}以上` : ''
}

/**
 * 公告板面板(票 #55,spec 内容扩充「公告板与订单」):查看当前订单与交付。
 * 开面板的唯一入口 = 河谷公告板交互点(走近按动作键,组合根经 open() 打开);
 * 只读消费 OrderBoardStore(当前订单)与 BackpackStore(达标持有进度),交付
 * 动作经组合根注入的回调接线(deliverOrderOutcome:扣背包渔获 + 酬金入钱包 +
 * 出新单一体;面板只管展示与反馈,与商店「写操作全走回调」同纪律)。
 * 开关策略见 orderPanelAllowed——仅待机可开,打开时核心循环照常推进;
 * 经 PanelExclusion 自注册,与图鉴/商店/模式/背包/储物箱面板互斥。
 * 关闭口径(spec §2.4):关闭钮 + ESC + 再按动作键(组合根按意图策略收起)。
 * 订单行常驻面板、捕获与交付后即时刷新(签名守卫,变化才写 DOM;交付成功
 * 面板内直接显示新单——队列制同时仅一单);渔获不足 / 品质不足给行内明确
 * 拒绝(分列,不用 alert)。
 */
export class OrderPanel {
  private panelEl: HTMLElement
  private closeBtn: HTMLButtonElement
  private bodyEl: HTMLElement
  private feedbackEl: HTMLElement
  private opened = false
  private allowed = true
  /** 最近一次渲染的内容签名(当前订单 × 达标持有);null = 尚未写过,首刷必建行 */
  private renderedSignature: string | null = null
  private feedbackTimer: number | null = null

  constructor(
    // 只读消费:公告板当前订单(交付动作走回调,面板不写板)
    private board: OrderBoardStore,
    // 只读消费:背包堆叠(「持有 x/n」达标进度)
    private backpack: BackpackStore,
    // 交付回调:组合根接线 deliverOrderOutcome(校验 + 扣包 + 酬金 + 出新单一体)
    private onDeliver: () => OrderDeliverOutcome,
    // 面板互斥协调器:构造时自注册,打开时经它收起其余面板
    private exclusion?: PanelExclusion,
  ) {
    this.exclusion?.register(this)
    this.panelEl = document.getElementById('order-panel')!
    this.closeBtn = document.getElementById('order-close') as HTMLButtonElement
    this.bodyEl = document.getElementById('order-body')!
    this.feedbackEl = document.getElementById('order-feedback')!

    this.closeBtn.addEventListener('click', () => {
      this.setOpen(false)
      this.closeBtn.blur()
    })
  }

  /**
   * 世界交互开面板(公告板动作,票 #55):组合根在动作键按下边沿、公告板为
   * 最近交互点时调用。可用性策略与商店同一份口径(orderPanelAllowed,仅待机):
   * 非待机时打开请求被忽略,面板保持原状。
   */
  open(): void {
    if (this.allowed) this.setOpen(true)
  }

  /** 是否打开(组合根动作键意图/ESC 关面板用;互斥协调器之外只读) */
  isOpen(): boolean {
    return this.opened
  }

  /** 每帧调用:同步可用性、离开待机自动收起、打开时刷新订单行(变化才写 DOM) */
  update(core: CoreLoop): void {
    this.allowed = orderPanelAllowed(core.phase)
    if (this.opened && !this.allowed) this.setOpen(false)
    if (this.opened) this.refresh()
  }

  /** 供互斥协调器收起(其余面板打开时;对已收起面板幂等) */
  close(): void {
    this.setOpen(false)
  }

  private setOpen(open: boolean): void {
    this.opened = open
    this.panelEl.hidden = !open
    if (!open) this.hideFeedback()
    else this.exclusion?.notifyOpened(this)
  }

  /** 某鱼种的背包堆叠(三品质余量;交付校验与达标进度共用同一读数) */
  private countsFor(fishId: string): Record<'normal' | 'silver' | 'gold', number> {
    return {
      normal: this.backpack.count(fishId, 'normal'),
      silver: this.backpack.count(fishId, 'silver'),
      gold: this.backpack.count(fishId, 'gold'),
    }
  }

  /** 订单行内容签名:订单三元组 × 达标持有量(捕获/交付都会变,变化才重建) */
  private signature(): string {
    const order = this.board.current()
    return `${order.fishId}|${order.minQuality}|${order.count}|${qualifyingCount(order, this.countsFor(order.fishId))}`
  }

  private refresh(): void {
    const signature = this.signature()
    if (signature === this.renderedSignature) return
    this.renderedSignature = signature
    const order = this.board.current()
    const fish = FISH.find(f => f.id === order.fishId)
    if (!fish) return // 池表校验已挡,防御性跳过(目录外鱼种不渲染)
    this.bodyEl.replaceChildren()
    this.bodyEl.appendChild(this.buildOrderRow(order, fish.name))
  }

  /** 组订单行:名称(星档门槛缀后)+ 数量/酬金/持有(右对齐)+ 交付钮 */
  private buildOrderRow(order: OrderDef, fishName: string): HTMLElement {
    const threshold = thresholdLabel(order.minQuality)
    const label = threshold ? `${fishName}·${threshold}` : fishName
    const owned = qualifyingCount(order, this.countsFor(order.fishId))
    const reward = orderReward(FISH.find(f => f.id === order.fishId)!.score, order.count)
    const root = document.createElement('div')
    root.className = 'shop-item'
    const nameEl = document.createElement('span')
    nameEl.className = 'shop-name'
    nameEl.textContent = label
    const detailEl = document.createElement('span')
    detailEl.className = 'shop-detail'
    detailEl.textContent = `×${order.count} · 酬金 ${reward} 金币 · 持有 ${owned}/${order.count}`
    const deliverBtn = document.createElement('button')
    deliverBtn.type = 'button'
    deliverBtn.className = 'pill shop-buy'
    deliverBtn.textContent = '交付'
    deliverBtn.addEventListener('click', () => {
      this.reportDeliver(this.onDeliver(), order, fishName)
      deliverBtn.blur()
    })
    root.append(nameEl, detailEl, deliverBtn)
    return root
  }

  /** 交付结果 → 行内提示:成功给酬金到账(面板随签名刷新显示新单),拒绝分列原因 */
  private reportDeliver(outcome: OrderDeliverOutcome, order: OrderDef, fishName: string): void {
    if (outcome === 'ok') {
      const fish = FISH.find(f => f.id === order.fishId)!
      this.showFeedback(`已交付「${fishName}」×${order.count},酬金 +${orderReward(fish.score, order.count)} 金币`)
    } else if (outcome === 'missing') {
      const owned = qualifyingCount(order, this.countsFor(order.fishId))
      this.showFeedback(`渔获不足:「${fishName}」还差 ${order.count - owned} 条`)
    } else {
      this.showFeedback(`品质不足:「${fishName}」需要${thresholdLabel(order.minQuality)}`)
    }
  }

  private showFeedback(text: string): void {
    this.feedbackEl.textContent = text
    this.feedbackEl.hidden = false
    if (this.feedbackTimer !== null) clearTimeout(this.feedbackTimer)
    this.feedbackTimer = window.setTimeout(() => {
      this.feedbackTimer = null
      this.feedbackEl.hidden = true
    }, FEEDBACK_MS)
  }

  private hideFeedback(): void {
    if (this.feedbackTimer !== null) {
      clearTimeout(this.feedbackTimer)
      this.feedbackTimer = null
    }
    this.feedbackEl.hidden = true
  }
}
