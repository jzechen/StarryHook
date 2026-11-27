import type { CoreLoop } from '../core/coreLoop'
import type { TimedBestStore } from '../core/timedBest'
import type { EnvState } from '../core/types'
import { envBadgeText } from './envBadgeText'
import { catchSettlementText } from './roundSettlementText'
import { topBarScores } from './topBarScores'

/**
 * DOM 覆盖层:得分、最高纪录、倒计时、金币、等级/竿名、环境徽章、装备饵余量、
 * 操作提示、重开/静音按钮。得分/纪录为双轨口径(票 #22 review):随模式走,
 * 限时显示单局得分与限时单局纪录,无限保持会话累计与会话纪录。
 */
export class Hud {
  private scoreEl: HTMLElement
  private bestEl: HTMLElement
  private coinsEl: HTMLElement
  private hintEl: HTMLElement
  private rodStatusEl: HTMLElement
  private envBadgeEl: HTMLElement
  private baitBadgeEl: HTMLElement
  private countdownEl: HTMLElement
  private muteBtn: HTMLElement
  private lastScore = -1
  private lastBest = -1
  private lastCoins = -1
  private lastRodStatus = ''
  private lastEnvBadge = ''
  /** 首帧哨兵:空串不是合法徽章文案(合法 = null 或「饵名 ×n」),首帧必写一次 */
  private lastBaitBadge: string | null = ''
  /** 首帧哨兵:空串不是合法倒计时文案(合法 = null 或「1:23」),首帧必写一次 */
  private lastCountdown: string | null = ''

  constructor(
    onReset: () => void,
    // 执行一次静音切换并返回切换后的状态(状态机在组合根的 MuteStore,按钮只管展示)
    onToggleMute: () => boolean,
    // 限时单局最高纪录来源(纪录双轨,票 #22/#23):限时模式下顶栏「最高纪录」轨
    // 展示此值;只读消费,持久化判定(recordIfHigher)只在组合根归零结算接线
    private timedBest: TimedBestStore,
  ) {
    this.scoreEl = document.getElementById('score')!
    this.bestEl = document.getElementById('best')!
    this.coinsEl = document.getElementById('coins')!
    this.hintEl = document.getElementById('hint')!
    this.rodStatusEl = document.getElementById('rod-status')!
    this.envBadgeEl = document.getElementById('env-badge')!
    this.baitBadgeEl = document.getElementById('bait-badge')!
    this.countdownEl = document.getElementById('countdown')!
    this.muteBtn = document.getElementById('mute-toggle')!
    document.getElementById('reset')!.addEventListener('click', () => {
      onReset()
      // 移除按钮焦点,避免之后按空格误触"重开"
      ;(document.activeElement as HTMLElement | null)?.blur()
    })
    this.muteBtn.addEventListener('click', () => {
      this.setMuted(onToggleMute())
      // 同理移除焦点:静音后按空格不该再触发开关
      ;(document.activeElement as HTMLElement | null)?.blur()
    })
  }

  /** 静音态 → 图标与无障碍标签(启动恢复与每次切换后各刷一次) */
  setMuted(muted: boolean): void {
    this.muteBtn.textContent = muted ? '🔇' : '🔊'
    this.muteBtn.setAttribute('aria-label', muted ? '取消静音' : '静音')
  }

  /** 成长常驻展示「等级 N · 竿名」:启动恢复与升级/换竿后各刷新一次,内容不变时不重写 */
  setProgression(level: number, rodName: string): void {
    const text = `等级 ${level} · ${rodName}`
    if (text === this.lastRodStatus) return
    this.rodStatusEl.textContent = text
    this.lastRodStatus = text
  }

  /**
   * 环境徽章(票 #15):「春 · 日 · 晴」,文案由纯函数 envBadgeText 派生,
   * 与出鱼权重同源于 core.env。季节/昼夜按真实时间流转、天气会话常量,
   * 内容不变不重写(与得分/等级同款守卫);水域不进徽章(换水域面板已随票 #36 退役,
 * 水域由钓位走近自动切换,「去哪钓」走图鉴出没条件)。
   */
  setEnv(env: EnvState): void {
    const text = envBadgeText(env)
    if (text === this.lastEnvBadge) return
    this.envBadgeEl.textContent = text
    this.lastEnvBadge = text
  }

  /**
   * 金币余额(票 #17 故事 2「顶栏随时看到」,review 修复):顶栏紧凑展示,
   * 与商店面板头同源(钱包唯一事实)。内容不变不重写(与得分同款守卫)。
   */
  setCoins(coins: number): void {
    if (coins === this.lastCoins) return
    this.coinsEl.textContent = `${coins} 金币`
    this.lastCoins = coins
  }

  /**
   * 装备饵余量徽章(review 修复,票 #17 故事 10):环境徽章旁小字「香饵 ×9」——
   * 垂钓进行中商店不可开,余量须常驻可见;文案由纯函数 baitBadgeText 派生,
   * null(未装备/耗尽)即隐藏,耗尽自动消失。内容不变不重写(同款守卫)。
   */
  setBaitBadge(text: string | null): void {
    if (text === this.lastBaitBadge) return
    this.baitBadgeEl.textContent = text ?? ''
    this.baitBadgeEl.hidden = text === null
    this.lastBaitBadge = text
  }

  /**
   * 顶栏倒计时(票 #24):限时挑战显示剩余时间,文案由纯函数 countdownBadgeText
   * 派生(「1:23」逐秒,向上取整);null(无限休闲)即隐藏——切回无限核心计时
   * 状态已完全清除,顶栏随之无残留。内容变化才重写(与装备饵徽章同款守卫),
   * 文案每秒才变一次,不逐帧刷 DOM。
   */
  setCountdown(text: string | null): void {
    if (text === this.lastCountdown) return
    this.countdownEl.textContent = text ?? ''
    this.countdownEl.hidden = text === null
    this.lastCountdown = text
  }

  update(core: CoreLoop): void {
    this.setEnv(core.env)
    // 顶栏得分/纪录双轨口径(票 #22 review 缺口①):两轨随模式走——限时显示
    // 本局得分(roundScore,开局基线差值,归零后定格)与限时单局纪录(timedBest,
    // 只读展示不重复判定);无限保持现状(会话累计 + 会话纪录)。
    // 守卫不变:内容变化才重写 DOM(轨道切换后数值不同自然触发重写)
    const track = topBarScores({
      mode: core.mode,
      score: core.score,
      best: core.best,
      roundScore: core.roundScore,
      timedBest: this.timedBest.best(),
    })
    if (track.score !== this.lastScore) {
      this.scoreEl.textContent = String(track.score)
      this.lastScore = track.score
    }
    if (track.best !== this.lastBest) {
      this.bestEl.textContent = String(track.best)
      this.lastBest = track.best
    }

    let hint = ''
    let urgent = false
    switch (core.phase) {
      case 'idle':
        hint = 'WASD/方向键移动 · 走近钓位,按住 E/空格蓄力,松开抛竿'
        break
      case 'charging':
        hint = `蓄力 ${Math.round(core.power * 100)}%……松开抛竿!`
        break
      case 'waiting':
        hint = '等待鱼上钩……(短按不打断,按住可收竿)'
        break
      case 'bite':
        hint = '咬钩了!快点击!'
        urgent = true
        break
      case 'minigame':
        hint = '按住或连点,让绿条罩住鱼!'
        break
      case 'caught':
        // 捕获结算文本(票 #39):文案派生单源 catchSettlementText,银/金星渔获注品质
        hint = core.fish
          ? catchSettlementText(core.fish.name, core.fish.score, core.caughtQuality)
          : '钓到了!'
        break
      case 'escaped':
        hint = '跑掉了……再来一竿'
        break
    }
    this.hintEl.textContent = hint
    this.hintEl.classList.toggle('urgent', urgent)
  }
}
