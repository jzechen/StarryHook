import { describe, expect, it } from 'vitest'
import { WalletStore } from './wallet'
import { memoryStorage } from '../testing/memoryStorage'
import type { KvStorage } from './kvSnapshot'

describe('WalletStore(接缝:经济)', () => {
  it('初始状态:0 金币,两种鱼饵各 0,未装备', () => {
    const s = new WalletStore(memoryStorage())
    expect(s.coins()).toBe(0)
    expect(s.baitCount('xianger')).toBe(0)
    expect(s.baitCount('nonger')).toBe(0)
    expect(s.equippedBait()).toBeNull()
  })

  it('捕获入账累加:金币 = 鱼分值,每次捕获都加(与经验同款非幂等)', () => {
    const s = new WalletStore(memoryStorage())
    s.earn(10)
    s.earn(25)
    s.earn(10)
    expect(s.coins()).toBe(45)
  })

  it('消费成功扣减:余额足够则扣款并反馈成功', () => {
    const s = new WalletStore(memoryStorage())
    s.earn(120)
    expect(s.spend(50)).toEqual({ ok: true })
    expect(s.coins()).toBe(70)
  })

  it('消费恰好等于余额:成功并归零', () => {
    const s = new WalletStore(memoryStorage())
    s.earn(70)
    expect(s.spend(70)).toEqual({ ok: true })
    expect(s.coins()).toBe(0)
  })

  it('余额不足拒绝:反馈不足原因,余额原样不动(不会扣成负数)', () => {
    const s = new WalletStore(memoryStorage())
    s.earn(70)
    expect(s.spend(80)).toEqual({ ok: false, reason: 'insufficient' })
    expect(s.coins()).toBe(70)
  })

  it('空钱包消费一律拒绝:状态不变', () => {
    const s = new WalletStore(memoryStorage())
    expect(s.spend(1)).toEqual({ ok: false, reason: 'insufficient' })
    expect(s.coins()).toBe(0)
  })

  it('非法金额(0/负数/非有限数)拒绝:余额不变,不抛错', () => {
    const s = new WalletStore(memoryStorage())
    s.earn(50)
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(s.spend(bad).ok).toBe(false)
    }
    expect(s.coins()).toBe(50)
  })

  it('购饵成功:扣价格金币,该饵余量 +10(单次购买竿数),另一种饵不受影响', () => {
    const s = new WalletStore(memoryStorage())
    s.earn(100)
    expect(s.buyBait('xianger')).toEqual({ ok: true })
    expect(s.coins()).toBe(70) // 100 − 30(香饵价格)
    expect(s.baitCount('xianger')).toBe(10)
    expect(s.baitCount('nonger')).toBe(0)
  })

  it('购饵余额不足:拒绝,金币与两种饵库存均原样不动', () => {
    const s = new WalletStore(memoryStorage())
    s.earn(29)
    expect(s.buyBait('nonger')).toEqual({ ok: false, reason: 'insufficient' })
    expect(s.coins()).toBe(29)
    expect(s.baitCount('nonger')).toBe(0)
  })

  it('购未知饵拒绝:金币不变,不抛错', () => {
    const s = new WalletStore(memoryStorage())
    s.earn(100)
    expect(s.buyBait('幽灵饵').ok).toBe(false)
    expect(s.coins()).toBe(100)
  })

  it('重复购饵累加:余量在既有基数上继续加,不清旧余量', () => {
    const s = new WalletStore(memoryStorage())
    s.earn(1000)
    s.buyBait('xianger')
    s.buyBait('xianger')
    expect(s.baitCount('xianger')).toBe(20)
    expect(s.coins()).toBe(940)
  })

  it('宝箱鱼饵直加(票 #41):无扣款入库指定竿数,金币原样不动', () => {
    const s = new WalletStore(memoryStorage())
    s.earn(12)
    s.grantBait('xianger', 5)
    expect(s.baitCount('xianger')).toBe(5)
    expect(s.coins()).toBe(12)
  })

  it('宝箱鱼饵直加:在既有余量上累加,不覆盖、不动装备槽', () => {
    const s = new WalletStore(memoryStorage())
    s.grantBait('xianger', 5)
    s.equip('nonger')
    s.grantBait('xianger', 3)
    expect(s.baitCount('xianger')).toBe(8)
    expect(s.equippedBait()).toBe('nonger')
  })

  it('宝箱鱼饵直加:目录外饵 id / 非正数量忽略(与目录外忽略纪律一致)', () => {
    const s = new WalletStore(memoryStorage())
    s.grantBait('幽灵饵', 5)
    s.grantBait('xianger', 0)
    s.grantBait('xianger', -2)
    expect(s.baitCount('幽灵饵')).toBe(0)
    expect(s.baitCount('xianger')).toBe(0)
  })

  it('装备槽同时一种:装备香饵后再装备浓饵,槽位切换且双方余量都不清', () => {
    const s = new WalletStore(memoryStorage())
    s.earn(1000)
    s.buyBait('xianger')
    s.buyBait('nonger')
    s.equip('xianger')
    expect(s.equippedBait()).toBe('xianger')
    s.equip('nonger')
    expect(s.equippedBait()).toBe('nonger')
    expect(s.baitCount('xianger')).toBe(10) // 切换不清余量
    expect(s.baitCount('nonger')).toBe(10)
  })

  it('装备未知饵被忽略:槽位不变,不抛错', () => {
    const s = new WalletStore(memoryStorage())
    s.equip('xianger')
    s.equip('幽灵饵')
    expect(s.equippedBait()).toBe('xianger')
  })

  it('空手装备(未购买过)也允许:余量 0,装备只定槽位不生效', () => {
    const s = new WalletStore(memoryStorage())
    s.equip('nonger')
    expect(s.equippedBait()).toBe('nonger')
    expect(s.baitCount('nonger')).toBe(0)
  })

  it('抛竿消耗:装备且有余量时消耗一支并反馈生效', () => {
    const s = new WalletStore(memoryStorage())
    s.earn(100)
    s.buyBait('xianger')
    s.equip('xianger')
    expect(s.consumeBaitForCast()).toBe(true)
    expect(s.baitCount('xianger')).toBe(9)
    expect(s.coins()).toBe(70) // 抛竿不扣钱,只扣饵
  })

  it('抛竿连续消耗至耗尽:第 10 次仍生效,第 11 次不再生效(耗尽由状态表达)', () => {
    const s = new WalletStore(memoryStorage())
    s.earn(100)
    s.buyBait('xianger')
    s.equip('xianger')
    for (let i = 0; i < 10; i += 1) expect(s.consumeBaitForCast()).toBe(true)
    expect(s.baitCount('xianger')).toBe(0)
    expect(s.consumeBaitForCast()).toBe(false)
    expect(s.equippedBait()).toBe('xianger') // 槽位保留,补货即恢复生效
  })

  it('未装备时抛竿:不消耗任何饵,反馈未生效', () => {
    const s = new WalletStore(memoryStorage())
    s.earn(100)
    s.buyBait('xianger')
    expect(s.consumeBaitForCast()).toBe(false)
    expect(s.baitCount('xianger')).toBe(10)
  })

  it('装备的饵耗尽后抛竿:不产生负数,另一种饵的余量不受牵连', () => {
    const s = new WalletStore(memoryStorage())
    s.earn(1000)
    s.buyBait('xianger')
    s.buyBait('nonger')
    s.equip('xianger')
    for (let i = 0; i < 10; i += 1) s.consumeBaitForCast()
    expect(s.consumeBaitForCast()).toBe(false)
    expect(s.baitCount('xianger')).toBe(0)
    expect(s.baitCount('nonger')).toBe(10) // 浓饵独立计数,不被误耗
  })
})

describe('WalletStore 持久化与降级', () => {
  /** 写入必失败的替身:读侧透传,写侧抛错(隐私模式/配额边界) */
  function brokenWriteStorage(): KvStorage {
    const inner = memoryStorage()
    return {
      get: key => inner.get(key),
      set: () => {
        throw new Error('quota exceeded')
      },
    }
  }

  it('持久化往返:金币/两种饵余量/装备槽在新实例上完整恢复', () => {
    const storage = memoryStorage()
    const a = new WalletStore(storage)
    a.earn(120)
    a.buyBait('xianger')
    a.buyBait('nonger')
    a.consumeBaitForCast() // 未装备,不动库存
    a.equip('xianger')
    a.consumeBaitForCast()
    a.consumeBaitForCast()
    const b = new WalletStore(storage)
    expect(b.coins()).toBe(40) // 120 − 30(香饵)− 50(浓饵)
    expect(b.baitCount('xianger')).toBe(8)
    expect(b.baitCount('nonger')).toBe(10)
    expect(b.equippedBait()).toBe('xianger')
  })

  it('独立键名:只写 starryhook:wallet,图鉴/成长的既有快照原样不动', () => {
    const storage = memoryStorage()
    const collectionRaw = '{"collected":[],"completionAcknowledged":false}'
    const progressionRaw = '{"xp":5,"level":1}'
    storage.set('starryhook:collection', collectionRaw)
    storage.set('starryhook:progression', progressionRaw)
    const s = new WalletStore(storage)
    s.earn(10)
    s.buyBait('xianger')
    expect(storage.get('starryhook:wallet')).not.toBeNull()
    expect(storage.get('starryhook:collection')).toBe(collectionRaw)
    expect(storage.get('starryhook:progression')).toBe(progressionRaw)
  })

  it('空存储:按初始状态处理,不抛错', () => {
    const s = new WalletStore(memoryStorage())
    expect(s.coins()).toBe(0)
    expect(s.baitCount('xianger')).toBe(0)
    expect(s.equippedBait()).toBeNull()
  })

  it('存储数据损坏(非法 JSON):按初始状态处理,不抛错,且损坏被覆盖', () => {
    const storage = memoryStorage()
    storage.set('starryhook:wallet', '{{{not json')
    const s = new WalletStore(storage)
    expect(s.coins()).toBe(0)
    expect(() => s.earn(10)).not.toThrow()
    expect(s.coins()).toBe(10)
  })

  it('损坏字段各自降级:非法金币归 0,合法的饵余量照常恢复(逐字段过滤)', () => {
    const storage = memoryStorage()
    storage.set(
      'starryhook:wallet',
      JSON.stringify({ coins: '一大笔', baits: { xianger: 7 }, equipped: null }),
    )
    const s = new WalletStore(storage)
    expect(s.coins()).toBe(0)
    expect(s.baitCount('xianger')).toBe(7)
  })

  it('越界字段降级:负金币归 0,负数/非整数饵计数归 0,目录外饵与未知装备被过滤', () => {
    const storage = memoryStorage()
    storage.set(
      'starryhook:wallet',
      JSON.stringify({
        coins: -10,
        baits: { xianger: -3, nonger: 2.5, '幽灵饵': 99, huaiwei: 4 },
        equipped: '幽灵饵',
      }),
    )
    const s = new WalletStore(storage)
    expect(s.coins()).toBe(0)
    expect(s.baitCount('xianger')).toBe(0)
    expect(s.baitCount('nonger')).toBe(0)
    expect(s.baitCount('幽灵饵')).toBe(0)
    expect(s.equippedBait()).toBeNull()
  })

  it('越界降级不殃及好数据:合法金币与合法饵计数、合法装备照常恢复', () => {
    const storage = memoryStorage()
    storage.set(
      'starryhook:wallet',
      JSON.stringify({
        coins: 66,
        baits: { xianger: -3, nonger: 5 },
        equipped: 'nonger',
      }),
    )
    const s = new WalletStore(storage)
    expect(s.coins()).toBe(66)
    expect(s.baitCount('nonger')).toBe(5)
    expect(s.equippedBait()).toBe('nonger')
  })

  it('装备指向余量 0 的饵:槽位照常恢复,抛竿不生效(耗尽语义随状态走)', () => {
    const storage = memoryStorage()
    storage.set(
      'starryhook:wallet',
      JSON.stringify({ coins: 0, baits: { xianger: 0 }, equipped: 'xianger' }),
    )
    const s = new WalletStore(storage)
    expect(s.equippedBait()).toBe('xianger')
    expect(s.consumeBaitForCast()).toBe(false)
  })

  it('写入失败不影响游戏:入账/购饵/消耗的增量照常,状态留在内存', () => {
    const s = new WalletStore(brokenWriteStorage())
    s.earn(100)
    expect(s.buyBait('xianger')).toEqual({ ok: true })
    s.equip('xianger')
    expect(s.consumeBaitForCast()).toBe(true)
    expect(s.coins()).toBe(70)
    expect(s.baitCount('xianger')).toBe(9)
  })
})
