import { describe, expect, it } from 'vitest'
import { interactionLabel, isNarrativeKind, nearestInteraction, parseInteractionSpots } from './interactions'
import villageJson from './village.json'
import { parseWorldMap, type WorldMapObject } from './worldMap'

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
  it('收已注册交互 kind(spot/stall);spawn 与未注册 kind(如 chest)不收', () => {
    const spots = parseInteractionSpots(
      [
        obj(),
        obj({ name: '杂货摊', type: 'stall', x: 136, y: 112 }),
        obj({ name: '出生点', type: 'spawn', x: 72, y: 72 }),
        obj({ name: '宝箱', type: 'chest', x: 200, y: 100 }), // 票 #41 落地,本票不解析
      ],
      16,
    )
    expect(spots.map(s => s.kind)).toEqual(['spot', 'stall'])
    expect(spots[1]).toMatchObject({ name: '杂货摊', x: 136, y: 112 })
  })

  it('储物箱 kind(票 #40,spec §2.1)解析进表,无附加属性要求', () => {
    const spots = parseInteractionSpots([obj({ name: '储物箱', type: 'storage', x: 200, y: 200 })], 16)
    expect(spots.map(s => s.kind)).toEqual(['storage'])
    expect(spots[0]).toMatchObject({ name: '储物箱', x: 200, y: 200, radiusPx: 24 })
  })

  it('叙事物 kind(票 #37:sign/note)解析进表,text 属性透传为彩蛋文案', () => {
    const spots = parseInteractionSpots(
      [
        obj({ name: '东路牌', type: 'sign', x: 888, y: 312, properties: { text: '东 · 河谷' } }),
        obj({ name: '井', type: 'note', x: 216, y: 152, properties: { text: '井水清凉见底。' } }),
      ],
      16,
    )
    expect(spots.map(s => s.kind)).toEqual(['sign', 'note'])
    expect(spots[0]).toMatchObject({ name: '东路牌', x: 888, y: 312, text: '东 · 河谷' })
    expect(spots[1]!.text).toBe('井水清凉见底。')
  })

  it('叙事物缺 text / 空 text / 非字符串 → 抛错(挡住无文案浮签流入世界)', () => {
    expect(() => parseInteractionSpots([obj({ name: '路牌', type: 'sign', properties: {} })], 16)).toThrow()
    expect(() => parseInteractionSpots([obj({ name: '路牌', type: 'sign', properties: { text: '' } })], 16)).toThrow()
    expect(() => parseInteractionSpots([obj({ name: '石台', type: 'note', properties: { text: 42 } })], 16)).toThrow()
  })

  it('非叙事物(spot)不要求 text;radius 覆盖对叙事物同样生效', () => {
    const [spot] = parseInteractionSpots([obj()], 16)
    expect(spot!.text).toBeUndefined()
    const [wide] = parseInteractionSpots([obj({ type: 'sign', properties: { text: '东', radius: 2 } })], 16)
    expect(wide!.radiusPx).toBe(32)
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

  it('储物箱 = 储物箱(票 #40:浮签用词与票面一致)', () => {
    expect(interactionLabel('storage')).toBe('储物箱')
  })

  it('叙事物 = 查看(路牌 sign / 井石台 note 同词,票 #37)', () => {
    expect(interactionLabel('sign')).toBe('查看')
    expect(interactionLabel('note')).toBe('查看')
  })

  it('未知 kind 无词(空串):浮签不渲染无主文案,后续票按 kind 扩表', () => {
    expect(interactionLabel('chest')).toBe('')
  })
})

describe('叙事物判定(接缝:isNarrativeKind,动作键意图策略消费)', () => {
  it('sign/note 是叙事物;spot/stall 与未注册 kind 不是', () => {
    expect(isNarrativeKind('sign')).toBe(true)
    expect(isNarrativeKind('note')).toBe(true)
    expect(isNarrativeKind('spot')).toBe(false)
    expect(isNarrativeKind('stall')).toBe(false)
    expect(isNarrativeKind('chest')).toBe(false)
  })
})

describe('村舍图叙事物端到端(接缝:village.json → parseInteractionSpots,票 #37)', () => {
  const map = parseWorldMap(villageJson)
  const spots = parseInteractionSpots(map.objects, map.tileWidth)

  it('村舍图解析出东路牌(sign)与井(note),文案随物件透传', () => {
    const sign = spots.find(s => s.kind === 'sign')
    const note = spots.find(s => s.kind === 'note')
    expect(sign).toMatchObject({ name: '东路牌', text: '东 · 河谷', radiusPx: 24 })
    expect(note).toMatchObject({ name: '井' })
    expect(note!.text).toBeTruthy()
  })

  it('井在出生点附近(第一屏内,出生点走几步可达触发半径)', () => {
    const note = spots.find(s => s.kind === 'note')!
    const spawn = map.spawn
    const dist = Math.hypot(note!.x - spawn.x, note!.y - spawn.y)
    expect(note!.x).toBeLessThan(map.widthPx / 3)
    expect(dist).toBeLessThan(map.widthPx / 4)
  })

  it('东路牌立在村舍东出口前:图东侧、东行土路尽头处,钓位/摊位范围互不重叠', () => {
    const sign = spots.find(s => s.kind === 'sign')!
    expect(sign.x).toBeGreaterThan(map.widthPx * 0.9)
    for (const other of spots) {
      if (other === sign) continue
      const overlap = Math.hypot(other.x - sign.x, other.y - sign.y) < other.radiusPx + sign.radiusPx
      expect(overlap).toBe(false)
    }
  })
})

describe('村舍储物箱端到端(接缝:village.json → parseInteractionSpots,票 #40)', () => {
  const map = parseWorldMap(villageJson)
  const spots = parseInteractionSpots(map.objects, map.tileWidth)

  it('储物箱交互点恰好一个,锚在储物箱 tile (12,12) 中心,默认触发半径', () => {
    const storages = spots.filter(s => s.kind === 'storage')
    expect(storages).toHaveLength(1)
    expect(storages[0]).toMatchObject({ name: '储物箱', x: 12 * 16 + 8, y: 12 * 16 + 8, radiusPx: 24 })
  })

  it('储物箱在村舍近旁(家 = 仓库锚点,spec §4.4):图西半、井的东南侧,不压井交互半径', () => {
    const storage = spots.find(s => s.kind === 'storage')!
    expect(storage.x).toBeLessThan(map.widthPx / 3)
    const well = spots.find(s => s.kind === 'note')!
    expect(storage.y).toBeGreaterThan(well.y)
    for (const other of spots) {
      if (other === storage) continue
      const overlap = Math.hypot(other.x - storage.x, other.y - storage.y) < other.radiusPx + storage.radiusPx
      expect(overlap).toBe(false)
    }
  })
})
