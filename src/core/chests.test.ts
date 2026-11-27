import { describe, expect, it } from 'vitest'
import { BAITS } from '../config'
import { COLLECTIBLES } from './collectibles'
import {
  CHESTS,
  FISHING_CHEST_LOOTS,
  chestDef,
  chestLootText,
  chestOpenToastText,
  fishingChestToastText,
} from './chests'

/**
 * 宝箱内容表(票 #41,spec §4.5):内容**表驱动固定**(纯函数,不随机)——
 * 金币开箱即 wallet.earn、鱼饵走库存直加、收藏品 backpack.addCollectible。
 * 期望值为独立字面量(掉落决策),不从实现推导(沿 maps.test 先例)。
 */
describe('CHESTS 内容表(接缝:CHESTS,票 #41)', () => {
  it('3–4 个宝箱(spec §4.5),id 唯一、名字非空', () => {
    expect(CHESTS.length).toBeGreaterThanOrEqual(3)
    expect(CHESTS.length).toBeLessThanOrEqual(4)
    expect(new Set(CHESTS.map(c => c.id)).size).toBe(CHESTS.length)
    for (const c of CHESTS) expect(c.name.length).toBeGreaterThan(0)
  })

  it('内容覆盖三类掉落:金币 / 鱼饵 / 收藏品(spec §4.5 开箱即结算)', () => {
    const kinds = new Set(CHESTS.map(c => c.loot.type))
    expect(kinds.has('coins')).toBe(true)
    expect(kinds.has('bait')).toBe(true)
    expect(kinds.has('collectible')).toBe(true)
  })

  it('鱼饵掉落引用真实饵目录(拼写错挡在测试;目录外由 wallet 忽略兜底)', () => {
    for (const c of CHESTS) {
      const loot = c.loot
      if (loot.type !== 'bait') continue
      expect(BAITS.some(b => b.id === loot.baitId)).toBe(true)
      expect(Number.isInteger(loot.count)).toBe(true)
      expect(loot.count).toBeGreaterThan(0)
    }
  })

  it('收藏品掉落引用收藏品目录(目录由本票填充,store/面板自动跟随)', () => {
    for (const c of CHESTS) {
      const loot = c.loot
      if (loot.type !== 'collectible') continue
      expect(COLLECTIBLES.some(x => x.id === loot.collectibleId)).toBe(true)
    }
  })

  it('金币掉落为正整数(开箱即 wallet.earn 的入参契约)', () => {
    for (const c of CHESTS) {
      if (c.loot.type !== 'coins') continue
      expect(Number.isInteger(c.loot.coins)).toBe(true)
      expect(c.loot.coins).toBeGreaterThan(0)
    }
  })

  it('chestDef:id 查表命中;目录外 = null(解析期与快照校验共用)', () => {
    expect(chestDef(CHESTS[0]!.id)).toBe(CHESTS[0])
    expect(chestDef('不存在')).toBeNull()
  })
})

describe('宝箱文案(纯函数:开箱浮签/提示单源)', () => {
  it('chestLootText:金币 → 「30 金币」;鱼饵 → 「香饵 ×5」;收藏品 → 目录名', () => {
    expect(chestLootText({ type: 'coins', coins: 30 })).toBe('30 金币')
    expect(chestLootText({ type: 'bait', baitId: 'xianger', count: 5 })).toBe('香饵 ×5')
    expect(chestLootText({ type: 'collectible', collectibleId: 'pearl' })).toBe('河蚌珍珠')
  })

  it('chestOpenToastText:宝箱名 + 冒号 + 掉落摘要', () => {
    expect(chestOpenToastText({ id: 'x', name: '篱笆角的宝箱', loot: { type: 'coins', coins: 30 } })).toBe(
      '篱笆角的宝箱:30 金币',
    )
  })
})

describe('钓上宝箱掉落池(票 #56:柳纹木雕改钓获专属,世界宝箱表不再掉出)', () => {
  it('世界宝箱表零柳纹木雕(表驱动断言;树影的宝箱改掉浓饵 ×3,独立字面量)', () => {
    for (const c of CHESTS) {
      if (c.loot.type !== 'collectible') continue
      expect(c.loot.collectibleId, `${c.id} 不应再掉柳纹木雕`).not.toBe('willow-carving')
    }
    expect(chestDef('village-grove')!.loot).toEqual({ type: 'bait', baitId: 'nonger', count: 3 })
  })

  it('钓上宝箱池是柳纹木雕唯一产出入口(恰一条,收藏品目录内)', () => {
    const willow = FISHING_CHEST_LOOTS.filter(l => l.type === 'collectible' && l.collectibleId === 'willow-carving')
    expect(willow).toHaveLength(1)
    expect(COLLECTIBLES.some(x => x.id === 'willow-carving')).toBe(true)
  })

  it('池复用世界宝箱内容表:世界表每份掉落都在池中(增删自动跟随)', () => {
    for (const c of CHESTS) expect(FISHING_CHEST_LOOTS).toContain(c.loot)
  })

  it('池覆盖三类掉落:金币 / 鱼饵 / 收藏品(组合根发放路径全 reachable)', () => {
    const kinds = new Set(FISHING_CHEST_LOOTS.map(l => l.type))
    expect(kinds.has('coins')).toBe(true)
    expect(kinds.has('bait')).toBe(true)
    expect(kinds.has('collectible')).toBe(true)
  })

  it('池内引用全部有效:鱼饵/收藏品目录内、金币正整数(与世界表同纪律)', () => {
    for (const loot of FISHING_CHEST_LOOTS) {
      if (loot.type === 'bait') expect(BAITS.some(b => b.id === loot.baitId)).toBe(true)
      if (loot.type === 'collectible') expect(COLLECTIBLES.some(x => x.id === loot.collectibleId)).toBe(true)
      if (loot.type === 'coins') expect(loot.coins).toBeGreaterThan(0)
    }
  })

  it('fishingChestToastText:「钓上的宝箱:掉落摘要」(捕获沿 toast 单源)', () => {
    expect(fishingChestToastText({ type: 'collectible', collectibleId: 'willow-carving' })).toBe(
      '钓上的宝箱:柳纹木雕',
    )
    expect(fishingChestToastText({ type: 'coins', coins: 30 })).toBe('钓上的宝箱:30 金币')
  })
})
