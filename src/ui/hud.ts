import type { CoreLoop } from '../core/coreLoop'

/** DOM 覆盖层:得分、最高纪录、操作提示、重开按钮。 */
export class Hud {
  private scoreEl: HTMLElement
  private bestEl: HTMLElement
  private hintEl: HTMLElement
  private lastScore = -1
  private lastBest = -1

  constructor(onReset: () => void) {
    this.scoreEl = document.getElementById('score')!
    this.bestEl = document.getElementById('best')!
    this.hintEl = document.getElementById('hint')!
    document.getElementById('reset')!.addEventListener('click', onReset)
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
        hint = '按住鼠标蓄力,松开抛竿'
        break
      case 'charging':
        hint = `蓄力 ${Math.round(core.power * 100)}%……松开抛竿!`
        break
      case 'waiting':
        hint = '等待鱼上钩……(点击可提前收竿)'
        break
      case 'bite':
        hint = '咬钩了!快点击!'
        urgent = true
        break
      case 'minigame':
        hint = '按住让绿条上升,罩住鱼!'
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
