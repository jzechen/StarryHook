import { describe, expect, it } from 'vitest'
import { BackpackStore } from '../core/backpack'
import { CoreLoop } from '../core/coreLoop'
import { FISH } from '../core/fishCatalog'
import { sellPriceFor, sessionQualityRng, rollQuality } from '../core/quality'
import { Rng } from '../core/rng'
import { WalletStore } from '../core/wallet'
import { memoryStorage } from '../testing/memoryStorage'
import { baitEffectSource, buyBaitOutcome, equippedBaitView, sellFishOutcome } from './economyWiring'

const DT = 1 / 60
const HOLD = { holding: true, moveX: 0, moveY: 0 }
const IDLE = { holding: false, moveX: 0, moveY: 0 }

/** 蓄满抛竿,进入等待(与 coreLoop.test.ts 同款驱动方式) */
function castFull(loop: CoreLoop): void {
  loop.update(DT, HOLD)
  for (let i = 0; i < Math.round(1 / DT); i++) loop.update(DT, HOLD)
  loop.update(DT, IDLE)
  expect(loop.phase).toBe('waiting')
}

describe('经济组合根接线(购饵回调 + 本竿饵效果来源)', () => {
  it('购买香饵即自动装备:商店买到的饵无需再找装备入口,效果实玩可达(review 缺口)', () => {
    const wallet = new WalletStore(memoryStorage())
    wallet.earn(30)
    expect(buyBaitOutcome(wallet)('xianger')).toBe('ok')
    expect(wallet.equippedBait()).toBe('xianger')
  })

  it('购买浓饵即自动装备:同一装备槽切换,原香饵余量不清', () => {
    const wallet = new WalletStore(memoryStorage())
    wallet.earn(100)
    const buy = buyBaitOutcome(wallet)
    buy('xianger')
    buy('nonger')
    expect(wallet.equippedBait()).toBe('nonger')
    expect(wallet.baitCount('xianger')).toBe(10) // 切换不清余量(wallet.equip 既有语义)
    expect(wallet.coins()).toBe(20) // 100 − 30(香饵)− 50(浓饵)
  })

  it('余额不足购买被拒:反馈 insufficient,不扣款、不入库存、不装备', () => {
    const wallet = new WalletStore(memoryStorage())
    wallet.earn(29)
    expect(buyBaitOutcome(wallet)('nonger')).toBe('insufficient')
    expect(wallet.coins()).toBe(29)
    expect(wallet.baitCount('nonger')).toBe(0)
    expect(wallet.equippedBait()).toBeNull()
  })

  it('目录外饵 id 映射为无意义购买:不扣款、不装备,不抛错', () => {
    const wallet = new WalletStore(memoryStorage())
    wallet.earn(100)
    expect(buyBaitOutcome(wallet)('幽灵饵')).toBe('meaningless')
    expect(wallet.equippedBait()).toBeNull()
  })
})

describe('装备链路全链(组合层集成:购买 → 装备 → 抛竿消耗 → 生效)', () => {
  it('购买香饵 → 自动装备 → 抛竿消耗一支 → 等待时长减半生效', () => {
    const wallet = new WalletStore(memoryStorage())
    const core = new CoreLoop(new Rng(42))
    core.setInteractionSource(() => ({ kind: 'spot' })) // 票 #36:抛竿须在钓位范围内
    core.setBaitEffectSource(baitEffectSource(wallet))

    wallet.earn(30)
    expect(buyBaitOutcome(wallet)('xianger')).toBe('ok') // 购买(自动装备)
    expect(wallet.equippedBait()).toBe('xianger')

    castFull(core) // 抛竿:来源被调用恰好一次,消耗一支并生效
    // 期望值独立导出(与核心缝测试同源):mulberry32(42) 首抽 u = 0.6011037519201636,
    // 系数 0.5 → 1.5×0.5 + 4.5×0.5 × u
    expect(core.waitTime).toBeCloseTo(2.102483441820368, 10)
    expect(wallet.baitCount('xianger')).toBe(9) // 抛竿消耗一支
  })

  it('浓饵接线产出浓饵效果:装备浓饵且消耗成功 → { waitScale 1, richBait true }(等待不减半)', () => {
    const wallet = new WalletStore(memoryStorage())
    wallet.earn(1000)
    expect(buyBaitOutcome(wallet)('nonger')).toBe('ok')
    const source = baitEffectSource(wallet)
    expect(source()).toEqual({ waitScale: 1, richBait: true })
    expect(wallet.baitCount('nonger')).toBe(9) // 同一次调用恰好消耗一支
  })

  it('未装备 → null;耗尽后 → null 且不再产生负库存(效果自动回退现行)', () => {
    const wallet = new WalletStore(memoryStorage())
    const source = baitEffectSource(wallet)
    expect(source()).toBeNull() // 未装备:不消耗任何库存

    wallet.earn(30)
    expect(buyBaitOutcome(wallet)('xianger')).toBe('ok')
    for (let i = 0; i < 10; i += 1) {
      // 每竿生效且恰好消耗一支,余量逐竿递减
      expect(source()).toEqual({ waitScale: 0.5, richBait: false })
      expect(wallet.baitCount('xianger')).toBe(9 - i)
    }
    expect(source()).toBeNull() // 耗尽:本竿无饵效果,状态原样
    expect(wallet.baitCount('xianger')).toBe(0)
  })

  it('装备饵视图(顶栏徽章入参):未装备 → null;装备浓饵 → 饵名 + 实时余量', () => {
    const wallet = new WalletStore(memoryStorage())
    expect(equippedBaitView(wallet)).toBeNull()
    wallet.earn(1000)
    expect(buyBaitOutcome(wallet)('nonger')).toBe('ok')
    expect(wallet.consumeBaitForCast()).toBe(true) // 抛竿消耗一支
    expect(equippedBaitView(wallet)).toEqual({ name: '浓饵', count: 9 })
  })
})

describe('摊位卖鱼接线(接缝:sellFishOutcome,取出渔获 + earn 分值×品质倍率,票 #39)', () => {
  it('单卖:取 1 条入账单价(10 分 × 银星 1.5 = 15),背包同步减少', () => {
    const wallet = new WalletStore(memoryStorage())
    const backpack = new BackpackStore(FISH.map(f => f.id))
    backpack.addFish('xiaobaitiao', 'silver')
    expect(sellFishOutcome(backpack, wallet)('xiaobaitiao', 'silver', 1)).toBe('ok')
    expect(wallet.coins()).toBe(15)
    expect(backpack.count('xiaobaitiao', 'silver')).toBe(0)
  })

  it('全卖:入账 = 单价 × 条数(25 分金星 ×2 = 50/条,3 条 = 150),普通星 = 原分值', () => {
    const wallet = new WalletStore(memoryStorage())
    const backpack = new BackpackStore(FISH.map(f => f.id))
    for (let i = 0; i < 3; i++) backpack.addFish('qianzhuinian', 'gold')
    for (let i = 0; i < 2; i++) backpack.addFish('wenzhongji', 'normal')
    const sell = sellFishOutcome(backpack, wallet)
    expect(sell('qianzhuinian', 'gold', 3)).toBe('ok')
    expect(sell('wenzhongji', 'normal', 2)).toBe('ok')
    expect(wallet.coins()).toBe(50 * 3 + 15 * 2)
    expect(backpack.entries()).toEqual([])
  })

  it('空堆叠/目录外鱼种 → empty:不取货、不入账,状态原样', () => {
    const wallet = new WalletStore(memoryStorage())
    const backpack = new BackpackStore(FISH.map(f => f.id))
    const sell = sellFishOutcome(backpack, wallet)
    expect(sell('xiaobaitiao', 'normal', 1)).toBe('empty')
    expect(sell('幽灵鱼', 'gold', 1)).toBe('empty')
    expect(wallet.coins()).toBe(0)
    expect(backpack.entries()).toEqual([])
  })

  it('count 超出余量按余量钳制(全卖语义):卖 5 条只有 2 条 → 入账 2 条的价', () => {
    const wallet = new WalletStore(memoryStorage())
    const backpack = new BackpackStore(FISH.map(f => f.id))
    for (let i = 0; i < 2; i++) backpack.addFish('shandiansuo', 'silver') // 50 × 1.5 = 75
    expect(sellFishOutcome(backpack, wallet)('shandiansuo', 'silver', 5)).toBe('ok')
    expect(wallet.coins()).toBe(75 * 2)
    expect(backpack.count('shandiansuo', 'silver')).toBe(0)
  })

  it('经济链路全链(组合层集成:捕获入包不入账 → 摊位全卖入账)', () => {
    const wallet = new WalletStore(memoryStorage())
    const backpack = new BackpackStore(FISH.map(f => f.id))
    const core = new CoreLoop(new Rng(42))
    core.setInteractionSource(() => ({ kind: 'spot' })) // 票 #36:抛竿须在钓位范围内
    // 有意规格变更(票 #39):捕获沿改向——wallet.earn 不再被调用,渔获入背包
    const caught: { id: string; quality: ReturnType<typeof rollQuality>; score: number }[] = []
    for (let seed = 1; seed <= 80 && caught.length === 0; seed++) {
      const c = new CoreLoop(new Rng(seed))
      c.setInteractionSource(() => ({ kind: 'spot' }))
      c.update(DT, HOLD)
      for (let i = 0; i < Math.round(1 / DT); i++) c.update(DT, HOLD)
      c.update(DT, IDLE)
      for (let i = 0; i < Math.round(10 / DT) && c.phase === 'waiting'; i++) c.update(DT, IDLE)
      c.update(DT, HOLD) // 咬钩窗口内起竿
      for (let i = 0; i < Math.round(60 / DT) && c.phase !== 'caught' && c.phase !== 'escaped'; i++)
        c.update(DT, HOLD)
      if (c.phase === 'caught' && c.fish) {
        caught.push({ id: c.fish.id, quality: c.caughtQuality, score: c.fish.score })
        backpack.addFish(c.fish.id, c.caughtQuality) // 组合根捕获沿同款接线
      }
    }
    expect(caught.length).toBe(1)
    expect(wallet.coins()).toBe(0) // 捕获不再即时入账(票 #39 有意规格变更)
    expect(backpack.count(caught[0]!.id, caught[0]!.quality)).toBe(1)
    expect(sellFishOutcome(backpack, wallet)(caught[0]!.id, caught[0]!.quality, 1)).toBe('ok')
    expect(wallet.coins()).toBe(sellPriceFor(caught[0]!.score, caught[0]!.quality))
  })

  it('限时局渔获照入背包:模式层零感知(限时局捕获同样入包)', () => {
    const backpack = new BackpackStore(FISH.map(f => f.id))
    const core = new CoreLoop(new Rng(42))
    core.setInteractionSource(() => ({ kind: 'spot' }))
    expect(core.setMode('timed')).toBe(true)
    let added = 0
    for (let seed = 1; seed <= 80 && added === 0; seed++) {
      const c = new CoreLoop(new Rng(seed), { weather: 'sunny' })
      c.setInteractionSource(() => ({ kind: 'spot' }))
      expect(c.setMode('timed')).toBe(true)
      c.update(DT, HOLD)
      for (let i = 0; i < Math.round(1 / DT); i++) c.update(DT, HOLD)
      c.update(DT, IDLE)
      for (let i = 0; i < Math.round(10 / DT) && c.phase === 'waiting'; i++) c.update(DT, IDLE)
      c.update(DT, HOLD)
      for (let i = 0; i < Math.round(60 / DT) && c.phase !== 'caught' && c.phase !== 'escaped'; i++)
        c.update(DT, HOLD)
      if (c.phase === 'caught' && c.fish) {
        backpack.addFish(c.fish.id, c.caughtQuality)
        added++
        expect(backpack.count(c.fish.id, c.caughtQuality)).toBe(1)
        // 品质 roll 与天气/主序列解耦:同种子下与无限局同品质(独立派生种子同源)
        expect(c.caughtQuality).toBe(rollQuality(sessionQualityRng(seed), 1))
      }
    }
    expect(added).toBe(1)
  })
})
