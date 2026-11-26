import type { CollectionStore } from '../core/collection'
import type { CoreLoop } from '../core/coreLoop'
import { FISH } from '../core/fishCatalog'
import type { BehaviorType } from '../core/types'
import { collectionPanelAllowed } from './collectionPanelPolicy'
import { sortFishByDifficulty } from './collectionPanelOrder'

/** 鱼类行为 → 图鉴展示用中文(依 GLOSSARY 鱼类行为术语) */
const BEHAVIOR_LABELS: Record<BehaviorType, string> = {
  smooth: '平滑',
  sinker: '沉底',
  floater: '漂浮',
  dart: '急冲',
  mixed: '混合',
}

/** 面板条目序:spec(#3)要求按难度从低到高;显式排序,不依赖目录数组序(同难度保持目录序) */
const PANEL_FISH = sortFishByDifficulty(FISH)

/**
 * 图鉴面板:DOM 覆盖层(与 HUD 同栈),浏览收集状态。
 * 只读消费 CollectionStore,条目派生自鱼类目录并按难度升序排列(sortFishByDifficulty);
 * 开关策略见 collectionPanelPolicy——打开时核心循环照常推进,不受影响。
 */
export class CollectionPanel {
  private entryBtn: HTMLButtonElement
  private panelEl: HTMLElement
  private progressEl: HTMLElement
  private closeBtn: HTMLButtonElement
  /** 每种鱼一行,按难度升序建立(见 PANEL_FISH);行内文本由 refresh 按收集状态填充 */
  private rows: { root: HTMLLIElement; nameEl: HTMLElement; detailEl: HTMLElement }[] = []
  private open = false
  /** 最近一次渲染时的已收集数;变化才写 DOM,避免每帧刷新 */
  private renderedCollected = -1
  private allowed = true

  constructor(private collection: CollectionStore) {
    this.entryBtn = document.getElementById('collection-entry') as HTMLButtonElement
    this.panelEl = document.getElementById('collection-panel')!
    this.progressEl = document.getElementById('collection-progress')!
    this.closeBtn = document.getElementById('collection-close') as HTMLButtonElement
    const listEl = document.getElementById('collection-list')!

    for (let i = 0; i < PANEL_FISH.length; i++) {
      const li = document.createElement('li')
      li.className = 'fish-item locked'
      const nameEl = document.createElement('span')
      nameEl.className = 'fish-name'
      nameEl.textContent = '???'
      const detailEl = document.createElement('span')
      detailEl.className = 'fish-detail'
      detailEl.textContent = '尚未捕获'
      li.append(nameEl, detailEl)
      listEl.appendChild(li)
      this.rows.push({ root: li, nameEl, detailEl })
    }

    this.entryBtn.addEventListener('click', () => {
      if (this.allowed) this.setOpen(!this.open)
      // 移除按钮焦点,避免之后按空格误触开关(与重开按钮同理由)
      ;(document.activeElement as HTMLElement | null)?.blur()
    })
    this.closeBtn.addEventListener('click', () => {
      this.setOpen(false)
      this.closeBtn.blur()
    })
  }

  /** 每帧调用:同步入口可用性、禁用阶段自动收起、打开时刷新进度与条目 */
  update(core: CoreLoop): void {
    this.allowed = collectionPanelAllowed(core.phase)
    this.entryBtn.disabled = !this.allowed
    if (this.open && !this.allowed) this.setOpen(false)
    if (this.open) this.refresh()
  }

  private setOpen(open: boolean): void {
    this.open = open
    this.panelEl.hidden = !open
  }

  private refresh(): void {
    const progress = this.collection.progress()
    if (progress.collected === this.renderedCollected) return
    this.renderedCollected = progress.collected
    this.progressEl.textContent = `${progress.collected}/${progress.total}`
    this.rows.forEach((row, i) => {
      const fish = PANEL_FISH[i]!
      const caught = this.collection.has(fish.id)
      // 未捕获灰显:不显示名称、行为与分值,留悬念
      row.root.classList.toggle('locked', !caught)
      row.nameEl.textContent = caught ? fish.name : '???'
      row.detailEl.textContent = caught
        ? `${BEHAVIOR_LABELS[fish.behavior]} · ${fish.score} 分`
        : '尚未捕获'
    })
  }
}
