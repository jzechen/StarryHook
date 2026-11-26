import type { CoreLoop } from '../core/coreLoop'

/** DOM 覆盖层:得分、最高纪录、等级/竿名、操作提示、重开/静音按钮。 */
export class Hud {
  private scoreEl: HTMLElement
  private bestEl: HTMLElement
  private hintEl: HTMLElement
  private rodStatusEl: HTMLElement
  private muteBtn: HTMLElement
  private lastScore = -1
  private lastBest = -1
  private lastRodStatus = ''

  constructor(
    onReset: () => void,
    // 执行一次静音切换并返回切换后的状态(状态机在组合根的 MuteStore,按钮只管展示)
    onToggleMute: () => boolean,
  ) {
    this.scoreEl = document.getElementById('score')!
    this.bestEl = document.getElementById('best')!
    this.hintEl = document.getElementById('hint')!
    this.rodStatusEl = document.getElementById('rod-status')!
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

  update(core: CoreLoop): void {
    if (core.score !== this.lastScore) {
      this.scoreEl.textContent = String(core.score)
      this.lastScore = core.score
    }
    if (core.best !== this.lastBest) {
      this.bestEl.textContent = String(core.best)
      this.lastBest = core.best
    }

    let hint = ''
    let urgent = false
    switch (core.phase) {
      case 'idle':
        hint = 'WASD/方向键移动 · 按住鼠标或空格蓄力,松开抛竿'
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
        hint = core.fish ? `钓到了「${core.fish.name}」 +${core.fish.score} 分!` : '钓到了!'
        break
      case 'escaped':
        hint = '跑掉了……再来一竿'
        break
    }
    this.hintEl.textContent = hint
    this.hintEl.classList.toggle('urgent', urgent)
  }
}
