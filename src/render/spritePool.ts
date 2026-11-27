import { Container, Sprite } from 'pixi.js'

/**
 * 轻量 Sprite 池(票 #43,spec §5.2):水花/大满贯粒子的共用底座。
 *
 * 预建 size 个精灵挂在自持容器下(构造后整体 addChild 一次),acquire 取出
 * (标记在用,交给调用方摆位)、release 归还(隐藏 + 回 free 列表)。
 * 在用标记走显式集合,不借 visible 位——粒子可能「活着但暂不显示」
 * (如彩带错峰延迟),visible 语义归调用方。池满时 acquire 返回 null,
 * 调用方丢弃该粒——宁缺粒不扩容,帧成本恒定。
 * 零依赖:只有 Pixi Sprite 与调用方注入的工厂,无第三方粒子库。
 */
export class SpritePool {
  readonly container = new Container()
  private readonly free: Sprite[] = []
  private readonly out = new Set<Sprite>()

  constructor(
    readonly size: number,
    makeSprite: () => Sprite,
  ) {
    for (let i = 0; i < size; i++) {
      const sprite = makeSprite()
      sprite.visible = false
      this.container.addChild(sprite)
      this.free.push(sprite)
    }
  }

  /** 取一枚空闲精灵(置为在用);池满(全部在用)返回 null */
  acquire(): Sprite | null {
    const sprite = this.free.pop()
    if (!sprite) return null
    this.out.add(sprite)
    sprite.visible = true
    return sprite
  }

  /** 归还精灵(重复归还幂等);精灵回 free 列表并隐藏 */
  release(sprite: Sprite): void {
    if (!this.out.delete(sprite)) return
    sprite.visible = false
    this.free.push(sprite)
  }

  get freeCount(): number {
    return this.free.length
  }
}
