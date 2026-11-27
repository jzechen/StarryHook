import { describe, expect, it } from 'vitest'
import { CoreLoop } from '../core/coreLoop'
import { Rng } from '../core/rng'
import { WalletStore } from '../core/wallet'
import { memoryStorage } from '../testing/memoryStorage'
import { baitEffectSource, buyBaitOutcome, equippedBaitView } from './economyWiring'

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
