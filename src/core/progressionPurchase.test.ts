import { describe, expect, it } from 'vitest'
import { ProgressionStore } from './progression'
import { BAITS, RODS } from '../config'
import { memoryStorage } from '../testing/memoryStorage'

describe('竿表与饵表调参叶(接缝:配置)', () => {
  it('每档竿都有非负价格,且档位越高不更便宜(商店可售)', () => {
    for (const rod of RODS) {
      expect(Number.isFinite(rod.price)).toBe(true)
      expect(rod.price).toBeGreaterThanOrEqual(0)
    }
    for (let i = 1; i < RODS.length; i += 1) {
      expect(RODS[i].price).toBeGreaterThanOrEqual(RODS[i - 1].price)
    }
  })

  it('每种饵价格与单次竿数为正数(起步调参叶)', () => {
    for (const bait of BAITS) {
      expect(bait.price).toBeGreaterThan(0)
      expect(bait.charges).toBeGreaterThan(0)
      expect(Number.isInteger(bait.charges)).toBe(true)
    }
  })
})

describe('ProgressionStore 购竿(接缝:成长·已购集合)', () => {
  it('级不够亦可购买:1 级买碳竿立即解锁并切换为当前竿', () => {
    const s = new ProgressionStore(memoryStorage())
    expect(s.level()).toBe(1)
    expect(s.purchaseRod('tangan')?.id).toBe('tangan')
    expect(s.rod().id).toBe('tangan')
  })

  it('购买不改动经验与等级:只走金币外的解锁路径', () => {
    const s = new ProgressionStore(memoryStorage())
    s.purchaseRod('xinggou')
    expect(s.level()).toBe(1)
    expect(s.xp()).toBe(0)
    expect(s.rod().id).toBe('xinggou')
  })

  it('已等级解锁的竿购买被拒(购买无意义):返回 null,当前竿不变', () => {
    const s = new ProgressionStore(memoryStorage())
    s.recordCatch(460) // → 3 级碳竿
    expect(s.purchaseRod('tangan')).toBeNull()
    expect(s.rod().id).toBe('tangan')
  })

  it('重复购买同一竿被拒:返回 null', () => {
    const s = new ProgressionStore(memoryStorage())
    expect(s.purchaseRod('tangan')?.id).toBe('tangan')
    expect(s.purchaseRod('tangan')).toBeNull()
    expect(s.rod().id).toBe('tangan')
  })

  it('目录外竿 id 拒绝:返回 null,不抛错,当前竿不变', () => {
    const s = new ProgressionStore(memoryStorage())
    expect(() => s.purchaseRod('幽灵竿')).not.toThrow()
    expect(s.purchaseRod('幽灵竿')).toBeNull()
    expect(s.rod().id).toBe('zhugan')
  })

  it('购低档竿不降档:已持更高竿时购买被拒,当前竿保持', () => {
    const s = new ProgressionStore(memoryStorage())
    s.purchaseRod('xinggou')
    expect(s.purchaseRod('tangan')).toBeNull()
    expect(s.rod().id).toBe('xinggou')
  })

  it('已购集合持久:新实例恢复后竿仍为已购的高档竿(等级不够也保持)', () => {
    const storage = memoryStorage()
    const a = new ProgressionStore(storage)
    a.purchaseRod('xinggou')
    const b = new ProgressionStore(storage)
    expect(b.level()).toBe(1)
    expect(b.rod().id).toBe('xinggou')
  })

  it('购竿后等级解锁更高竿仍自动切换:1 级购碳竿,升到 3 级再升 6 级走星钩', () => {
    const s = new ProgressionStore(memoryStorage())
    s.purchaseRod('tangan')
    const r = s.recordCatch(2250) // 一笔连升 5 级到 6 级
    expect(s.level()).toBe(6)
    expect(s.rod().id).toBe('xinggou')
    expect(r.rodUnlocked?.id).toBe('xinggou')
  })

  it('已购最高竿后再升级:竿不再变化,rodUnlocked 为 null(不重复弹解锁)', () => {
    const s = new ProgressionStore(memoryStorage())
    s.purchaseRod('xinggou')
    const r = s.recordCatch(150) // 升 2 级
    expect(r.levelsGained).toBe(1)
    expect(r.rodUnlocked).toBeNull()
    expect(s.rod().id).toBe('xinggou')
  })

  it('竿可用性 = 等级解锁 ∪ 已购:purchaseRod 前高档不可用,购买后可用', () => {
    const s = new ProgressionStore(memoryStorage())
    expect(s.isRodUnlocked('tangan')).toBe(false)
    s.purchaseRod('tangan')
    expect(s.isRodUnlocked('tangan')).toBe(true)
    expect(s.isRodUnlocked('xinggou')).toBe(false)
  })

  it('向后兼容:旧存档只有成长主键(无已购集合键)→ 已购为空集,竿由等级推导(与现状一致)', () => {
    const storage = memoryStorage()
    storage.set('starryhook:progression', JSON.stringify({ xp: 20, level: 3 }))
    const s = new ProgressionStore(storage)
    expect(s.rod().id).toBe('tangan')
    expect(s.isRodUnlocked('xinggou')).toBe(false)
  })

  it('已购集合键损坏(非法 JSON):按空集处理,不抛错,成长主键不受牵连', () => {
    const storage = memoryStorage()
    storage.set('starryhook:progression', JSON.stringify({ xp: 20, level: 3 }))
    storage.set('starryhook:purchased-rods', '{{{not json')
    const s = new ProgressionStore(storage)
    expect(s.rod().id).toBe('tangan')
    expect(s.level()).toBe(3)
    expect(() => s.purchaseRod('xinggou')).not.toThrow()
    expect(s.rod().id).toBe('xinggou')
  })

  it('已购集合逐字段降级:目录外竿 id 过滤,目录内的照常恢复', () => {
    const storage = memoryStorage()
    storage.set('starryhook:purchased-rods', JSON.stringify({ purchased: ['幽灵竿', 'tangan'] }))
    const s = new ProgressionStore(storage)
    expect(s.rod().id).toBe('tangan')
    expect(s.isRodUnlocked('tangan')).toBe(true)
  })

  it('购买只写已购集合键:成长主键不被购买触碰,经验登记后主键仍只含两字段', () => {
    const storage = memoryStorage()
    const s = new ProgressionStore(storage)
    s.purchaseRod('xinggou')
    expect(storage.get('starryhook:progression')).toBeNull() // 纯购买不碰主键
    s.recordCatch(150)
    const raw = JSON.parse(storage.get('starryhook:progression')!) as Record<string, unknown>
    expect(Object.keys(raw).sort()).toEqual(['level', 'xp'])
  })

  it('已购集合独立落盘:键名 starryhook:purchased-rods,记录竿 id', () => {
    const storage = memoryStorage()
    const s = new ProgressionStore(storage)
    s.purchaseRod('tangan')
    const raw = JSON.parse(storage.get('starryhook:purchased-rods')!) as { purchased: string[] }
    expect(raw.purchased).toEqual(['tangan'])
  })
})
