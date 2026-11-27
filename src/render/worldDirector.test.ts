import { Application, Container, Texture } from 'pixi.js'
import { describe, expect, it, vi } from 'vitest'
import { PLAYER_POSITION_KEY } from '../core/playerPosition'
import { CoreLoop } from '../core/coreLoop'
import { Rng } from '../core/rng'
import type { KvStorage } from '../core/kvSnapshot'
import type { UpdateInput } from '../core/coreLoop'
import type { SceneTextures } from './textures'
import { WorldDirector } from './worldDirector'

/**
 * 世界导演(票 #35 端到端编排缝):开机按快照恢复(位置+朝向+水域)、
 * 走到出口 → 过场(输入锁、不写存档)→ 换图落位(朝向保持)→ 对侧入口出现;
 * 仅 idle 落盘。核心循环不感知过场——本测试即模拟组合根 ticker 的调用序
 * (未锁定才喂输入 → director.update),在真实三图数据上驱动。
 *
 * 测试环境为 node(无 DOM/Pixi 渲染器):Text 依赖 canvas,以桩替换(沿
 * worldScene.test.ts);stage 用真实 Container 收容场景树。
 */
vi.mock('pixi.js', async (importOriginal) => {
  const pixi = await importOriginal<typeof import('pixi.js')>()
  class StubText extends pixi.Container {
    anchor = { set: () => {} }
  }
  return { ...pixi, Text: StubText }
})

function fakeTextures(): SceneTextures {
  const tex = () => new Texture()
  const n = (count: number) => Array.from({ length: count }, tex)
  return {
    waterFrames: n(13),
    grassTile: tex(),
    waveFrames: { top: n(8), right: n(8), bottom: n(8), left: n(8) },
    playerFrames: { down: n(4), up: n(4), left: n(4), right: n(4) },
    townTiles: n(132),
    bobber: tex(),
    fishFrames: { slim: n(2), round: n(2), heavy: n(2), puff: n(2), bolt: n(2) },
  }
}

/** 计数 kv:记录 player-position 键的写入次数 */
function countingKv(): KvStorage & { writes: number } {
  const mem = new Map<string, string>()
  const kv = {
    writes: 0,
    get: (key: string) => mem.get(key) ?? null,
    set: (key: string, value: string) => {
      mem.set(key, value)
      kv.writes++
    },
  }
  return kv
}

function fakeApp() {
  const stage = new Container()
  const app = { screen: { width: 480, height: 270 }, stage } as unknown as Application
  return app
}

const DT = 1 / 60
const STILL: UpdateInput = { holding: false, moveX: 0, moveY: 0 }

/** 组合根 ticker 的调用序:未锁定才喂输入 → director 推进(过场/换图/存档/渲染) */
function tick(director: WorldDirector, core: CoreLoop, t: number, dt: number, input: UpdateInput = STILL): void {
  if (!director.inputLocked) core.update(dt, input)
  director.update(t, dt)
}

/** 村舍东出口触发区内的一点(56–57 列 × 12–13 行) */
const VILLAGE_EAST_IN = { x: 900, y: 208 }
/** 河谷西出口触发区内的一点(2–3 列 × 12–13 行) */
const RIVER_WEST_IN = { x: 50, y: 208 }

describe('WorldDirector:开机恢复(位置是唯一持久的世界状态)', () => {
  it('无快照 → 村舍出生点、朝向下、水域 = 池塘', () => {
    const core = new CoreLoop(new Rng(1))
    const director = new WorldDirector({ app: fakeApp(), textures: fakeTextures(), core, storage: countingKv() })
    expect(director.mapId).toBe('village')
    expect(core.px).toBe(72)
    expect(core.py).toBe(72)
    expect(core.facing).toBe('down')
    expect(core.area).toBe('pond')
  })

  it('有快照 → 精确恢复位置与朝向,水域由 mapId 推导(不落库)', () => {
    const kv = countingKv()
    kv.set(PLAYER_POSITION_KEY, JSON.stringify({ mapId: 'lake', x: 520, y: 264, facing: 'up' }))
    const core = new CoreLoop(new Rng(1))
    const director = new WorldDirector({ app: fakeApp(), textures: fakeTextures(), core, storage: kv })
    expect(director.mapId).toBe('lake')
    expect(core.px).toBe(520)
    expect(core.py).toBe(264)
    expect(core.facing).toBe('up')
    expect(core.area).toBe('lake')
  })

  it('快照位置落在不可走 cell(旧版数据/改图)→ 按无快照降级回村舍出生点', () => {
    const kv = countingKv()
    kv.set(PLAYER_POSITION_KEY, JSON.stringify({ mapId: 'village', x: 480, y: 248, facing: 'down' })) // 池塘中央
    const core = new CoreLoop(new Rng(1))
    const director = new WorldDirector({ app: fakeApp(), textures: fakeTextures(), core, storage: kv })
    expect(director.mapId).toBe('village')
    expect(core.px).toBe(72)
    expect(core.py).toBe(72)
  })
})

describe('WorldDirector:出口过场(走到触发 → 淡黑 → 对侧入口,朝向保持)', () => {
  function walkInVillageEast(): { director: WorldDirector; core: CoreLoop } {
    const core = new CoreLoop(new Rng(1))
    const director = new WorldDirector({ app: fakeApp(), textures: fakeTextures(), core, storage: countingKv() })
    core.px = VILLAGE_EAST_IN.x
    core.py = VILLAGE_EAST_IN.y
    core.facing = 'right' // 行进方向:东
    tick(director, core, 0, DT)
    return { director, core }
  }

  it('走入触发区:立即进入过场(输入锁定)', () => {
    const { director } = walkInVillageEast()
    expect(director.inputLocked).toBe(true)
  })

  it('淡黑 ~300ms 后换图:落到河谷对侧入口,朝向保持行进方向,水域随图推导', () => {
    const { director, core } = walkInVillageEast()
    let t = DT
    for (let i = 0; i < 120 && director.inputLocked; i++) {
      tick(director, core, t, DT)
      t += DT
    }
    expect(director.inputLocked).toBe(false) // 过场完成
    expect(director.mapId).toBe('river')
    expect(core.px).toBe(88)
    expect(core.py).toBe(208)
    expect(core.facing).toBe('right') // 朝向保持行进方向
    expect(core.area).toBe('river') // 水域由 mapId 推导
  })

  it('到达点不在对侧触发区内:过场后原地不动不会被弹回', () => {
    const { director, core } = walkInVillageEast()
    let t = DT
    for (let i = 0; i < 120 && director.inputLocked; i++) {
      tick(director, core, t, DT)
      t += DT
    }
    for (let i = 0; i < 30; i++) tick(director, core, t, DT)
    expect(director.mapId).toBe('river')
    expect(core.px).toBe(88)
  })

  it('往返走通:河谷西出口 → 村舍东入口(位置/水域随之正确)', () => {
    const { director, core } = walkInVillageEast()
    let t = DT
    for (let i = 0; i < 120 && director.inputLocked; i++) {
      tick(director, core, t, DT)
      t += DT
    }
    expect(director.mapId).toBe('river')
    core.px = RIVER_WEST_IN.x
    core.py = RIVER_WEST_IN.y
    core.facing = 'left'
    tick(director, core, t, DT)
    expect(director.inputLocked).toBe(true)
    for (let i = 0; i < 120 && director.inputLocked; i++) {
      tick(director, core, t, DT)
      t += DT
    }
    expect(director.mapId).toBe('village')
    expect(core.px).toBe(872)
    expect(core.py).toBe(208)
    expect(core.facing).toBe('left')
    expect(core.area).toBe('pond')
  })

  it('过场中输入锁定:淡出阶段喂了移动输入位置也不动(组合根 gating 之外的双保险)', () => {
    const { director, core } = walkInVillageEast()
    const lockedPx = core.px
    let t = DT
    for (let i = 0; i < 12; i++) {
      // 淡出阶段(~0.2s)持续喂输入:组合根 gating 会拦下,位置冻结在触发点
      tick(director, core, t, DT, { holding: false, moveX: 1, moveY: 0 })
      t += DT
    }
    expect(director.inputLocked).toBe(true)
    expect(core.px).toBe(lockedPx)
  })
})

describe('WorldDirector:存档门禁(仅 idle 落盘;垂钓/过场中不写)', () => {
  it('垂钓全程(charging/waiting/bite/minigame/结算)零写入;回 idle 后恢复落盘', () => {
    const kv = countingKv()
    const core = new CoreLoop(new Rng(3))
    const director = new WorldDirector({ app: fakeApp(), textures: fakeTextures(), core, storage: kv })
    let t = 0
    // 抛竿:按下蓄力 → 松开 → 等待
    tick(director, core, t, DT, { holding: true, moveX: 0, moveY: 0 })
    t += DT
    expect(core.phase).toBe('charging')
    tick(director, core, t, DT, { holding: false, moveX: 0, moveY: 0 })
    t += DT
    expect(core.phase).toBe('waiting')
    // 等待 + 咬钩 + 小游戏 + 结算,直到回 idle(上限 20s)
    for (let i = 0; i < 1200 && core.phase !== 'idle'; i++) {
      const holding = core.phase === 'waiting' || core.phase === 'bite' || core.phase === 'minigame'
      tick(director, core, t, DT, { holding, moveX: 0, moveY: 0 })
      t += DT
    }
    expect(core.phase).toBe('idle')
    expect(kv.writes).toBe(0) // 垂钓全程零写入
    // 回 idle 后位置持续落盘
    for (let i = 0; i < 40; i++) tick(director, core, t, DT)
    t += 40 * DT
    expect(kv.writes).toBeGreaterThan(0)
  })

  it('过场全程零写入;到达帧(过场刚结束)位置立即落盘', () => {
    const kv = countingKv()
    const core = new CoreLoop(new Rng(1))
    const director = new WorldDirector({ app: fakeApp(), textures: fakeTextures(), core, storage: kv })
    core.px = VILLAGE_EAST_IN.x
    core.py = VILLAGE_EAST_IN.y
    tick(director, core, 0, DT)
    expect(director.inputLocked).toBe(true)
    expect(kv.writes).toBe(0)
    let t = DT
    // 推进 ~0.43s:淡出已走完(switch 已发生)、淡入进行中——仍在过场,零写入
    for (let i = 0; i < 25; i++) {
      tick(director, core, t, DT)
      t += DT
    }
    expect(director.inputLocked).toBe(true)
    expect(director.mapId).toBe('river') // 已换图,但过场未结束
    expect(kv.writes).toBe(0)
    // 走完淡入:到达帧输入解锁,位置立即落盘
    for (let i = 0; i < 30 && director.inputLocked; i++) {
      tick(director, core, t, DT)
      t += DT
    }
    expect(director.inputLocked).toBe(false)
    expect(kv.writes).toBe(1)
  })
})

describe('WorldDirector:碰撞注入随图切换', () => {
  it('恢复到河谷后行走受河谷水域阻挡:向南走进河流水带被挡在岸边', () => {
    const kv = countingKv()
    kv.set(PLAYER_POSITION_KEY, JSON.stringify({ mapId: 'river', x: 200, y: 220, facing: 'down' }))
    const core = new CoreLoop(new Rng(1))
    new WorldDirector({ app: fakeApp(), textures: fakeTextures(), core, storage: kv })
    // 河谷水带 15–17 行(y 240–288)横贯东西;村舍同点位 (200, 240+) 是草地——
    // 若碰撞来源未随图切换,玩家会一路走进 y > 240
    for (let i = 0; i < 90; i++) core.update(DT, { holding: false, moveX: 0, moveY: 1 })
    expect(core.py).toBeLessThan(240) // 被挡在岸线(脚部盒半高 3)
    expect(core.py).toBeGreaterThan(220) // 且确实向下走过
  })
})
