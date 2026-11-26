import { describe, expect, it } from 'vitest'
import { RODS, TUNE, type BarParams } from './config'

/** 竹竿 = 现行手感:期望值用独立字面量,与 TUNE.bar 逐字对照(起点不变的硬约束) */
const BAMBOO: BarParams = {
  height: 0.28,
  vUp: 1.4,
  vDown: 1.15,
  response: 15,
  tapBoost: 0.55,
  bounce: 0.3,
}

/** 档间总幅度红线(spec #5:±15% 内) */
const STEP_LIMIT = 0.15

/** “方向只会更容易”:绿条更高 / 上升下沉更快 / 更跟手 / 脉冲更强 / 反弹更收敛 */
const EASIER_DIRECTION: { key: keyof BarParams; direction: 'up' | 'down' }[] = [
  { key: 'height', direction: 'up' },
  { key: 'vUp', direction: 'up' },
  { key: 'vDown', direction: 'up' },
  { key: 'response', direction: 'up' },
  { key: 'tapBoost', direction: 'up' },
  { key: 'bounce', direction: 'down' },
]

/** 校验一档竿相对竹竿:每个参数变化在 ±15% 内且方向更容易 */
function expectEasierThanBamboo(rod: (typeof RODS)[number]): void {
  for (const { key, direction } of EASIER_DIRECTION) {
    const base = BAMBOO[key]
    const delta = (rod.params[key] - base) / base
    expect(Math.abs(delta)).toBeLessThanOrEqual(STEP_LIMIT)
    if (direction === 'up') expect(delta).toBeGreaterThanOrEqual(0)
    else expect(delta).toBeLessThanOrEqual(0)
  }
}

describe('竿档表 RODS(接缝:配置)', () => {
  it('竹竿参数与现行绿条配置逐字一致(独立字面量对照)', () => {
    expect(RODS[0].id).toBe('zhugan')
    expect(RODS[0].name).toBe('竹竿')
    expect(RODS[0].unlockLevel).toBe(1)
    expect(RODS[0].params).toEqual(BAMBOO)
  })

  it('三档竿:解锁等级 1/3/6 严格递增,竹竿在首位', () => {
    expect(RODS.map(r => r.id)).toEqual(['zhugan', 'tangan', 'xinggou'])
    expect(RODS.map(r => r.unlockLevel)).toEqual([1, 3, 6])
  })

  it('碳竿(解锁 L3):相对竹竿总幅度 ±15% 内,方向只会更容易', () => {
    expect(RODS[1].name).toBe('碳竿')
    expect(RODS[1].unlockLevel).toBe(3)
    expectEasierThanBamboo(RODS[1])
  })

  it('星钩(解锁 L6):相对竹竿总幅度 ±15% 内,方向只会更容易', () => {
    expect(RODS[2].name).toBe('星钩')
    expect(RODS[2].unlockLevel).toBe(6)
    expectEasierThanBamboo(RODS[2])
  })

  it('任意相邻两档之间步进也在 ±15% 内(档间步进克制)', () => {
    for (let i = 1; i < RODS.length; i++) {
      for (const { key } of EASIER_DIRECTION) {
        const prev = RODS[i - 1].params[key]
        const delta = Math.abs((RODS[i].params[key] - prev) / prev)
        expect(delta).toBeLessThanOrEqual(STEP_LIMIT)
      }
    }
  })

  it('现行 TUNE.bar 与竹竿字面量一致(双保险:改任何一侧都会被抓住)', () => {
    expect(TUNE.bar).toEqual(BAMBOO)
  })
})
