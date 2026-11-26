import { describe, expect, it } from 'vitest'
import { ProgressionStore } from './progression'
import { CoreLoop } from './coreLoop'
import { Rng } from './rng'
import { memoryStorage } from '../testing/memoryStorage'
import type { KvStorage } from './collection'

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

describe('ProgressionStore(接缝:成长)', () => {
  it('初始状态:1 级 / 0 经验 / 竹竿', () => {
    const s = new ProgressionStore(memoryStorage())
    expect(s.level()).toBe(1)
    expect(s.xp()).toBe(0)
    expect(s.rod().id).toBe('zhugan')
  })

  it('经验登记非幂等:每次捕获都累加分值(与图鉴的幂等语义不同)', () => {
    const s = new ProgressionStore(memoryStorage())
    const a = s.recordCatch(10)
    const b = s.recordCatch(10)
    const c = s.recordCatch(10)
    expect(s.xp()).toBe(30)
    for (const r of [a, b, c]) {
      expect(r.levelsGained).toBe(0)
      expect(r.rodUnlocked).toBeNull()
    }
  })

  it('阈值边界·恰好达到:1 级需 150 经验,恰好凑满即升级并清空当级经验', () => {
    const s = new ProgressionStore(memoryStorage())
    const r = s.recordCatch(150)
    expect(r.levelsGained).toBe(1)
    expect(s.level()).toBe(2)
    expect(s.xp()).toBe(0)
  })

  it('阈值边界·差一点:149 不升级,等级与经验原样保留', () => {
    const s = new ProgressionStore(memoryStorage())
    const r = s.recordCatch(149)
    expect(r.levelsGained).toBe(0)
    expect(s.level()).toBe(1)
    expect(s.xp()).toBe(149)
  })

  it('阈值边界·补足:差一点后再凑 1 分,立即升级(升后扣除)', () => {
    const s = new ProgressionStore(memoryStorage())
    s.recordCatch(149)
    const r = s.recordCatch(1)
    expect(r.levelsGained).toBe(1)
    expect(s.level()).toBe(2)
    expect(s.xp()).toBe(0)
  })

  it('高等级阈值递增:2 级升 3 级需 300(150 × 当前等级)', () => {
    const s = new ProgressionStore(memoryStorage())
    s.recordCatch(150) // → 2 级
    const r = s.recordCatch(299)
    expect(r.levelsGained).toBe(0)
    expect(s.level()).toBe(2)
    expect(s.xp()).toBe(299)
    s.recordCatch(1) // 恰好 300 → 3 级
    expect(s.level()).toBe(3)
    expect(s.xp()).toBe(0)
  })

  it('一竿连升多级:一笔 460 经验从 1 级连升到 3 级,解锁碳竿', () => {
    const s = new ProgressionStore(memoryStorage())
    const r = s.recordCatch(460) // 150 升 2 级余 310,再 300 升 3 级余 10
    expect(r.levelsGained).toBe(2)
    expect(s.level()).toBe(3)
    expect(s.xp()).toBe(10)
    expect(r.rodUnlocked?.id).toBe('tangan')
  })

  it('连升多级跨过 L3 但未到 L6:按最终竿返回碳竿,而非中途竿', () => {
    const s = new ProgressionStore(memoryStorage())
    const r = s.recordCatch(1000) // 150+300+450 → 4 级余 100
    expect(r.levelsGained).toBe(3)
    expect(s.level()).toBe(4)
    expect(r.rodUnlocked?.id).toBe('tangan')
  })

  it('未达解锁等级不解锁:2 级、4~5 级仍在碳竿,rodUnlocked 为 null', () => {
    const s = new ProgressionStore(memoryStorage())
    s.recordCatch(150) // → 2 级:尚未到 L3
    expect(s.rod().id).toBe('zhugan')
    expect(s.recordCatch(100).rodUnlocked).toBeNull()
    s.recordCatch(450) // 累计 550:300 升 3 级,余 250 不到 L4 的 450
    expect(s.rod().id).toBe('tangan')
    s.recordCatch(600) // 累计 850:450 升 4 级,余 400 不到 L5 的 600
    expect(s.rod().id).toBe('tangan')
    expect(s.recordCatch(100).rodUnlocked).toBeNull()
  })

  it('达到 L6 解锁星钩:从 0 一笔 2250 连升 5 级,最终竿为星钩', () => {
    const s = new ProgressionStore(memoryStorage())
    const r = s.recordCatch(2250) // 150+300+450+600+750
    expect(r.levelsGained).toBe(5)
    expect(s.level()).toBe(6)
    expect(s.xp()).toBe(0)
    expect(r.rodUnlocked?.id).toBe('xinggou')
  })

  it('超过 L6 后竿不再变化:6 级升 7 级需 900(150 × 6),rodUnlocked 为 null', () => {
    const s = new ProgressionStore(memoryStorage())
    s.recordCatch(2250) // → 6 级星钩
    const r = s.recordCatch(899)
    expect(r.levelsGained).toBe(0)
    expect(s.recordCatch(1).levelsGained).toBe(1)
    expect(s.level()).toBe(7)
    expect(s.rod().id).toBe('xinggou')
  })
})

describe('ProgressionStore 持久化与降级', () => {
  it('持久化往返:新实例恢复等级/经验,竿由恢复的等级推导', () => {
    const storage = memoryStorage()
    const a = new ProgressionStore(storage)
    a.recordCatch(150) // → 2 级
    a.recordCatch(320) // 2 级需 300 → 3 级余 20
    expect(a.level()).toBe(3)
    expect(a.xp()).toBe(20)
    const b = new ProgressionStore(storage)
    expect(b.level()).toBe(3)
    expect(b.xp()).toBe(20)
    expect(b.rod().id).toBe('tangan')
  })

  it('持久化只存 {经验, 等级}:竿不落盘,由等级推导', () => {
    const storage = memoryStorage()
    const a = new ProgressionStore(storage)
    a.recordCatch(150)
    const raw = JSON.parse(storage.get('starryhook:progression')!) as Record<string, unknown>
    expect(Object.keys(raw).sort()).toEqual(['level', 'xp'])
  })

  it('空存储:按初始状态处理,不抛错', () => {
    const s = new ProgressionStore(memoryStorage())
    expect(s.level()).toBe(1)
    expect(s.xp()).toBe(0)
    expect(s.rod().id).toBe('zhugan')
  })

  it('存储数据损坏(非法 JSON):按初始状态处理,不抛错,且损坏被覆盖', () => {
    const storage = memoryStorage()
    storage.set('starryhook:progression', '{{{not json')
    const s = new ProgressionStore(storage)
    expect(s.level()).toBe(1)
    expect(s.xp()).toBe(0)
    expect(() => s.recordCatch(150)).not.toThrow()
    expect(s.level()).toBe(2)
  })

  it('损坏字段各自降级:非法 xp 归 0,合法 level 照常恢复(逐字段过滤,与图鉴同款)', () => {
    const storage = memoryStorage()
    storage.set('starryhook:progression', JSON.stringify({ xp: '很多', level: 2 }))
    const s = new ProgressionStore(storage)
    expect(s.xp()).toBe(0)
    expect(s.level()).toBe(2)
    expect(s.rod().id).toBe('zhugan')
  })

  it('越界字段降级:负经验归 0,非整数/低于 1 的等级归 1', () => {
    const storage = memoryStorage()
    storage.set('starryhook:progression', JSON.stringify({ xp: -10, level: 2.5 }))
    const s = new ProgressionStore(storage)
    expect(s.xp()).toBe(0)
    expect(s.level()).toBe(1)
  })

  it('写入失败不影响游戏:升级增量照常返回,状态留在内存', () => {
    const s = new ProgressionStore(brokenWriteStorage())
    const r = s.recordCatch(150)
    expect(r.levelsGained).toBe(1)
    expect(r.rodUnlocked).toBeNull()
    expect(s.level()).toBe(2)
    expect(s.xp()).toBe(0)
  })
})

describe('成长与核心循环互不干扰(接缝:组合)', () => {
  it('「重开」只清得分:CoreLoop.resetSession 不动成长,竿参数注入继续生效', () => {
    const core = new CoreLoop(new Rng(42))
    const s = new ProgressionStore(memoryStorage())
    core.setRodParams(s.rod().params)
    core.score = 120
    s.recordCatch(460) // → 3 级碳竿
    core.resetSession()
    expect(core.score).toBe(0)
    expect(s.level()).toBe(3)
    expect(s.xp()).toBe(10)
    expect(s.rod().id).toBe('tangan')
  })
})
