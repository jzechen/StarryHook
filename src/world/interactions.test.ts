import { describe, expect, it } from 'vitest'
import { interactionLabel, interactionPromptText, isNarrativeKind, nearestInteraction, parseInteractionSpots, type InteractionSpotDef } from './interactions'
import { WORLD_MAPS } from './maps'
import villageJson from './village.json'
import { warpsOf } from './warps'
import { isBlockedCell, parseWorldMap, type WorldMapData, type WorldMapObject } from './worldMap'

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
  it('收已注册交互 kind(spot/stall);spawn 与未注册 kind 不收', () => {
    const spots = parseInteractionSpots(
      [
        obj(),
        obj({ name: '杂货摊', type: 'stall', x: 136, y: 112 }),
        obj({ name: '出生点', type: 'spawn', x: 72, y: 72 }),
      ],
      16,
    )
    expect(spots.map(s => s.kind)).toEqual(['spot', 'stall'])
    expect(spots[1]).toMatchObject({ name: '杂货摊', x: 136, y: 112 })
  })

  it('宝箱 kind(票 #41,spec §4.5)解析进表,chest 属性 → 内容表 id', () => {
    const spots = parseInteractionSpots(
      [obj({ name: '篱笆角的宝箱', type: 'chest', x: 40, y: 376, properties: { chest: 'village-hedge' } })],
      16,
    )
    expect(spots.map(s => s.kind)).toEqual(['chest'])
    expect(spots[0]).toMatchObject({ name: '篱笆角的宝箱', x: 40, y: 376, chestId: 'village-hedge', radiusPx: 24 })
  })

  it('宝箱缺 chest 属性 / 引用目录外 id → 抛错(拼写错挡在解析期,防开不存在的箱)', () => {
    expect(() => parseInteractionSpots([obj({ name: '无名箱', type: 'chest', properties: {} })], 16)).toThrow()
    expect(() =>
      parseInteractionSpots([obj({ name: '错号箱', type: 'chest', properties: { chest: 'no-such-chest' } })], 16),
    ).toThrow()
    expect(() =>
      parseInteractionSpots([obj({ name: '错型箱', type: 'chest', properties: { chest: 42 } })], 16),
    ).toThrow()
  })

  it('非宝箱物件不要求 chest 属性(spot 无 chestId)', () => {
    const [spot] = parseInteractionSpots([obj()], 16)
    expect(spot!.chestId).toBeUndefined()
  })

  it('储物箱 kind(票 #40,spec §2.1)解析进表,无附加属性要求', () => {
    const spots = parseInteractionSpots([obj({ name: '储物箱', type: 'storage', x: 200, y: 200 })], 16)
    expect(spots.map(s => s.kind)).toEqual(['storage'])
    expect(spots[0]).toMatchObject({ name: '储物箱', x: 200, y: 200, radiusPx: 24 })
  })

  it('公告板 kind(票 #55)解析进表,无附加属性要求', () => {
    const spots = parseInteractionSpots([obj({ name: '公告板', type: 'board', x: 552, y: 184 })], 16)
    expect(spots.map(s => s.kind)).toEqual(['board'])
    expect(spots[0]).toMatchObject({ name: '公告板', x: 552, y: 184, radiusPx: 24 })
    expect(spots[0]!.text).toBeUndefined()
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

  it('钓位微差(票 #38):spotMul JSON 串属性解析为 per-fish 倍率表', () => {
    const [spot] = parseInteractionSpots([obj({ properties: { area: 'river', spotMul: '{"qianzhuinian":2}' } })], 16)
    expect(spot!.spotMul).toEqual({ qianzhuinian: 2 })
  })

  it('钓位微差:spotMul 直接物件形态(手写地图)同样解析', () => {
    const [spot] = parseInteractionSpots([obj({ properties: { spotMul: { qiqiuHetun: 2 } } })], 16)
    expect(spot!.spotMul).toEqual({ qiqiuHetun: 2 })
  })

  it('钓位微差:无 spotMul 属性 = 无修饰(undefined)', () => {
    const [spot] = parseInteractionSpots([obj({ properties: { area: 'pond' } })], 16)
    expect(spot!.spotMul).toBeUndefined()
  })

  it('钓位微差纪律进解析器:倍率 < 1 / 非数 / 非有限 → 抛错(只增不减)', () => {
    expect(() => parseInteractionSpots([obj({ properties: { spotMul: '{"qianzhuinian":0.5}' } })], 16)).toThrow()
    expect(() => parseInteractionSpots([obj({ properties: { spotMul: { qianzhuinian: 0 } } })], 16)).toThrow()
    expect(() => parseInteractionSpots([obj({ properties: { spotMul: { qianzhuinian: -2 } } })], 16)).toThrow()
    expect(() => parseInteractionSpots([obj({ properties: { spotMul: { qianzhuinian: '翻倍' } } })], 16)).toThrow()
    expect(() => parseInteractionSpots([obj({ properties: { spotMul: { qianzhuinian: Number.POSITIVE_INFINITY } } })], 16)).toThrow()
  })

  it('钓位微差:键不是鱼目录 id → 抛错(拼写错挡在解析期,不引新鱼种)', () => {
    expect(() => parseInteractionSpots([obj({ properties: { spotMul: '{"qianzhuiNian":2}' } })], 16)).toThrow()
    expect(() => parseInteractionSpots([obj({ properties: { spotMul: { 神秘鱼: 2 } } })], 16)).toThrow()
  })

  it('钓位微差:spotMul 非物件(数组/非法 JSON/标量)→ 抛错', () => {
    expect(() => parseInteractionSpots([obj({ properties: { spotMul: '[2]' } })], 16)).toThrow()
    expect(() => parseInteractionSpots([obj({ properties: { spotMul: '{qianzhuinian:2}' } })], 16)).toThrow()
    expect(() => parseInteractionSpots([obj({ properties: { spotMul: 42 } })], 16)).toThrow()
  })

  it('钓位微差:非钓位(stall)不挂倍率,属性格式照常校验', () => {
    const spots = parseInteractionSpots([obj({ name: '杂货摊', type: 'stall', properties: { spotMul: '{"xiaobaitiao":2}' } })], 16)
    expect(spots[0]!.spotMul).toBeUndefined()
    expect(() => parseInteractionSpots([obj({ name: '杂货摊', type: 'stall', properties: { spotMul: '{bad' } })], 16)).toThrow()
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

  it('宝箱 = 开启(票 #41:走近动作键直接开,浮签动作短词单源)', () => {
    expect(interactionLabel('chest')).toBe('开启')
  })

  it('公告板 = 委托(票 #55:浮签用词与票面一致)', () => {
    expect(interactionLabel('board')).toBe('委托')
  })

  it('未知 kind 无词(空串):浮签不渲染无主文案,后续票按 kind 扩表', () => {
    expect(interactionLabel('nope')).toBe('')
  })
})

describe('浮签文案(接缝:interactionPromptText,票 #38 钓位名进浮签)', () => {
  it('钓位 = 「钓位名 · 动作短词」(「深湾 · 抛竿」)', () => {
    expect(interactionPromptText({ kind: 'spot', name: '深湾' })).toBe('深湾 · 抛竿')
    expect(interactionPromptText({ kind: 'spot', name: '湖心' })).toBe('湖心 · 抛竿')
  })

  it('其余 kind 沿动作短词不加名(摊位 = 商店、叙事物 = 查看、宝箱 = 开启,spec §3 只改钓位)', () => {
    expect(interactionPromptText({ kind: 'stall', name: '杂货摊' })).toBe('商店')
    expect(interactionPromptText({ kind: 'sign', name: '东路牌' })).toBe('查看')
    expect(interactionPromptText({ kind: 'note', name: '井' })).toBe('查看')
    expect(interactionPromptText({ kind: 'chest', name: '篱笆角的宝箱' })).toBe('开启')
    expect(interactionPromptText({ kind: 'board', name: '公告板' })).toBe('委托')
  })

  it('未知 kind = 空串(浮签不渲染无主文案;chest 已注册为「开启」,票 #41)', () => {
    expect(interactionPromptText({ kind: 'nope', name: '未知' })).toBe('')
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

  it('东路牌立在村舍东出口前(图东侧,#35 warp 旁),钓位/摊位范围互不重叠', () => {
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

describe('三图叙事物(接缝:WORLD_MAPS → parseInteractionSpots,票 #37 补位 #35 并图)', () => {
  /** 叙事物锚点可达:半径内至少一格可行走(挡住牌子埋进墙里点不到) */
  function reachableViaWalkableCell(map: WorldMapData, def: InteractionSpotDef): boolean {
    const r = def.radiusPx
    const t = map.tileWidth
    for (let dy = -r; dy <= r; dy += t / 2) {
      for (let dx = -r; dx <= r; dx += t / 2) {
        const x = def.x + dx
        const y = def.y + dy
        if (!isBlockedCell(map, Math.floor(x / t), Math.floor(y / t))) return true
      }
    }
    return false
  }

  it('四块路牌各立对应出口前(≤ 4 tile、不压触发区、半径内可达),文案按票面方向', () => {
    // 票面 §2.5:村舍东/河谷西/河谷东/湖畔西,按图与声明序
    const EXPECTED: Record<'village' | 'river' | 'lake', readonly string[]> = {
      village: ['东 · 河谷'],
      river: ['西 · 村舍池塘', '东 · 湖畔'],
      lake: ['西 · 河谷'],
    }
    for (const mapId of ['village', 'river', 'lake'] as const) {
      const map = WORLD_MAPS[mapId]
      const signs = parseInteractionSpots(map.objects, map.tileWidth).filter(s => s.kind === 'sign')
      expect(signs.map(s => s.text)).toEqual(EXPECTED[mapId])
      const warps = warpsOf(map)
      for (const sign of signs) {
        // 对应出口 = 同侧 warp(x 差 < 128);路牌贴出口但不压触发区
        const near = warps.filter(w => Math.abs(w.x + w.width / 2 - sign.x) < 128)
        expect(near).toHaveLength(1)
        const warp = near[0]!
        const distToWarp = Math.hypot(warp.x + warp.width / 2 - sign.x, warp.y + warp.height / 2 - sign.y)
        expect(distToWarp).toBeLessThanOrEqual(4 * map.tileWidth)
        const inZone =
          sign.x >= warp.x && sign.x < warp.x + warp.width && sign.y >= warp.y && sign.y < warp.y + warp.height
        expect(inZone).toBe(false)
        expect(reachableViaWalkableCell(map, sign)).toBe(true)
      }
    }
  })

  it('湖畔:石台(note)在远端角落(与西口对角),文案为既定彩蛋,半径内可达', () => {
    const map = WORLD_MAPS.lake
    const notes = parseInteractionSpots(map.objects, map.tileWidth).filter(s => s.kind === 'note')
    expect(notes).toHaveLength(1)
    const altar = notes[0]!
    expect(altar.name).toBe('石台')
    expect(altar.text).toBe('石台的字迹已模糊:『湖心静时,鱼会自己游上来看你。』')
    // 西口/出生点在西侧,石台落东南远角(x 东 8 成之外,y 南半)
    expect(altar.x).toBeGreaterThan(map.widthPx * 0.8)
    expect(altar.y).toBeGreaterThan(map.heightPx / 2)
    expect(reachableViaWalkableCell(map, altar)).toBe(true)
  })

  it('三图各自交互点触发半径互不重叠(浮签不打架)', () => {
    for (const mapId of ['village', 'river', 'lake'] as const) {
      const map = WORLD_MAPS[mapId]
      const spots = parseInteractionSpots(map.objects, map.tileWidth)
      for (let i = 0; i < spots.length; i++) {
        for (let j = i + 1; j < spots.length; j++) {
          const d = Math.hypot(spots[i]!.x - spots[j]!.x, spots[i]!.y - spots[j]!.y)
          expect(d).toBeGreaterThanOrEqual(spots[i]!.radiusPx + spots[j]!.radiusPx)
        }
      }
    }
  })
})
