import { Container, Graphics, Text } from 'pixi.js'

/**
 * 交互浮签(票 #36,spec §2.1):画布内像素浮签 = 深底圆角小框 + E 键帽 +
 * 动作短词。跟随交互点世界坐标、随相机滚动(挂 worldScene 的 world 容器)、
 * 上下浮动、位置与浮动量全部取整像素(整数平移,无亚像素抖动)。
 *
 * Fusion Pixel 是 DOM 字体,画布内绘制直接以其 fontFamily 走 Pixi Text
 * (浏览器字体就绪后 canvas 2D 可用);几何不入文本度量——盒尺寸由
 * promptBoxSize 按字数推导(测试环境无 canvas,Text 桩无宽度,布局不能依赖实测)。
 */

/** 动作短词字宽(12px 像素字体网格:全角一字 = 12px) */
export const PROMPT_CHAR_W = 12
/** E 键帽尺寸(逻辑像素) */
export const PROMPT_KEY_W = 12
export const PROMPT_KEY_H = 12
/** 盒内边距(键帽两侧 5 / 竖向 4)与键帽-词间距 */
export const PROMPT_PAD_X = 5
export const PROMPT_PAD_Y = 4
export const PROMPT_GAP = 4

/** 浮签盒尺寸(逻辑像素) */
export interface PromptBox {
  width: number
  height: number
}

/** 盒几何:键帽 + 词 + 内边距(纯函数;样张验收布局契约) */
export function promptBoxSize(word: string): PromptBox {
  return {
    width: PROMPT_PAD_X * 2 + PROMPT_KEY_W + PROMPT_GAP + word.length * PROMPT_CHAR_W,
    height: PROMPT_KEY_H + PROMPT_PAD_Y * 2,
  }
}

/** 浮标悬停高度(交互点上方)与上下浮动幅度(取整前) */
const HOVER_HEIGHT = 24
const BOB_AMP = 1.5
const BOB_PERIOD = 2.6

/** 一个交互点的浮签(短词不变不重画;显隐与位置逐帧更新) */
export class InteractionPrompt {
  readonly container = new Container()
  private bg = new Graphics()
  private keyCap: Text
  private word: Text
  /** 最近一次渲染的短词(null = 尚未画过,首词必画) */
  private renderedWord: string | null = null

  constructor() {
    this.container.label = 'interaction-prompt'
    this.container.visible = false
    this.keyCap = new Text({
      text: 'E',
      style: { fontFamily: 'sans-serif', fontSize: 9, fontWeight: '700', fill: 0x0c2f3f },
    })
    this.keyCap.anchor.set(0.5)
    this.word = new Text({
      text: '',
      style: { fontFamily: '"Fusion Pixel 12px Proportional SC", sans-serif', fontSize: 12, fill: 0xeaf4f6 },
    })
    this.word.anchor.set(0, 0.5)
    this.container.addChild(this.bg, this.keyCap, this.word)
  }

  /** 短词(变化才重画:Pixi v8 指令只增不减,clear → 重画为稳态) */
  setWord(word: string): void {
    if (word === this.renderedWord) return
    this.renderedWord = word
    this.word.text = word
    const { width: w, height: h } = promptBoxSize(word)
    const x0 = -w / 2
    const y0 = -h
    this.bg
      .clear()
      .roundRect(x0, y0, w, h, 4)
      .fill({ color: 0x0c2f3f, alpha: 0.85 })
      .stroke({ width: 1, color: 0x9fd8e8, alpha: 0.5 })
      .roundRect(x0 + PROMPT_PAD_X, y0 + PROMPT_PAD_Y, PROMPT_KEY_W, PROMPT_KEY_H, 2)
      .fill({ color: 0xeaf4f6, alpha: 0.95 })
    this.keyCap.position.set(x0 + PROMPT_PAD_X + PROMPT_KEY_W / 2, y0 + PROMPT_PAD_Y + PROMPT_KEY_H / 2)
    this.word.position.set(x0 + PROMPT_PAD_X + PROMPT_KEY_W + PROMPT_GAP, y0 + h / 2)
  }

  /** 显示于交互点上方(像素取整 + 上下浮动) */
  showAt(x: number, y: number, t: number): void {
    const bob = Math.round(Math.sin(t * BOB_PERIOD) * BOB_AMP)
    this.container.position.set(Math.round(x), Math.round(y - HOVER_HEIGHT) + bob)
    this.container.visible = true
  }

  hide(): void {
    this.container.visible = false
  }
}
