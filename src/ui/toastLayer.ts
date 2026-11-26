/** 轻提示种类:new-entry = 新收录;grand-slam = 池塘大满贯 */
export type ToastKind = 'new-entry' | 'grand-slam'

/** 文案依票面与 GLOSSARY:大满贯只是集齐提示的文案,不是状态名 */
const TOAST_TEXT: Record<ToastKind, string> = {
  'new-entry': '新收录!',
  'grand-slam': '池塘大满贯',
}

/** 轻提示生命周期单一来源:淡出结束即移除时刻;index.html 只保留 @keyframes 与视觉样式 */
const TOAST_LIFETIME_MS = 2000
/** 淡出动画时长;淡出开始时刻 = 生命周期 − 淡出时长,随常量推导,无需跨文件对齐 */
const TOAST_FADE_OUT_MS = 300
/** 淡入动画时长(纯观感参数,与生命周期无关) */
const TOAST_FADE_IN_MS = 180

/**
 * DOM 轻提示层:顶部居中弹出、约 2s 自动消失。
 * 容器挂在 #hud 内并 pointer-events: none,不拦截任何游戏输入;
 * 多条提示同时触发时纵向叠加,互不覆盖。
 * 动画时序(淡入/淡出/延迟)由上述常量推导并内联写入节点——
 * 改 TOAST_LIFETIME_MS 一处,淡出延迟与移除时刻整体生效。
 */
export class ToastLayer {
  private container = document.getElementById('toast-layer')!

  show(kind: ToastKind): void {
    const el = document.createElement('div')
    el.className = `toast toast--${kind}`
    el.textContent = TOAST_TEXT[kind]
    el.style.animation = `toast-in ${TOAST_FADE_IN_MS}ms ease-out, toast-out ${TOAST_FADE_OUT_MS}ms ease-in ${
      TOAST_LIFETIME_MS - TOAST_FADE_OUT_MS
    }ms forwards`
    this.container.appendChild(el)
    window.setTimeout(() => el.remove(), TOAST_LIFETIME_MS)
  }
}
