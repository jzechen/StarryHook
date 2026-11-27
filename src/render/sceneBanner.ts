import { Container, Graphics, Text } from 'pixi.js'

/**
 * 入图场景名横幅(票 #46,spec 术语「场景横幅」):进入场景时短暂显示场景名
 * 演出——确认切换已发生,并赋予场景身份。底部横幅、画布内绘制(屏空间,
 * 组合根/世界导演挂在场景之上,不随相机滚动、不拦截输入)。
 *
 * 归属:触发时机归 worldDirector(过场淡入完成沿 = SceneTransition 'arrived',
 * 以及开机入图);本层只管演出本身——begin 重开时间线(换图即换名,不幂等,
 * 与大满贯「演出中不重入」语义不同:横幅是状态展示,新场景必须顶掉旧名)。
 *
 * 逻辑分辨率固定 480×270(ADR-0002),几何常量即屏内坐标;盒宽按字数推导
 * (几何不入文本度量,测试环境无 canvas——沿浮签链先例)。
 */

/** 演出总时长(秒,票面「约 2.5s 淡出」) */
export const SCENE_BANNER_SECONDS = 2.5
/** 淡入时长(秒) */
const FADE_IN = 0.25
/** 淡出时长(秒) */
const FADE_OUT = 0.5

/** 逻辑屏尺寸(ADR-0002 固定) */
const SCREEN_W = 480
const SCREEN_H = 270

/** 横幅字宽(18px 字号:全角一字 = 18px)与盒内边距 */
const CHAR_W = 18
const PAD_X = 24
const BOX_H = 28
/** 横幅底缘距屏底(逻辑像素) */
const BOTTOM_MARGIN = 10

/**
 * 横幅配色(票 #48 星露谷全铺):深底 band 换白底圆角深字,与 DOM 面板同族——
 * 米纸面(--ui-surface #ece3ce)+ 木框描边(--ui-border #886644)+ 暖深字
 * (--ui-text #4a3423,浅底上不再压深色描边)。
 */
const BANNER_BG = 0xece3ce
const BANNER_BORDER = 0x886644
const BANNER_TEXT = 0x4a3423

/** 横幅透明度时间线(纯函数):0 → 淡入 1 → 保持 → 线性淡出 → 0 */
export function sceneBannerAlpha(elapsed: number): number {
  if (elapsed <= 0 || elapsed >= SCENE_BANNER_SECONDS) return 0
  return Math.min(1, elapsed / FADE_IN, (SCENE_BANNER_SECONDS - elapsed) / FADE_OUT)
}

/** 底部场景名横幅(白底圆角深字,票 #48):一次性绘制band + 文案,alpha 走容器属性(不逐帧重画) */
export class SceneBanner {
  readonly container = new Container()
  private bg = new Graphics()
  private labelText: Text
  /** 演出计时;<0 = 未在演出 */
  private elapsed = -1
  private rendered: string | null = null
  /** begin 重绘哨兵(同名词不重画 Graphics;Pixi v8 指令只增不减) */
  private lastDrawn: string | null = null

  constructor() {
    this.container.interactive = false
    this.container.eventMode = 'none'
    this.container.position.set(SCREEN_W / 2, SCREEN_H - BOTTOM_MARGIN)
    this.labelText = new Text({
      text: '',
      style: {
        fontFamily: "'Fusion Pixel 12px Proportional SC', sans-serif",
        fontSize: 18,
        fill: BANNER_TEXT,
        letterSpacing: 2,
      },
    })
    this.labelText.anchor.set(0.5)
    // 文案居中于 band(-BOX_H..0):构造期定死,与 band 一次性绘制同族;
    // #48 换白底深字时修正——原锚点落在 band 底缘,深字下半截浮在场景上不可读
    this.labelText.position.set(0, -BOX_H / 2)
    this.container.addChild(this.bg, this.labelText)
    this.container.visible = false
  }

  /** 是否在演出中 */
  get playing(): boolean {
    return this.elapsed >= 0
  }

  /** 当前横幅词(未开演 = null;worldDirector 触发沿测试消费) */
  get label(): string | null {
    return this.playing ? this.rendered : null
  }

  /** 开演(换图即换名:重开时间线并重绘文案) */
  begin(name: string): void {
    this.elapsed = 0
    this.rendered = name
    this.labelText.text = name
    if (name !== this.lastDrawn) {
      this.lastDrawn = name
      const w = name.length * CHAR_W + PAD_X * 2
      this.bg
        .clear()
        .roundRect(-w / 2, -BOX_H, w, BOX_H, 6)
        .fill({ color: BANNER_BG, alpha: 0.92 })
        .stroke({ width: 1, color: BANNER_BORDER, alpha: 0.8 })
    }
    this.container.alpha = sceneBannerAlpha(0)
    this.container.visible = true
  }

  /** 逐帧推进:alpha 时间线;时长尽自动收场 */
  update(dt: number): void {
    if (!this.playing) return
    this.elapsed += dt
    const alpha = sceneBannerAlpha(this.elapsed)
    this.container.alpha = alpha
    this.container.visible = alpha > 0
    if (this.elapsed >= SCENE_BANNER_SECONDS) {
      this.elapsed = -1
      this.rendered = null
      this.container.visible = false
    }
  }

}
