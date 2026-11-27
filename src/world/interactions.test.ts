import { describe, expect, it } from 'vitest'
import { interactionLabel, nearestInteraction, parseInteractionSpots } from './interactions'
import type { WorldMapObject } from './worldMap'

/** 物件条目替身:缺省 = 钓位「南岸」@(456,296),与 village.json 现有条目同形 */
function obj(partial: Partial<WorldMapObject> = {}): WorldMapObject {
  return {
    name: '南岸',
    type: 'spot',
    x: 456,
    y: 296,
    properties: {},
    ...partial,
  }
}

describe('交互点解析(接缝:parseInteractionSpots,票 #36)', () => {
  it('只收本票落地的交互 kind(spot/stall);spawn 与未知 kind(如 note)不收', () => {
    const spots = parseInteractionSpots(
      [
        obj(),
        obj({ name: '杂货摊', type: 'stall', x: 136, y: 112 }),
        obj({ name: '出生点', type: 'spawn', x: 72, y: 72 }),
        obj({ name: '路牌', type: 'note', x: 200, y: 100 }), // 票 #37 落地,本票不解析
      ],
      16,
    )
    expect(spots.map(s => s.kind)).toEqual(['spot', 'stall'])
    expect(spots[1]).toMatchObject({ name: '杂货摊', x: 136, y: 112 })
  })

  it('默认触发半径 = 1.5 tile(tileWidth 参数折算成世界像素)', () => {
    const [spot] = parseInteractionSpots([obj()], 16)
    expect(spot!.radiusPx).toBe(24)
    const [wide] = parseInteractionSpots([obj()], 32)
    expect(wide!.radiusPx).toBe(48)
  })

  it('radius 属性覆盖默认(tile 单位 → 世界像素)', () => {
    const [spot] = parseInteractionSpots([obj({ properties: { radius: 2.5 } })], 16)
    expect(spot!.radiusPx).toBe(40)
  })

  it('radius 属性非法(非数/非正)抛错,挡住坏数据流入触发判定', () => {
    expect(() => parseInteractionSpots([obj({ properties: { radius: 0 } })], 16)).toThrow()
    expect(() => parseInteractionSpots([obj({ properties: { radius: -1 } })], 16)).toThrow()
    expect(() => parseInteractionSpots([obj({ properties: { radius: '远' } })], 16)).toThrow()
  })

  it('钓位 area 透传为所属水域;水域 id 拼错抛错(走错水域比不切水更糟)', () => {
    const [spot] = parseInteractionSpots([obj({ properties: { area: 'river' } })], 16)
    expect(spot!.area).toBe('river')
    expect(() => parseInteractionSpots([obj({ properties: { area: 'poind' } })], 16)).toThrow()
  })

  it('无 area 属性 = 不切水(undefined),解析不抛', () => {
    const [spot] = parseInteractionSpots([obj()], 16)
    expect(spot!.area).toBeUndefined()
  })
})

describe('触发判定(接缝:nearestInteraction,票 #36)', () => {
  const spots = parseInteractionSpots(
    [
      obj({ name: 'A', x: 100, y: 100, properties: { area: 'pond' } }),
      obj({ name: 'B', x: 130, y: 100, properties: { area: 'pond' } }),
    ],
    16,
  )

  it('范围内返回最近一处(两处声明相距 30px,站在 B 跟前取 B)', () => {
    const near = nearestInteraction(spots, 128, 100)
    expect(near!.name).toBe('B')
  })

  it('重叠取最近:站在两点正中,距离相等 → 取先声明者(A)', () => {
    const mid = nearestInteraction(spots, 115, 100)
    expect(mid!.name).toBe('A')
  })

  it('范围外无交互点(null):无效抛竿不存在的判定源', () => {
    expect(nearestInteraction(spots, 100, 130)).toBeNull()
    expect(nearestInteraction([], 100, 100)).toBeNull()
  })

  it('半径边界按距离 ≤ radiusPx 判定(贴边即触发)', () => {
    const [only] = parseInteractionSpots([obj({ name: 'C', x: 100, y: 100 })], 16)
    expect(nearestInteraction([only!], 124, 100)!.name).toBe('C')
    expect(nearestInteraction([only!], 125, 100)).toBeNull()
  })
})

describe('动作短词(接缝:interactionLabel,浮签文案)', () => {
  it('钓位 = 抛竿,摊位 = 商店', () => {
    expect(interactionLabel('spot')).toBe('抛竿')
    expect(interactionLabel('stall')).toBe('商店')
  })

  it('未知 kind 无词(空串):浮签不渲染无主文案,后续票按 kind 扩表', () => {
    expect(interactionLabel('chest')).toBe('')
  })
})
