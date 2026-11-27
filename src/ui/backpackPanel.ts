import type { BackpackEntry, BackpackStore, CollectibleEntry } from '../core/backpack'
import type { CoreLoop } from '../core/coreLoop'
import { collectibleName } from '../core/collectibles'
import { FISH } from '../core/fishCatalog'
import { backpackPanelAllowed } from './backpackPanelPolicy'
import { PanelExclusion } from './panelExclusion'
import { qualityLabel } from './qualityLabel'

/**
 * 背包面板(票 #40,spec §4.4):随身物品总览 = 渔获区 + 收藏品区。
 * 渔获按(鱼种 × 品质)堆叠展示(银/金星标缀在鱼名后,与商店渔获区块同款);
 * 收藏品无品质维(空区占位,内容表由票 #41 填充)。鱼饵不进包(余量走
 * 钱包/顶栏徽章,spec §4.4),本面板只读消费背包堆叠——售卖在商店摊位、
 * 存取在储物箱,写操作不经此处。
 * 入口 = 顶栏「背包」pill,无快捷键(spec §2.4);开关策略见
 * backpackPanelAllowed(与图鉴同口径:待机/蓄力/等待可开);
 * 经 PanelExclusion 自注册与图鉴/商店/模式/储物箱面板互斥,打开锁移动
 * (组合根面板打开即清方向分量);关闭口径 = 关闭钮 + ESC + 再按动作键。
 * 打开时核心循环照常推进;堆叠变化才重建行(签名守卫,与商店渔获区块同思路)。
 */
export class BackpackPanel {
  private entryBtn: HTMLButtonElement
  private panelEl: HTMLElement
  private closeBtn: HTMLButtonElement
  /** 渔获区与收藏品区:行容器 + 空区占位 */
  private catchListEl: HTMLElement
  private catchEmptyEl: HTMLElement
  private collectibleListEl: HTMLElement
  private collectibleEmptyEl: HTMLElement
  private opened = false
  private allowed = true
  /** 渔获堆叠签名(随捕获/卖鱼/存取增减);null = 尚未写过,首刷必建行(空区占位也如此) */
  private fishSignature: string | null = null
  /** 收藏品堆叠签名;null = 尚未写过,首刷必建行 */
  private collectibleSignature: string | null = null

  constructor(
    // 只读消费背包堆叠(渔获 + 收藏品两分区)
    private backpack: BackpackStore,
    // 面板互斥协调器:构造时自注册,打开时经它收起其余面板
    private exclusion?: PanelExclusion,
  ) {
    this.exclusion?.register(this)
    this.entryBtn = document.getElementById('backpack-entry') as HTMLButtonElement
    this.panelEl = document.getElementById('backpack-panel')!
    this.closeBtn = document.getElementById('backpack-close') as HTMLButtonElement
    this.catchListEl = document.getElementById('backpack-catch-list')!
    this.catchEmptyEl = document.getElementById('backpack-catch-empty')!
    this.collectibleListEl = document.getElementById('backpack-collectible-list')!
    this.collectibleEmptyEl = document.getElementById('backpack-collectible-empty')!

    this.entryBtn.addEventListener('click', () => {
      if (this.allowed) this.setOpen(!this.opened)
      // 移除按钮焦点,避免之后按空格误触开关(与既有面板入口同理由)
      ;(document.activeElement as HTMLElement | null)?.blur()
    })
    this.closeBtn.addEventListener('click', () => {
      this.setOpen(false)
      this.closeBtn.blur()
    })
  }

  /** 是否打开(组合根动作键意图/ESC 关面板用) */
  isOpen(): boolean {
    return this.opened
  }

  /** 供互斥协调器收起(其余面板打开时;对已收起面板幂等) */
  close(): void {
    this.setOpen(false)
  }

  /** 每帧调用:同步入口可用性、禁用阶段自动收起、打开时刷新两分区(变化才写 DOM) */
  update(core: CoreLoop): void {
    this.allowed = backpackPanelAllowed(core.phase)
    this.entryBtn.disabled = !this.allowed
    if (this.opened && !this.allowed) this.setOpen(false)
    if (this.opened) this.refresh()
  }

  private setOpen(open: boolean): void {
    this.opened = open
    this.panelEl.hidden = !open
    // 打开时通知协调器收起其余面板;收起不通知(协调器只认打开,互斥不递归)
    if (open) this.exclusion?.notifyOpened(this)
  }

  private refresh(): void {
    // 渔获区:堆叠随捕获/卖出/存取增减,签名变化才重建
    const entries = this.backpack.entries()
    const fishSignature = entries.map(e => `${e.fishId}:${e.quality}:${e.count}`).join('|')
    if (fishSignature !== this.fishSignature) {
      this.fishSignature = fishSignature
      this.catchListEl.replaceChildren()
      this.catchEmptyEl.hidden = entries.length > 0
      for (const entry of entries) {
        const fish = FISH.find(f => f.id === entry.fishId)
        if (!fish) continue // 目录外堆叠不渲染(store 已过滤,防御性跳过)
        this.catchListEl.appendChild(buildRow(fishLabel(fish.name, entry.quality), countLabel(entry.count)))
      }
    }
    // 收藏品区(票 #41 填充内容表,本票空区占位)
    const collectibles = this.backpack.collectibleEntries()
    const collectibleSignature = collectibles.map(e => `${e.id}:${e.count}`).join('|')
    if (collectibleSignature !== this.collectibleSignature) {
      this.collectibleSignature = collectibleSignature
      this.collectibleListEl.replaceChildren()
      this.collectibleEmptyEl.hidden = collectibles.length > 0
      for (const entry of collectibles) {
        const name = collectibleName(entry.id)
        if (!name) continue // 目录外收藏品不渲染(store 已过滤,防御性跳过)
        this.collectibleListEl.appendChild(buildRow(name, collectibleCountLabel(entry.count)))
      }
    }
  }
}

/** 渔获行文案:鱼名 + 银/金星标(普通不注星,与商店渔获区块同款) */
function fishLabel(name: string, quality: BackpackEntry['quality']): string {
  const mark = qualityLabel(quality)
  return mark ? `${name}·${mark}` : name
}

/** 堆叠数量文案(×n;n=1 省略,与图鉴/商店同款克制) */
function countLabel(count: number): string {
  return count > 1 ? `×${count}` : ''
}

/** 收藏品数量文案:多件 ×n,单件注「观赏」(仅观赏,spec §4.4) */
function collectibleCountLabel(count: CollectibleEntry['count']): string {
  return count > 1 ? `×${count}` : '观赏'
}

/** 组一行:名称 + 详情(右对齐);行样式与商店/面板族同款(.shop-item 同族) */
function buildRow(name: string, detail: string): HTMLElement {
  const root = document.createElement('div')
  root.className = 'shop-item'
  const nameEl = document.createElement('span')
  nameEl.className = 'shop-name'
  nameEl.textContent = name
  const detailEl = document.createElement('span')
  detailEl.className = 'shop-detail'
  detailEl.textContent = detail
  root.append(nameEl, detailEl)
  return root
}
