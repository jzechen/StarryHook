import type { BackpackStore } from '../core/backpack'
import type { CoreLoop } from '../core/coreLoop'
import { collectibleName } from '../core/collectibles'
import { FISH } from '../core/fishCatalog'
import type { FishQuality } from '../core/types'
import { qualityLabel } from './qualityLabel'
import { PanelExclusion } from './panelExclusion'
import { storagePanelAllowed } from './storagePanelPolicy'
import type { TransferItem } from './storageWiring'

/**
 * 储物箱面板(票 #40,spec §4.4):村舍家中的仓库,两栏转移。
 * 左栏 = 背包、右栏 = 储物箱,点按行 = 该堆叠整堆转移到对侧(转移 = 源取出 +
 * 目标存入一体,接线见 storageWiring,组合根注入回调;面板只管展示与转发,
 * 与商店「写操作全走回调」同纪律)。渔获与收藏品皆可存、无腐坏、双方无容量
 * 上限(spec §4.4);收藏品仅观赏,转移不改变这一点。
 * 开面板的唯一入口 = 世界储物箱交互点(走近按动作键,组合根经 open() 打开);
 * 开关策略见 storagePanelAllowed(仅待机,与商店同口径),打开时核心循环照常
 * 推进;经 PanelExclusion 自注册与图鉴/商店/模式/背包面板互斥,打开锁移动;
 * 关闭口径(spec §2.4)= 关闭钮 + ESC + 再按动作键(组合根按意图策略收起)。
 * 两栏内容变化才重建行(签名守卫,与背包面板同思路);行内容按目录序渲染,
 * 空栏给占位提示。
 */
export class StoragePanel {
  private panelEl: HTMLElement
  private closeBtn: HTMLButtonElement
  /** 左栏(背包)与右栏(储物箱):行容器 + 空栏占位 */
  private backpackListEl: HTMLElement
  private backpackEmptyEl: HTMLElement
  private boxListEl: HTMLElement
  private boxEmptyEl: HTMLElement
  private opened = false
  private allowed = true
  /** 左栏内容签名(背包堆叠);null = 尚未写过,首刷必建行(空栏占位也如此) */
  private backpackSignature: string | null = null
  /** 右栏内容签名(储物箱堆叠);null = 尚未写过,首刷必建行 */
  private boxSignature: string | null = null

  constructor(
    // 左栏只读消费背包堆叠(渔获 + 收藏品)
    private backpack: BackpackStore,
    // 右栏只读消费储物箱堆叠(同一 store 形态,独立 kv 键)
    private box: BackpackStore,
    // 转移回调:组合根接线 transferBetween(点按 = 整堆转移,一体完成)
    private onTransferToStorage: (item: TransferItem) => void,
    private onTransferToBackpack: (item: TransferItem) => void,
    // 面板互斥协调器:构造时自注册,打开时经它收起其余面板
    private exclusion?: PanelExclusion,
  ) {
    this.exclusion?.register(this)
    this.panelEl = document.getElementById('storage-panel')!
    this.closeBtn = document.getElementById('storage-close') as HTMLButtonElement
    this.backpackListEl = document.getElementById('storage-backpack-list')!
    this.backpackEmptyEl = document.getElementById('storage-backpack-empty')!
    this.boxListEl = document.getElementById('storage-box-list')!
    this.boxEmptyEl = document.getElementById('storage-box-empty')!

    this.closeBtn.addEventListener('click', () => {
      this.setOpen(false)
      this.closeBtn.blur()
    })
  }

  /**
   * 世界交互开面板(储物箱动作,票 #40):组合根在动作键按下边沿、储物箱为
   * 最近交互点时调用。可用性策略与商店同一份口径(storagePanelAllowed,仅待机):
   * 非待机时打开请求被忽略,面板保持原状。
   */
  open(): void {
    if (this.allowed) this.setOpen(true)
  }

  /** 是否打开(组合根动作键意图/ESC 关面板用) */
  isOpen(): boolean {
    return this.opened
  }

  /** 供互斥协调器收起(其余面板打开时;对已收起面板幂等) */
  close(): void {
    this.setOpen(false)
  }

  /** 每帧调用:离开待机自动收起、打开时刷新两栏(变化才写 DOM) */
  update(core: CoreLoop): void {
    this.allowed = storagePanelAllowed(core.phase)
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
    // 左栏 = 背包(渔获堆叠在前、收藏品在后,点击存入储物箱)
    const backpackEntries = this.backpack.entries()
    const backpackCollectibles = this.backpack.collectibleEntries()
    const backpackSignature =
      signatureOf(backpackEntries, backpackCollectibles)
    if (backpackSignature !== this.backpackSignature) {
      this.backpackSignature = backpackSignature
      this.backpackListEl.replaceChildren()
      const total = backpackEntries.length + backpackCollectibles.length
      this.backpackEmptyEl.hidden = total > 0
      for (const entry of backpackEntries) {
        const fish = FISH.find(f => f.id === entry.fishId)
        if (!fish) continue // 目录外堆叠不渲染(store 已过滤,防御性跳过)
        this.backpackListEl.appendChild(
          buildMoveRow(labelOf(fish.name, entry.quality), countLabel(entry.count), () =>
            this.onTransferToStorage({ kind: 'fish', fishId: entry.fishId, quality: entry.quality }),
          ),
        )
      }
      for (const entry of backpackCollectibles) {
        const name = collectibleName(entry.id)
        if (!name) continue // 目录外收藏品不渲染(store 已过滤,防御性跳过)
        this.backpackListEl.appendChild(
          buildMoveRow(name, countLabel(entry.count), () => this.onTransferToStorage({ kind: 'collectible', id: entry.id })),
        )
      }
    }
    // 右栏 = 储物箱(点击取回背包)
    const boxEntries = this.box.entries()
    const boxCollectibles = this.box.collectibleEntries()
    const boxSignature = signatureOf(boxEntries, boxCollectibles)
    if (boxSignature !== this.boxSignature) {
      this.boxSignature = boxSignature
      this.boxListEl.replaceChildren()
      const total = boxEntries.length + boxCollectibles.length
      this.boxEmptyEl.hidden = total > 0
      for (const entry of boxEntries) {
        const fish = FISH.find(f => f.id === entry.fishId)
        if (!fish) continue
        this.boxListEl.appendChild(
          buildMoveRow(labelOf(fish.name, entry.quality), countLabel(entry.count), () =>
            this.onTransferToBackpack({ kind: 'fish', fishId: entry.fishId, quality: entry.quality }),
          ),
        )
      }
      for (const entry of boxCollectibles) {
        const name = collectibleName(entry.id)
        if (!name) continue
        this.boxListEl.appendChild(
          buildMoveRow(name, countLabel(entry.count), () => this.onTransferToBackpack({ kind: 'collectible', id: entry.id })),
        )
      }
    }
  }
}

/** 两栏共用的内容签名(渔获堆叠 + 收藏品堆叠序列化;变化才重建行) */
function signatureOf(
  fish: readonly { fishId: string; quality: string; count: number }[],
  collectibles: readonly { id: string; count: number }[],
): string {
  const parts = fish.map(e => `f:${e.fishId}:${e.quality}:${e.count}`)
  for (const e of collectibles) parts.push(`c:${e.id}:${e.count}`)
  return parts.join('|')
}

/** 行文案:鱼名 + 银/金星标(普通不注星,与背包/商店渔获同款) */
function labelOf(fishName: string, quality: FishQuality): string {
  const mark = qualityLabel(quality)
  return mark ? `${fishName}·${mark}` : fishName
}

/** 堆叠数量文案(×n;n=1 省略) */
function countLabel(count: number): string {
  return count > 1 ? `×${count}` : ''
}

/** 组转移行:整行按钮(名称 + 数量,右对齐),点击 = 整堆转移到对侧 */
function buildMoveRow(name: string, detail: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'shop-item storage-move'
  const nameEl = document.createElement('span')
  nameEl.className = 'shop-name'
  nameEl.textContent = name
  const detailEl = document.createElement('span')
  detailEl.className = 'shop-detail'
  detailEl.textContent = detail
  btn.append(nameEl, detailEl)
  btn.addEventListener('click', () => {
    onClick()
    btn.blur()
  })
  return btn
}
