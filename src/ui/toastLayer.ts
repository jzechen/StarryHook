/** 轻提示种类:new-entry = 新收录;grand-slam = 池塘大满贯 */
export type ToastKind = 'new-entry' | 'grand-slam'

/** 文案依票面与 GLOSSARY:大满贯只是集齐提示的文案,不是状态名 */
const TOAST_TEXT: Record<ToastKind, string> = {
  'new-entry': '新收录!',
  'grand-slam': '池塘大满贯',
}

/** 与 index.html 中 toast-out 动画时序对齐:1.7s 开始淡出,2s 移除 */
const TOAST_LIFETIME_MS = 2000

/**
 * DOM 轻提示层:顶部居中弹出、约 2s 自动消失。
 * 容器挂在 #hud 内并 pointer-events: none,不拦截任何游戏输入;
 * 多条提示同时触发时纵向叠加,互不覆盖。
 */
export class ToastLayer {
  private container = document.getElementById('toast-layer')!

  show(kind: ToastKind): void {
    const el = document.createElement('div')
    el.className = `toast toast--${kind}`
    el.textContent = TOAST_TEXT[kind]
    this.container.appendChild(el)
    window.setTimeout(() => el.remove(), TOAST_LIFETIME_MS)
  }
}
