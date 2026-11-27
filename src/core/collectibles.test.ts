import { describe, expect, it } from 'vitest'
import { COLLECTIBLES, collectibleName } from './collectibles'

describe('收藏品目录(接缝:COLLECTIBLES,票 #40 立缝、#41 填充)', () => {
  it('目录 id 唯一(落表纪律;空表平凡成立)', () => {
    expect(new Set(COLLECTIBLES.map(c => c.id)).size).toBe(COLLECTIBLES.length)
  })

  it('目录外 id 查名 = null(面板不渲染目录外条目)', () => {
    expect(collectibleName('不在目录')).toBeNull()
  })
})
