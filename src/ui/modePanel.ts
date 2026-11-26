import { TUNE } from '../config'
import type { CoreLoop, GameMode } from '../core/coreLoop'
import type { TimedBestStore } from '../core/timedBest'
import { modePanelAllowed } from './modePanelPolicy'
import { PanelExclusion } from './panelExclusion'
import { roundJustEnded } from './roundEdgePolicy'

/**
 * 模式选项行(行序固定:无限休闲在上,限时挑战在下);
 * 限时提示文案中的时长由调参叶派生(TUNE.timed.duration 改一处文案跟随)。
 */
const MODE_OPTIONS: readonly { mode: GameMode; label: string; hint: string }[] = [
  { mode: 'casual', label: '无限休闲', hint: '打开就钓,随时可停' },
  { mode: 'timed', label: '限时挑战', hint: `${Math.round(TUNE.timed.duration / 60)} 分钟冲分` },
]

/**
 * 模式面板(票 #24,spec #22):顶栏「模式」入口开选择面板,列无限休闲/限时挑战
 * 与限时单局最高纪录,当前模式高亮标识。只读消费核心模式状态(core.phase / core.mode /
 * core.roundActive)与限时纪录(TimedBestStore.best),切换走核心 setMode——垂钓
 * 进行中核心层同样拒绝,与入口策略(modePanelAllowed,仅待机可开)构成双保险。
 * 开关与既有面板同款交互:入口焦点即清(防误触空格),离开待机自动收起,
 * 打开时核心循环照常推进(限时是纯计时壳,面板不暂停倒计时)。
 * 局毕自动回面板:roundActive true→false 边沿 = 归零强制结算完成(触发源判定见
 * update 注释),回待机帧自动弹出——回到模式选择,可再来一局或切回休闲。
 * 经 PanelExclusion 自注册,与图鉴/换水域/商店面板互斥(第四面板即插即用)。
 */
export class ModePanel {
  private entryBtn: HTMLButtonElement
  private panelEl: HTMLElement
  private closeBtn: HTMLButtonElement
  private bestEl: HTMLElement
  /** 每个模式一行,行序 = MODE_OPTIONS 序;当前标识由 update 按变化刷新 */
  private rows: { btn: HTMLButtonElement; currentEl: HTMLElement }[] = []
  private open = false
  /** 上一帧限时局是否进行中(true→false 边沿 = 归零强制结算完成) */
  private prevRoundActive = false
  /** 局毕待弹:归零结算后置位,回到待机帧弹出(垂钓收尾停留不被面板打断) */
  private pendingReopen = false
  /** 最近一次渲染时的当前模式(null = 尚未写过,首帧必刷) */
  private renderedMode: GameMode | null = null
  /** 最近一次渲染时的限时最佳纪录(打开时才刷新,变化才写 DOM) */
  private renderedBest = -1

  constructor(
    private core: CoreLoop,
    // 只读消费限时单局最高纪录(纪录双轨,票 #23):面板展示,写入只在组合根结算接线
    private timedBest: TimedBestStore,
    // 面板互斥协调器:构造时自注册,打开时经它收起其余面板(第四面板),
    // 组合根不再串互斥回调
    private exclusion?: PanelExclusion,
  ) {
    this.exclusion?.register(this)
    this.entryBtn = document.getElementById('mode-entry') as HTMLButtonElement
    this.panelEl = document.getElementById('mode-panel')!
    this.closeBtn = document.getElementById('mode-close') as HTMLButtonElement
    this.bestEl = document.getElementById('mode-best')!
    const listEl = document.getElementById('mode-list')!

    for (const option of MODE_OPTIONS) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'mode-item'
      const nameEl = document.createElement('span')
      nameEl.className = 'mode-name'
      nameEl.textContent = option.label
      const hintEl = document.createElement('span')
      hintEl.className = 'mode-hint'
      hintEl.textContent = option.hint
      const currentEl = document.createElement('span')
      currentEl.className = 'mode-current'
      currentEl.textContent = '当前'
      currentEl.hidden = true
      btn.append(nameEl, hintEl, currentEl)
      btn.addEventListener('click', () => {
        // 核心层拒绝(非待机)则模式不变、面板不动——UI 策略之外的二道闸
        if (this.core.setMode(option.mode)) {
          // 手动切换不算「局毕」:边沿基准同步到切换后的状态,自动回面板
          // 与结算反馈(组合根侧)都只在归零结算时触发,选模式本身不该再弹窗
          this.prevRoundActive = this.core.roundActive
          this.pendingReopen = false
          this.setOpen(false) // 选定即开局或完全清除,回游戏
        }
        btn.blur()
      })
      listEl.appendChild(btn)
      this.rows.push({ btn, currentEl })
    }

    // 限时最佳纪录初始文本由脚本写入(HTML 不硬编码 0,老玩家上线即真实纪录)
    this.bestEl.textContent = this.bestText()

    this.entryBtn.addEventListener('click', () => {
      if (modePanelAllowed(this.core.phase)) this.setOpen(!this.open)
      // 移除按钮焦点,避免之后按空格误触开关(与既有面板入口同理由)
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

  /**
   * 每帧调用:同步入口可用性、离开待机自动收起、局毕自动回面板、
   * 当前模式标识(变化才写 DOM)与打开时的纪录刷新。
   */
  update(core: CoreLoop): void {
    const allowed = modePanelAllowed(core.phase)
    this.entryBtn.disabled = !allowed
    if (this.open && !allowed) this.setOpen(false)

    // 局毕自动回面板(票 #24):局毕边沿判定单源在 roundJustEnded(roundEdgePolicy,
    // 与组合根结算反馈两处消费同一份)——上一帧局进行中、本帧已结束且模式仍为限时
    // (核心里 endRound 不改模式;setMode('casual') 也会置否 roundActive,但那是玩家
    // 在面板里主动选了休闲,不算「一局结束」,不该再弹)。
    // 垂钓收尾未完(小游戏脱钩/捕获停留)不打断:先记 pendingReopen,回待机帧再弹。
    const active = core.roundActive
    if (roundJustEnded(this.prevRoundActive, core)) this.pendingReopen = true
    this.prevRoundActive = active
    if (this.pendingReopen && core.phase === 'idle') {
      this.pendingReopen = false
      this.setOpen(true)
    }

    if (core.mode !== this.renderedMode) {
      this.renderedMode = core.mode
      this.rows.forEach((row, i) => {
        const current = MODE_OPTIONS[i]!.mode === core.mode
        row.btn.classList.toggle('current', current)
        row.currentEl.hidden = !current
      })
    }
    if (this.open) this.refresh()
  }

  /** 限时最佳纪录文案:0 = 还没有成绩(TimedBestStore 契约),不显示裸 0 */
  private bestText(): string {
    const best = this.timedBest.best()
    return best > 0 ? `限时最佳纪录 ${best}` : '限时最佳纪录 暂无'
  }

  private refresh(): void {
    const best = this.timedBest.best()
    if (best !== this.renderedBest) {
      this.renderedBest = best
      this.bestEl.textContent = this.bestText()
    }
  }

  private setOpen(open: boolean): void {
    this.open = open
    this.panelEl.hidden = !open
    // 打开时通知协调器收起其余面板;收起不通知(协调器只认打开,互斥不递归)
    if (open) this.exclusion?.notifyOpened(this)
  }
}
