import { describe, expect, it } from 'vitest'
import { CoreLoop, type UpdateInput } from './coreLoop'
import { Rng } from './rng'
import { daylightOf, seasonOf } from './worldEnv'
import type { Weather } from './types'

const DT = 1 / 60
const HOLD: UpdateInput = { holding: true, moveX: 0, moveY: 0 }
const IDLE: UpdateInput = { holding: false, moveX: 0, moveY: 0 }

/** 时钟替身:固定 Date(季节 = 月份、昼夜 = 小时由此驱动) */
function clockAt(month: number, hour: number): () => Date {
  return () => new Date(2026, month - 1, 15, hour, 0, 0)
}

/** 固定环境的核心循环:month/hour/weather 不传 = 夏/日/由种子派生;area 传入即在待机时切好;
 * spotMul 传入即随交互点来源注入(票 #38 钓位微差) */
function newWorldLoop(
  seed: number,
  world: {
    month?: number
    hour?: number
    weather?: Weather
    area?: 'pond' | 'river' | 'lake'
    spotMul?: Readonly<Record<string, number>>
  } = {},
): CoreLoop {
  const loop = new CoreLoop(new Rng(seed), {
    clock: clockAt(world.month ?? 6, world.hour ?? 12),
    weather: world.weather,
  })
  if (world.area) expect(loop.setWater(world.area)).toBe(true)
  // 票 #36:idle 抛竿须经交互点,助手注入恒定钓位来源(既有用例 = 范围内抛竿);
  // 票 #38:来源携带钓位微差倍率表,抛竿按当前钓位读取
  loop.setInteractionSource(() => (world.spotMul ? { kind: 'spot', spotMul: world.spotMul } : { kind: 'spot' }))
  return loop
}

function runUntil(loop: CoreLoop, maxSeconds: number, input: UpdateInput, stop: (l: CoreLoop) => boolean): void {
  const n = Math.round(maxSeconds / DT)
  for (let i = 0; i < n && !stop(loop); i++) loop.update(DT, input)
}

/** 轻抛(按下即松,蓄力≈0)后等到咬钩,返回上钩鱼 id */
function fishAtBite(loop: CoreLoop): string {
  loop.update(DT, HOLD)
  loop.update(DT, IDLE)
  runUntil(loop, 10, IDLE, x => x.phase !== 'waiting')
  expect(loop.fish).not.toBeNull()
  return loop.fish!.id
}

/** 同批种子下统计某鱼上钩次数(环境全固定 → 结果确定性,非统计近似) */
function countFish(
  world: {
    month?: number
    hour?: number
    weather?: Weather
    area?: 'pond' | 'river' | 'lake'
    spotMul?: Readonly<Record<string, number>>
  },
  fishId: string,
  seeds = 150,
): number {
  let count = 0
  for (let s = 1; s <= seeds; s++) {
    if (fishAtBite(newWorldLoop(s, world)) === fishId) count++
  }
  return count
}

describe('玩家朝向(票 #35:存档口径 = (mapId, x, y, 朝向);过场保持行进方向)', () => {
  /** 走 n 帧指定方向 */
  function walk(loop: CoreLoop, input: UpdateInput, frames = 12): void {
    for (let i = 0; i < frames; i++) loop.update(DT, input)
  }

  const dir = (x: number, y: number): UpdateInput => ({ holding: false, moveX: x, moveY: y })

  /** 缺省世界(480×270)中部起步:四向都有位移余量 */
  function midloop(): CoreLoop {
    const loop = newWorldLoop(42)
    loop.px = 240
    loop.py = 135
    return loop
  }

  it('默认朝下;向右走 → 右,向上走 → 上,向左走 → 左,向下走 → 下', () => {
    const loop = midloop()
    expect(loop.facing).toBe('down')
    walk(loop, dir(1, 0))
    expect(loop.facing).toBe('right')
    walk(loop, dir(0, -1))
    expect(loop.facing).toBe('up')
    walk(loop, dir(-1, 0))
    expect(loop.facing).toBe('left')
    walk(loop, dir(0, 1))
    expect(loop.facing).toBe('down')
  })

  it('静止不翻转:松开方向键后朝向保持', () => {
    const loop = midloop()
    walk(loop, dir(1, 0))
    expect(loop.facing).toBe('right')
    walk(loop, dir(0, 0))
    expect(loop.facing).toBe('right')
  })

  it('斜向取主轴(与渲染侧行走贴图推导同规则):横向分量 ≥ 纵向 → 横向', () => {
    const loop = midloop()
    walk(loop, dir(0.707, 0.707)) // 归一化斜向:两轴位移相等 → 横向优先
    expect(loop.facing).toBe('right')
    walk(loop, dir(-0.707, 0.707))
    expect(loop.facing).toBe('left')
  })

  it('撞墙滑动时朝向跟随实际位移:被挡轴不计入(可沿墙转头)', () => {
    // 缺省世界 480×270:贴右缘(横向被钳制)向右下走 → 只有纵向位移 → 朝下
    const loop = new CoreLoop(new Rng(42))
    loop.px = 480 - 5
    loop.py = 135
    walk(loop, dir(1, 1), 30)
    expect(loop.facing).toBe('down')
  })

  it('朝向可外部直改(组合根恢复存档/过场落位用),随后的行走照常推导', () => {
    const loop = midloop()
    loop.facing = 'left'
    expect(loop.facing).toBe('left')
    walk(loop, dir(1, 0))
    expect(loop.facing).toBe('right')
  })
})

describe('环境状态源接线(接缝:时钟注入,可选形参)', () => {
  it('默认水域 = 池塘;默认时钟 = 真实时间(env 与构造时刻同季节同昼夜)', () => {
    const d = new Date()
    const loop = new CoreLoop(new Rng(42))
    expect(loop.area).toBe('pond')
    expect(loop.env.season).toBe(seasonOf(d))
    expect(loop.env.daylight).toBe(daylightOf(d))
    expect(['sunny', 'rain']).toContain(loop.env.weather)
  })

  it('固定 Date 时钟替身驱动季节/昼夜:env 读数随时钟走', () => {
    const now = { d: new Date(2026, 8, 15, 23) } // 9 月夜 = 秋·夜
    const loop = new CoreLoop(new Rng(1), { clock: () => now.d })
    expect(loop.env.season).toBe('autumn')
    expect(loop.env.daylight).toBe('night')
    now.d = new Date(2026, 5, 15, 12) // 6 月正午 = 夏·日
    expect(loop.env.season).toBe('summer')
    expect(loop.env.daylight).toBe('day')
  })

  it('季节修正进入 cast:同批种子下,秋季稳重鲫上钩多于夏季(环境固定,结果确定)', () => {
    const summer = countFish({ month: 6, weather: 'sunny' }, 'wenzhongji')
    const autumn = countFish({ month: 9, weather: 'sunny' }, 'wenzhongji')
    expect(autumn).toBeGreaterThan(summer)
  })

  it('昼夜修正进入 cast:同批种子下,夜晚铅坠鲶上钩多于白天', () => {
    const day = countFish({ hour: 12, weather: 'sunny' }, 'qianzhuinian')
    const night = countFish({ hour: 23, weather: 'sunny' }, 'qianzhuinian')
    expect(night).toBeGreaterThan(day)
  })

  it('权重在抛竿时刻按当时环境算定:抛竿后才改时钟,出鱼分布与恒定白天完全一致', () => {
    const count = (switchAfterCast: boolean): number => {
      let catfish = 0
      for (let s = 1; s <= 150; s++) {
        const now = { d: new Date(2026, 5, 15, 12) } // 夏·日
        const loop = new CoreLoop(new Rng(s), { clock: () => now.d, weather: 'sunny' })
        loop.setInteractionSource(() => ({ kind: 'spot' })) // 票 #36:抛竿须在钓位范围内
        loop.update(DT, HOLD)
        loop.update(DT, IDLE) // 轻抛:cast 读到白天
        if (switchAfterCast) now.d = new Date(2026, 5, 15, 23) // 咬钩前改夜
        runUntil(loop, 10, IDLE, x => x.phase !== 'waiting')
        if (loop.fish!.id === 'qianzhuinian') catfish++
      }
      return catfish
    }
    expect(count(true)).toBe(count(false))
  })
})

describe('钓位微差(接缝:交互来源 spotMul → 抛竿按当前钓位读取,票 #38)', () => {
  it('修饰进入 cast:河流白昼晴天,同批种子下「深湾」式倍率(铅坠鲶 ×2)命中数高于无修饰钓位', () => {
    const plain = countFish({ weather: 'sunny', area: 'river' }, 'qianzhuinian')
    const deep = countFish({ weather: 'sunny', area: 'river', spotMul: { qianzhuinian: 2 } }, 'qianzhuinian')
    expect(deep).toBeGreaterThan(plain)
  })

  it('不越硬门:河流钓位倍率表点名气球河豚(河流硬门),150 种子一条也钓不上来', () => {
    let hetun = 0
    for (let s = 1; s <= 150; s++) {
      if (fishAtBite(newWorldLoop(s, { weather: 'sunny', area: 'river', spotMul: { qiqiuHetun: 5 } })) === 'qiqiuHetun') {
        hetun++
      }
    }
    expect(hetun).toBe(0)
  })

  it('缺省无修饰 = 现行权重逐位一致:同种子下,来源带空表与不带,连抛三竿上钩鱼逐位一致', () => {
    const withEmpty = newWorldLoop(42, { weather: 'sunny', area: 'river', spotMul: {} })
    const without = newWorldLoop(42, { weather: 'sunny', area: 'river' })
    for (let i = 0; i < 3; i++) {
      expect(fishAtBite(withEmpty)).toBe(fishAtBite(without))
    }
  })
})

describe('天气(接缝:会话开始一次抽样,会话内恒定,?seed 可复现)', () => {
  it('同种子 → 同天气;会话内恒定;重开计分会话不重抽', () => {
    const a = newWorldLoop(7, { weather: undefined })
    const b = newWorldLoop(7, { weather: undefined })
    expect(b.weather).toBe(a.weather)
    expect(['sunny', 'rain']).toContain(a.weather)
    for (let i = 0; i < 3; i++) {
      fishAtBite(a)
      expect(a.weather).toBe(b.weather)
    }
    a.resetSession()
    expect(a.weather).toBe(b.weather)
  })

  it('天气修正进入 cast:同批种子下,白天晴天闪电梭上钩多于雨天', () => {
    const sunny = countFish({ weather: 'sunny' }, 'shandiansuo')
    const rainy = countFish({ weather: 'rain' }, 'shandiansuo')
    expect(sunny).toBeGreaterThan(rainy)
  })
})

describe('当前水域(接缝:setWater 仅待机可接受,cast 消费引擎输出)', () => {
  it('池塘(默认)既有 5 种都可能出现(票 #53 改向:鱼池扩至 9 种,红线 = 既有 5 种一条不少)', () => {
    const seen = new Set<string>()
    for (let s = 1; s <= 150; s++) seen.add(fishAtBite(newWorldLoop(s, { weather: 'sunny' })))
    for (const id of ['xiaobaitiao', 'wenzhongji', 'qianzhuinian', 'qiqiuHetun', 'shandiansuo']) {
      expect(seen.has(id), `${id} 未在固定种子批中出现`).toBe(true)
    }
    // 名册新鱼只做加法:白天晴天可见扩容后的构成(灯笼鲇夜晚硬门不出)
    expect(seen.has('denglongNian')).toBe(false)
  })

  it('cast 消费当前水域:河流里气球河豚硬门归零,铅坠鲶/闪电梭为主', () => {
    let hetun = 0
    let catfish = 0
    let bolt = 0
    let bait = 0
    for (let s = 1; s <= 150; s++) {
      const id = fishAtBite(newWorldLoop(s, { weather: 'sunny', area: 'river' }))
      if (id === 'qiqiuHetun') hetun++
      if (id === 'qianzhuinian') catfish++
      if (id === 'shandiansuo') bolt++
      if (id === 'xiaobaitiao') bait++
    }
    expect(hetun).toBe(0)
    expect(catfish + bolt).toBeGreaterThan(bait)
  })

  it('cast 消费当前水域:湖里闪电梭硬门归零,气球河豚可出', () => {
    let bolt = 0
    let hetun = 0
    for (let s = 1; s <= 150; s++) {
      const id = fishAtBite(newWorldLoop(s, { weather: 'sunny', area: 'lake' }))
      if (id === 'shandiansuo') bolt++
      if (id === 'qiqiuHetun') hetun++
    }
    expect(bolt).toBe(0)
    expect(hetun).toBeGreaterThan(0)
  })

  it('垂钓进行中(蓄力/等待/咬钩/小游戏/结算停留)setWater 被拒且水域不变', () => {
    const loop = newWorldLoop(42)
    expect(loop.setWater('river')).toBe(true) // 待机可切
    expect(loop.area).toBe('river')
    expect(loop.setWater('pond')).toBe(true)

    loop.update(DT, HOLD) // charging
    expect(loop.phase).toBe('charging')
    expect(loop.setWater('lake')).toBe(false)
    expect(loop.area).toBe('pond')

    loop.update(DT, IDLE) // 松开 → waiting
    expect(loop.phase).toBe('waiting')
    expect(loop.setWater('lake')).toBe(false)
    expect(loop.area).toBe('pond')

    runUntil(loop, 10, IDLE, x => x.phase !== 'waiting') // bite
    expect(loop.phase).toBe('bite')
    expect(loop.setWater('lake')).toBe(false)

    loop.update(DT, HOLD) // minigame
    expect(loop.phase).toBe('minigame')
    expect(loop.setWater('lake')).toBe(false)

    runUntil(loop, 60, HOLD, x => x.phase === 'caught' || x.phase === 'escaped') // 结算停留
    expect(['caught', 'escaped']).toContain(loop.phase)
    expect(loop.setWater('lake')).toBe(false)
    expect(loop.area).toBe('pond')

    runUntil(loop, 2, IDLE, x => x.phase === 'idle') // 回到待机
    expect(loop.setWater('lake')).toBe(true)
    expect(loop.area).toBe('lake')
  })

  it('重开计分会话:世界环境延续(水域与天气不变,重开后仍可换水)', () => {
    const loop = newWorldLoop(42, { weather: 'rain' })
    expect(loop.setWater('lake')).toBe(true)
    const weather = loop.weather
    loop.resetSession()
    expect(loop.area).toBe('lake')
    expect(loop.weather).toBe(weather)
    expect(loop.setWater('pond')).toBe(true)
  })
})
