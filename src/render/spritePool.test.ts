import { Sprite, Texture } from 'pixi.js'
import { describe, expect, it } from 'vitest'
import { SpritePool } from './spritePool'

/**
 * 轻量 Sprite 池(接缝:SpritePool 公开行为,票 #43,spec §5.2)。
 *
 * 水花/大满贯粒子的共用底座:预建精灵、acquire/release 复用、零依赖
 * (只用 Pixi Sprite,无第三方粒子库)。纪律:池满时新粒子直接丢弃
 * (克制口径——宁缺粒,不扩容,帧成本恒定)。
 */

describe('SpritePool(接缝:生成/回收行为)', () => {
  const makeSprite = (): Sprite => new Sprite(Texture.WHITE)

  it('构造即预建:容量恒定,空闲数 = 容量', () => {
    const pool = new SpritePool(6, makeSprite)
    expect(pool.size).toBe(6)
    expect(pool.freeCount).toBe(6)
    expect(pool.container.children.length).toBe(6)
  })

  it('acquire 取出即隐藏归零的精灵,release 归还后可复用(同一实例)', () => {
    const pool = new SpritePool(2, makeSprite)
    const a = pool.acquire()
    expect(a).not.toBeNull()
    expect(pool.freeCount).toBe(1)
    pool.release(a!)
    expect(pool.freeCount).toBe(2)
    const b = pool.acquire()
    expect(b).toBe(a) // 复用,不新建
  })

  it('池满时 acquire 返回 null(不扩容,帧成本恒定)', () => {
    const pool = new SpritePool(3, makeSprite)
    const taken = [pool.acquire(), pool.acquire(), pool.acquire()]
    expect(taken.every(s => s !== null)).toBe(true)
    expect(pool.acquire()).toBeNull()
    expect(pool.container.children.length).toBe(3)
  })

  it('重复 release 幂等:第二次 release 不再入队(同实例不占两坑)', () => {
    const pool = new SpritePool(2, makeSprite)
    const a = pool.acquire()!
    pool.release(a)
    pool.release(a)
    expect(pool.freeCount).toBe(2)
  })

  it('长时间生成/回收循环:池容量不增长(泄漏守护)', () => {
    const pool = new SpritePool(8, makeSprite)
    for (let round = 0; round < 200; round++) {
      const taken: Sprite[] = []
      for (let i = 0; i < 5; i++) {
        const s = pool.acquire()
        if (s) taken.push(s)
      }
      for (const s of taken) pool.release(s)
    }
    expect(pool.container.children.length).toBe(8)
    expect(pool.freeCount).toBe(8)
  })
})
