import { describe, expect, it } from 'vitest'
import { COLLECTIBLES, collectibleName } from './collectibles'

describe('收藏品目录(接缝:COLLECTIBLES,票 #40 立缝、#41 填充)', () => {
  it('目录 id 唯一(落表纪律;空表平凡成立)', () => {
    expect(new Set(COLLECTIBLES.map(c => c.id)).size).toBe(COLLECTIBLES.length)
  })

  it('票 #41 填充:2–3 个收藏品,名字非空(宝箱掉落引用本表)', () => {
    expect(COLLECTIBLES.length).toBeGreaterThanOrEqual(2)
    expect(COLLECTIBLES.length).toBeLessThanOrEqual(3)
    for (const c of COLLECTIBLES) expect(c.name.length).toBeGreaterThan(0)
  })

  it('目录外 id 查名 = null(面板不渲染目录外条目)', () => {
    expect(collectibleName('不在目录')).toBeNull()
  })

  it('票 #41 目录条目按名可查(面板行文案单源)', () => {
    expect(collectibleName('pearl')).toBe('河蚌珍珠')
    expect(collectibleName('willow-carving')).toBe('柳纹木雕')
  })
})
