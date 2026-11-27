import { describe, expect, it } from 'vitest'
import { SPLASH_COUNT, SPLASH_LIFETIME, SplashLayer, splashDrop, splashStep } from './splash'

/**
 * 捕获水花(接缝:splashDrop/splashStep 纯函数 + SplashLayer 公开行为,
 * 票 #43,spec §5.2)。
 *
 * 触发点 = 捕获边沿,位置 = 鱼漂世界坐标;单次 <1s;粒子走自写
 * SpritePool(生成/回收,零依赖)。行为测试不触私有字段:
 * 数精灵/数可见粒、读位置即可。
 */

/** 数 layer 容器下的可见精灵数(公开场景树) */
function visibleCount(layer: SplashLayer): number {
  return layer.container.children.filter(s => s.visible).length
}

describe('水花粒子参数(接缝:splashDrop 纯函数)', () => {
  it('每粒初速有界且偏上(喷溅读感:向上抛出、四周散开)', () => {
    for (let i = 0; i < SPLASH_COUNT; i++) {
      const p = splashDrop(i)
      expect(p.vx).toBeGreaterThanOrEqual(-70)
      expect(p.vx).toBeLessThanOrEqual(70)
      expect(p.vy).toBeLessThanOrEqual(-20) // 一律向上起步
      expect(p.vy).toBeGreaterThanOrEqual(-110)
    }
  })

  it('同序号逐位一致(确定性),全体初速不全同(有散布)', () => {
    expect(splashDrop(3)).toEqual(splashDrop(3))
    const vxs = Array.from({ length: SPLASH_COUNT }, (_, i) => splashDrop(i).vx)
    expect(new Set(vxs).size).toBeGreaterThan(1)
  })

  it('寿命有界且 <1s(单次效果口径)', () => {
    expect(SPLASH_LIFETIME).toBeLessThan(1)
    expect(splashDrop(0).life).toBeLessThanOrEqual(SPLASH_LIFETIME)
  })
})

describe('水花推进(接缝:splashStep 纯函数)', () => {
  it('重力下坠:vy 随时间递增,位置按抛物线推进', () => {
    const p0 = splashDrop(0)
    const p1 = splashStep(p0, 0.1)
    const p2 = splashStep(p1, 0.1)
    expect(p2.vy).toBeGreaterThan(p1.vy)
    expect(p1.vy).toBeGreaterThan(p0.vy)
    // 两次等长推进,横向匀速位移相等
    expect(p2.x - p1.x).toBeCloseTo(p1.x - p0.x, 6)
  })

  it('寿命尽即死(粒子回收时机)', () => {
    const p = splashDrop(0)
    expect(splashStep(p, p.life - 0.01).alive).toBe(true)
    expect(splashStep(p, p.life).alive).toBe(false)
  })
})

describe('水花层(接缝:SplashLayer 生成/回收)', () => {
  it('spawn 起一蓬可见粒(≤池容),寿命过后全部回收(可见数归零)', () => {
    const layer = new SplashLayer()
    layer.spawn(200, 120)
    expect(visibleCount(layer)).toBeGreaterThan(0)
    expect(visibleCount(layer)).toBeLessThanOrEqual(SPLASH_COUNT)
    for (let i = 0; i < 80; i++) layer.update(1 / 60)
    expect(visibleCount(layer)).toBe(0)
  })

  it('粒子落在鱼漂世界坐标:起步位置取整且聚在出生点附近', () => {
    const layer = new SplashLayer()
    layer.spawn(200, 120)
    for (const s of layer.container.children) {
      if (!s.visible) continue
      expect(Number.isInteger(s.x)).toBe(true)
      expect(Number.isInteger(s.y)).toBe(true)
      expect(Math.abs(s.x - 200)).toBeLessThanOrEqual(8)
      expect(Math.abs(s.y - 120)).toBeLessThanOrEqual(8)
    }
  })

  it('连续多轮捕获不泄漏:池容量与容器子节点数恒定', () => {
    const layer = new SplashLayer()
    const size = layer.container.children.length
    for (let round = 0; round < 50; round++) {
      layer.spawn(200, 120)
      for (let i = 0; i < 40; i++) layer.update(1 / 60)
    }
    expect(layer.container.children.length).toBe(size)
    expect(visibleCount(layer)).toBe(0)
  })

  it('存活中再次捕获:直接复用未回收的粒(池满丢弃,不扩容不抛错)', () => {
    const layer = new SplashLayer()
    layer.spawn(200, 120)
    const mid = layer.container.children.length
    expect(() => layer.spawn(220, 130)).not.toThrow()
    expect(layer.container.children.length).toBe(mid)
  })

  it('未触发时推进零可见(零开销路径不产生粒子)', () => {
    const layer = new SplashLayer()
    for (let i = 0; i < 300; i++) layer.update(1 / 60)
    expect(visibleCount(layer)).toBe(0)
  })
})
