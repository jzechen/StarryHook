import { BAITS, RODS, type BaitDef } from '../config'
import type { CoreLoop } from '../core/coreLoop'
import type { ProgressionStore } from '../core/progression'
import type { WalletStore } from '../core/wallet'
import { PanelExclusion } from './panelExclusion'
import { shopPanelAllowed } from './shopPanelPolicy'

/**
 * 一次购买的语义结果(回调返回,面板据此给行内反馈):
 * ok = 成功;insufficient = 金币不足;meaningless = 无意义购买(重复购竿、初始竿、已有更高档)。
 */
export type ShopBuyOutcome = 'ok' | 'insufficient' | 'meaningless'

/** 购买反馈的停留时长(行内提示自动消失;关闭面板立即清除) */
const FEEDBACK_MS = 3000

/** 商店一行(竿或饵)的 DOM 句柄:详情文案与按钮由 refresh 按状态刷新,购买钮可为空(已拥有行) */
interface ShopRow {
  root: HTMLElement
  detailEl: HTMLElement
  buyBtn: HTMLButtonElement | null
  /** 装备钮(仅饵行):「有余量且未装备」时显示,点击经组合根回调装备 */
  equipBtn: HTMLButtonElement | null
}

/**
 * 商店面板(票 #20,spec #17 经济系统;票 #36 顶栏入口退役改世界交互):
 * 浏览并购买竿与鱼饵。开面板的唯一入口 = 世界商店摊位交互点(走近按动作键,
 * 组合根经 open() 打开);只读消费 WalletStore(金币余额/饵库存/装备槽)与
 * ProgressionStore(竿可用性/当前竿);购买与装备动作经组合根注入的回调接线到
 * wallet/progression 的既有公开方法(购竿跨钱袋+成长+绿条参数+顶栏刷新、
 * 购饵成功即自动装备、装备切换不清余量,协调归组合根;面板只管展示与反馈)。
 * 开关策略见 shopPanelPolicy——仅待机可开,打开时核心循环照常推进;
 * 经 PanelExclusion 自注册,与图鉴/模式面板互斥。
 * 关闭口径(spec §2.4):关闭钮 + ESC + 再按动作键(组合根按意图策略收起)。
 * 余额与饵余量常驻面板、购买后即时刷新(签名守卫,变化才写 DOM);
 * 不足/无意义购买给面板内行内提示(不用 alert);装备中的饵行尾注「装备中」。
 */
export class ShopPanel {
  private panelEl: HTMLElement
  private closeBtn: HTMLButtonElement
  private coinsEl: HTMLElement
  private feedbackEl: HTMLElement
  /** 竿三行(行序 = RODS 序)+ 饵两行(行序 = BAITS 序),建行一次、refresh 按状态刷新 */
  private rows: ShopRow[] = []
  private opened = false
  private allowed = true
  /** 最近一次渲染的内容签名(余额/库存/竿可用性/当前竿);变化才写 DOM,避免每帧刷新 */
  private renderedSignature = ''
  private feedbackTimer: number | null = null

  constructor(
    private wallet: WalletStore,
    private progression: ProgressionStore,
    // 购买回调:组合根接线(购竿 = 预检 → purchaseRod → spend → 换竿生效;购饵 = buyBait + 自动装备)
    private onBuyRod: (rodId: string) => ShopBuyOutcome,
    private onBuyBait: (baitId: string) => ShopBuyOutcome,
    // 装备回调:组合根接线 wallet.equip(装备槽一种,切换不清余量——既有语义)
    private onEquipBait: (baitId: string) => void,
    // 面板互斥协调器:构造时自注册,打开时经它收起其余面板(图鉴/模式)
    private exclusion?: PanelExclusion,
  ) {
    this.exclusion?.register(this)
    this.panelEl = document.getElementById('shop-panel')!
    this.closeBtn = document.getElementById('shop-close') as HTMLButtonElement
    this.coinsEl = document.getElementById('shop-coins')!
    this.feedbackEl = document.getElementById('shop-feedback')!
    const listEl = document.getElementById('shop-list')!

    // 竿三行:初始竿标「初始装备」(静态,永久不可购);其余行建购买钮,已拥有时隐藏
    for (const rod of RODS) {
      const row = this.buildRow(rod.name, rod.id === RODS[0]!.id ? '初始装备' : `${rod.price} 金币`)
      if (rod.id !== RODS[0]!.id) {
        const buyBtn = this.buildBuyBtn('购买', () => {
          this.report(this.onBuyRod(rod.id), `已购入并换用「${rod.name}」`, rod.name)
          buyBtn.blur()
        })
        row.root.appendChild(buyBtn)
        row.buyBtn = buyBtn
      }
      listEl.appendChild(row.root)
      this.rows.push(row)
    }
    // 饵两行(行序 = BAITS 序):香饵与浓饵均已上架(#19/#21),占位分支已随上架删除;
    // 详情 = 价格 + 单次竿数 + 库存(装备中的行尾注「装备中」,refresh 按钱包刷新)+
    // 装备钮(「有余量且未装备」时显示)+ 购买钮
    for (const bait of BAITS) {
      const row = this.buildRow(bait.name, this.baitDetail(bait))
      const equipBtn = this.buildBuyBtn('装备', () => {
        this.onEquipBait(bait.id)
        equipBtn.blur()
      })
      equipBtn.hidden = !this.equipVisible(bait)
      row.root.appendChild(equipBtn)
      row.equipBtn = equipBtn
      const buyBtn = this.buildBuyBtn('购买', () => {
        this.report(this.onBuyBait(bait.id), `已购入「${bait.name}」+${bait.charges} 竿`, bait.name)
        buyBtn.blur()
      })
      row.root.appendChild(buyBtn)
      row.buyBtn = buyBtn
      listEl.appendChild(row.root)
      this.rows.push(row)
    }

    // 金币余额初始文本由脚本写入(HTML 不硬编码 0,老玩家上线即真实余额)
    this.coinsEl.textContent = `${this.wallet.coins()} 金币`

    this.closeBtn.addEventListener('click', () => {
      this.setOpen(false)
      this.closeBtn.blur()
    })
  }

  /**
   * 世界交互开面板(票 #36,摊位动作):组合根在动作键按下边沿、摊位为
   * 最近交互点时调用。可用性策略与顶栏时代同一份(shopPanelAllowed,仅待机):
   * 非待机时打开请求被忽略(垂钓中不开店),面板保持原状。
   */
  open(): void {
    if (this.allowed) this.setOpen(true)
  }

  /** 是否打开(组合根动作键意图/ESC 关面板用;互斥协调器之外只读) */
  isOpen(): boolean {
    return this.opened
  }

  /** 每帧调用:同步可用性、离开待机自动收起、打开时刷新余额与各行(变化才写 DOM) */
  update(core: CoreLoop): void {
    this.allowed = shopPanelAllowed(core.phase)
    if (this.opened && !this.allowed) this.setOpen(false)
    if (this.opened) this.refresh()
  }

  /** 供互斥协调器收起(其余面板打开时;对已收起面板幂等) */
  close(): void {
    this.setOpen(false)
  }

  /** 饵行详情:价格 · 单次竿数 · 库存;装备中的行尾注「装备中」(refresh 随装备槽/库存刷新) */
  private baitDetail(bait: BaitDef): string {
    const equipped = this.wallet.equippedBait() === bait.id
    const suffix = equipped ? ' · 装备中' : ''
    return `${bait.price} 金币 · 单次 ${bait.charges} 竿 · 库存 ${this.wallet.baitCount(bait.id)}${suffix}`
  }

  /** 装备钮可见性:有余量且未装备(已购未装备可点装备;装备中与未拥有隐藏) */
  private equipVisible(bait: BaitDef): boolean {
    return this.wallet.equippedBait() !== bait.id && this.wallet.baitCount(bait.id) > 0
  }

  /** 组一行:名称 + 详情(右对齐),购买钮由调用方按需追加 */
  private buildRow(name: string, detail: string): ShopRow {
    const root = document.createElement('div')
    root.className = 'shop-item'
    const nameEl = document.createElement('span')
    nameEl.className = 'shop-name'
    nameEl.textContent = name
    const detailEl = document.createElement('span')
    detailEl.className = 'shop-detail'
    detailEl.textContent = detail
    root.append(nameEl, detailEl)
    return { root, detailEl, buyBtn: null, equipBtn: null }
  }

  /** 组购买钮:点击走组合根注入的回调,结果经 report 落成行内反馈 */
  private buildBuyBtn(label: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'pill shop-buy'
    btn.textContent = label
    btn.addEventListener('click', onClick)
    return btn
  }

  /** 购买结果 → 行内提示:成功给确认文案,不足/无意义给明确拒绝原因(不用 alert) */
  private report(outcome: ShopBuyOutcome, okText: string, itemName: string): void {
    if (outcome === 'ok') this.showFeedback(okText)
    else if (outcome === 'insufficient') this.showFeedback(`金币不足,买不起「${itemName}」`)
    else this.showFeedback(`无法购买「${itemName}」:已拥有或已有更高档`)
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

  private setOpen(open: boolean): void {
    this.opened = open
    this.panelEl.hidden = !open
    // 收起即清反馈(下次打开不留旧提示);打开时通知协调器收起其余面板,收起不通知
    if (!open) this.hideFeedback()
    else this.exclusion?.notifyOpened(this)
  }

  /** 内容签名:余额/饵库存/装备槽/竿可用性/当前竿任一变化才重写 DOM(与图鉴渲染守卫同思路) */
  private renderSignature(): string {
    const parts: string[] = [String(this.wallet.coins())]
    for (const bait of BAITS) parts.push(String(this.wallet.baitCount(bait.id)))
    parts.push(this.wallet.equippedBait() ?? '-')
    for (const rod of RODS) parts.push(this.progression.isRodUnlocked(rod.id) ? '1' : '0')
    parts.push(this.progression.rod().id)
    return parts.join('|')
  }

  private refresh(): void {
    const signature = this.renderSignature()
    if (signature === this.renderedSignature) return
    this.renderedSignature = signature
    this.coinsEl.textContent = `${this.wallet.coins()} 金币`
    // 竿行:已拥有(等级解锁 ∪ 已购)隐藏购买钮;可购钮按余额置灰(金币不足)
    for (let i = 0; i < RODS.length; i++) {
      const rod = RODS[i]!
      if (i === 0) continue // 初始竿「初始装备」为静态标注,建行时一次写入
      const row = this.rows[i]!
      const unlocked = this.progression.isRodUnlocked(rod.id)
      if (row.buyBtn) row.buyBtn.hidden = unlocked
      row.detailEl.textContent = unlocked ? '已拥有' : `${rod.price} 金币`
      if (row.buyBtn && !unlocked) row.buyBtn.disabled = this.wallet.coins() < rod.price
    }
    // 饵行:库存与「装备中」尾注随钱包刷新;装备钮按可见性谓词显隐
    for (let i = 0; i < BAITS.length; i++) {
      const bait = BAITS[i]!
      const row = this.rows[RODS.length + i]!
      row.detailEl.textContent = this.baitDetail(bait)
      if (row.equipBtn) row.equipBtn.hidden = !this.equipVisible(bait)
    }
  }
}
