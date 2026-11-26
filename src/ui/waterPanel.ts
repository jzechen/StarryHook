import type { CoreLoop } from '../core/coreLoop'
import { FISH } from '../core/fishCatalog'
import type { WaterAreaId } from '../core/types'
import { WATER_AREAS } from '../core/waterAreas'
import { PanelExclusion } from './panelExclusion'
import { waterSwitchAllowed } from './waterSwitchPolicy'

/** 代表鱼 id → 名称(注册表只存 id,展示名以鱼类目录为单源) */
const FISH_NAME = new Map(FISH.map(f => [f.id, f.name] as const))

/**
 * 换水域面板(票 #15,spec #13):顶栏入口开切换面板,列三片水域与各自代表鱼
 * 提示,当前水域高亮标识。只读消费水域注册表(WATER_AREAS)与核心只读状态
 * (core.phase / core.area),切换走核心 setWater——垂钓进行中核心层同样拒绝,
 * 与入口策略(waterSwitchAllowed,仅待机可开)构成双保险。
 * 开关与图鉴面板同款交互:入口焦点即清(防误触空格),离开待机自动收起。
 */
export class WaterPanel {
  private entryBtn: HTMLButtonElement
  private panelEl: HTMLElement
  private closeBtn: HTMLButtonElement
  /** 每片水域一行,行序 = 注册表序(池塘/河流/湖);当前标识由 update 按变化刷新 */
  private rows: { btn: HTMLButtonElement; currentEl: HTMLElement }[] = []
  private open = false
  /** 最近一次渲染时的当前水域(null = 尚未写过,首帧必刷) */
  private renderedArea: WaterAreaId | null = null

  constructor(
    private core: CoreLoop,
    // 面板互斥协调器:构造时自注册,打开时经它收起其余面板(图鉴/后续商店),
    // 组合根不再串互斥回调
    private exclusion?: PanelExclusion,
  ) {
    this.exclusion?.register(this)
    this.entryBtn = document.getElementById('water-entry') as HTMLButtonElement
    this.panelEl = document.getElementById('water-panel')!
    this.closeBtn = document.getElementById('water-close') as HTMLButtonElement
    const listEl = document.getElementById('water-list')!

    for (const area of WATER_AREAS) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'water-item'
      const nameEl = document.createElement('span')
      nameEl.className = 'water-name'
      nameEl.textContent = area.name
      const hintEl = document.createElement('span')
      hintEl.className = 'water-hint'
      hintEl.textContent = `代表鱼:${FISH_NAME.get(area.signatureFishId) ?? area.signatureFishId}`
      const currentEl = document.createElement('span')
      currentEl.className = 'water-current'
      currentEl.textContent = '当前'
      currentEl.hidden = true
      btn.append(nameEl, hintEl, currentEl)
      btn.addEventListener('click', () => {
        // 核心层拒绝(非待机)则水域不变、面板不动——UI 策略之外的二道闸
        if (this.core.setWater(area.id)) this.setOpen(false)
        btn.blur()
      })
      listEl.appendChild(btn)
      this.rows.push({ btn, currentEl })
    }

    this.entryBtn.addEventListener('click', () => {
      if (waterSwitchAllowed(this.core.phase)) this.setOpen(!this.open)
      // 移除按钮焦点,避免之后按空格误触开关(与图鉴入口同理由)
      ;(document.activeElement as HTMLElement | null)?.blur()
    })
    this.closeBtn.addEventListener('click', () => {
      this.setOpen(false)
      this.closeBtn.blur()
    })
  }

  /** 供互斥协调器收起(其余面板打开时;对已收起面板幂等) */
  close(): void {
    this.setOpen(false)
  }

  /** 每帧调用:同步入口可用性、离开待机自动收起、当前水域标识(变化才写 DOM) */
  update(core: CoreLoop): void {
    const allowed = waterSwitchAllowed(core.phase)
    this.entryBtn.disabled = !allowed
    if (this.open && !allowed) this.setOpen(false)
    if (core.area !== this.renderedArea) {
      this.renderedArea = core.area
      this.rows.forEach((row, i) => {
        const current = WATER_AREAS[i]!.id === core.area
        row.btn.classList.toggle('current', current)
        row.currentEl.hidden = !current
      })
    }
  }

  private setOpen(open: boolean): void {
    this.open = open
    this.panelEl.hidden = !open
    // 打开时通知协调器收起其余面板;收起不通知(协调器只认打开,互斥不递归)
    if (open) this.exclusion?.notifyOpened(this)
  }
}
