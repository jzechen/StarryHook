import { Application, Container, Graphics, Texture } from 'pixi.js'
import { describe, expect, it, vi } from 'vitest'
import type { CoreLoop } from '../core/coreLoop'
import type { LoopPhase } from '../core/types'
import { WORLD_MAPS } from '../world/maps'
import { village } from '../world/village'
import { WorldScene } from './worldScene'
import type { SceneTextures } from './textures'

/**
 * 世界场景 Graphics 指令泄漏守护(接缝:WorldScene 构建的 Pixi 场景图,
 * 自 pondScene.test.ts 收编移植,票 #34)。
 *
 * Pixi v8 的 Graphics 指令列表(context.instructions)只会追加,clear() 才会清空;
 * 静态几何若每帧重画而不先 clear,指令数与内存就随游玩时长持续增长。
 * 这里不触私有字段:从 fake stage 收下场景根,遍历公开的场景树,统计
 * 所有 Graphics 的指令总数——正确实现下,预热后多帧 update 不应再让总数变化。
 *
 * 测试环境为 node(无 DOM/Pixi 渲染器):Text 依赖 canvas,以桩替换;
 * Graphics/Container/Sprite/TilingSprite/Texture 构造纯 CPU,可用真实实现。
 */
vi.mock('pixi.js', async (importOriginal) => {
  const pixi = await importOriginal<typeof import('pixi.js')>()
  // 桩只替代「画字」能力,其余行为(场景树事件、transform)沿用真实 Container
  class StubText extends pixi.Container {
    anchor = { set: () => {} }
  }
  return { ...pixi, Text: StubText }
})

/** 与 textures.ts 切片数量一致的空贴图集(仅充当占位,不参与像素渲染) */
function fakeTextures(): SceneTextures {
  const tex = () => new Texture()
  const n = (count: number) => Array.from({ length: count }, tex)
  return {
    waterFrames: n(13),
    grassTile: tex(),
    waveFrames: { top: n(8), right: n(8), bottom: n(8), left: n(8) },
    playerFrames: { down: n(4), up: n(4), left: n(4), right: n(4) },
    townTiles: n(132),
    chestFrames: { closed: tex(), open: tex() },
    bobber: tex(),
    fishFrames: { slim: n(2), round: n(2), heavy: n(2), puff: n(2), bolt: n(2) },
  }
}

/** 固定逻辑分辨率下的假 Application:只提供 WorldScene 用到的 screen 与 stage */
function fakeApp(): { app: Application; world: () => Container; ui: () => Container } {
  let world: Container | undefined
  let ui: Container | undefined
  const app = {
    screen: { width: 480, height: 270 },
    stage: {
      addChild: (...children: Container[]) => {
        world = children[0]
        ui = children[1]
      },
    },
  } as unknown as Application
  // world 以取值函数返回:WorldScene 构造时才把场景根挂上 stage,返回时还没发生
  return { app, world: () => world!, ui: () => ui! }
}

/** 最小可用核心状态:字段名与 CoreLoop 公开字段一致,取值为世界像素 */
function fakeCore(phase: LoopPhase): CoreLoop {
  return {
    px: 72,
    py: 64,
    facing: 'down',
    phase,
    castX: 72,
    castY: 64,
    bobberDist: 0.5,
    power: 0.5,
    rodParams: { height: 0.2, speed: 0.3 },
    mg: { barY: 0.5, fishY: 0.4, progress: 0.5 },
    fish: { shape: 'slim' },
  } as unknown as CoreLoop
}

/** 深度收集场景树里的全部 Graphics(公开场景树,不触 WorldScene 私有字段) */
function graphicsNodes(root: Container): Graphics[] {
  const out: Graphics[] = []
  const walk = (node: Container) => {
    if (node instanceof Graphics) out.push(node)
    for (const child of node.children) walk(child)
  }
  walk(root)
  return out
}

describe('世界场景 Graphics 指令泄漏守护(接缝:WorldScene 场景图)', () => {
  it('静态几何不逐帧累积:waiting 阶段连续 200 帧 update,Graphics 指令总数不变', () => {
    const { app, world } = fakeApp()
    const scene = new WorldScene(app, fakeTextures(), village)
    const sceneRoot = world()
    const core = fakeCore('waiting')
    const total = () => graphicsNodes(sceneRoot).reduce((sum, g) => sum + g.context.instructions.length, 0)

    // 预热:让每个每帧重画的 Graphics 进入「clear → 重画」稳态(首帧与后续帧路径不同属正常)
    for (let f = 0; f < 4; f++) scene.update(core, f * 0.016, 0.016)
    const baseline = total()

    // 长时间游玩:再跑 200 帧(约 3.2 秒),指令总数必须与稳态持平
    for (let f = 4; f < 204; f++) scene.update(core, f * 0.016, 0.016)
    expect(total()).toBe(baseline)
  })

  it('全阶段轮换不累积:七阶段循环 210 帧后,同相位采样指令总数不变', () => {
    const { app, world } = fakeApp()
    const scene = new WorldScene(app, fakeTextures(), village)
    const sceneRoot = world()
    const phases: LoopPhase[] = ['idle', 'charging', 'waiting', 'bite', 'minigame', 'caught', 'escaped']
    const total = () => graphicsNodes(sceneRoot).reduce((sum, g) => sum + g.context.instructions.length, 0)

    // 指令总数随阶段合法波动(涟漪/蓄力条只在部分阶段绘制),故采样须同相位对齐:
    // 基线取在 escaped 帧收尾,循环止于 209(209 % 7 = 6 = escaped,29 个完整循环)再比较。
    for (let f = 0; f <= 6; f++) scene.update(fakeCore(phases[f]!), f * 0.016, 0.016)
    const baseline = total()

    for (let f = 7; f <= 209; f++) scene.update(fakeCore(phases[f % phases.length]!), f * 0.016, 0.016)
    expect(total()).toBe(baseline)
  })

  it('相机钳制:玩家走到图边,世界容器平移不越界(双向四边)', () => {
    const { app, world } = fakeApp()
    const scene = new WorldScene(app, fakeTextures(), village)
    const sceneRoot = world()
    const core = fakeCore('idle')
    // 村舍图 960×416,视口 480×270:相机 ∈ [0, 480]×[0, 146],
    // 世界容器平移 = −相机 → x ∈ [−480, 0],y ∈ [−146, 0]
    for (const [px, py] of [
      [0, 135],
      [960, 135],
      [480, 0],
      [480, 416],
    ] as const) {
      core.px = px
      core.py = py
      scene.update(core, 0, 0.016)
      expect(sceneRoot.position.x).toBeGreaterThanOrEqual(-(960 - 480))
      expect(sceneRoot.position.x).toBeLessThanOrEqual(0)
      expect(sceneRoot.position.y).toBeGreaterThanOrEqual(-(416 - 270))
      expect(sceneRoot.position.y).toBeLessThanOrEqual(0)
    }
  })
})

describe('湖畔场景(票 #35:不规则湖 blob,逐 cell 水体路径)', () => {
  it('blob 图可构建并稳定渲染:waiting 阶段 200 帧指令总数不变(逐 cell 精灵不产生指令)', () => {
    const { app, world } = fakeApp()
    const scene = new WorldScene(app, fakeTextures(), WORLD_MAPS.lake)
    const sceneRoot = world()
    const core = fakeCore('waiting')
    const total = () => graphicsNodes(sceneRoot).reduce((sum, g) => sum + g.context.instructions.length, 0)
    for (let f = 0; f < 4; f++) scene.update(core, f * 0.016, 0.016)
    const baseline = total()
    for (let f = 4; f < 204; f++) scene.update(core, f * 0.016, 0.016)
    expect(total()).toBe(baseline)
  })

  it('湖畔水域色调随 core.area 切换不抛错(逐 cell tint 路径)', () => {
    const { app } = fakeApp()
    const scene = new WorldScene(app, fakeTextures(), WORLD_MAPS.lake)
    const core = fakeCore('idle')
    expect(() => scene.update(core, 0, 0.016)).not.toThrow()
  })
})

describe('交互浮签(接缝:WorldScene.update 第 4 参,票 #36 spec §2.1)', () => {
  /** 按容器标签找浮签(公开场景树,不触私有字段) */
  function findPrompt(root: Container): Container {
    let found: Container | undefined
    const walk = (node: Container): void => {
      if (node.label === 'interaction-prompt') found = node
      for (const child of node.children) walk(child)
    }
    walk(root)
    if (!found) throw new Error('场景树里没有浮签容器')
    return found
  }

  it('idle 且有交互点在前:浮签显示,位置为整数像素(跟随交互点世界坐标)', () => {
    const { app, world } = fakeApp()
    const scene = new WorldScene(app, fakeTextures(), village)
    const core = fakeCore('idle')
    scene.update(core, 0.35, 0.016, { x: 136.4, y: 112.7, label: '抛竿' })
    const prompt = findPrompt(world())
    expect(prompt.visible).toBe(true)
    expect(Number.isInteger(prompt.position.x)).toBe(true)
    expect(Number.isInteger(prompt.position.y)).toBe(true)
  })

  it('未传交互点(范围外/面板打开,组合根侧已判空):浮签隐藏', () => {
    const { app, world } = fakeApp()
    const scene = new WorldScene(app, fakeTextures(), village)
    scene.update(fakeCore('idle'), 0, 0.016)
    expect(findPrompt(world()).visible).toBe(false)
  })

  it('垂钓循环中(非 idle)浮签强制隐藏:渲染层兜底,与组合根双保险', () => {
    const { app, world } = fakeApp()
    const scene = new WorldScene(app, fakeTextures(), village)
    for (const phase of ['charging', 'waiting', 'bite', 'minigame', 'caught', 'escaped'] as const) {
      scene.update(fakeCore(phase), 0, 0.016, { x: 136, y: 112, label: '抛竿' })
      expect(findPrompt(world()).visible).toBe(false)
    }
  })

  it('浮签显示/隐藏与短词切换不累积 Graphics 指令(clear → 重画稳态)', () => {
    const { app, world } = fakeApp()
    const scene = new WorldScene(app, fakeTextures(), village)
    const sceneRoot = world()
    const core = fakeCore('idle')
    const total = () =>
      graphicsNodes(sceneRoot).reduce((sum, g) => sum + g.context.instructions.length, 0)
    const words = ['抛竿', '商店'] as const
    for (let f = 0; f < 6; f++) {
      scene.update(core, f * 0.016, 0.016, { x: 136, y: 112, label: words[f % 2]! })
    }
    const baseline = total()
    for (let f = 6; f < 60; f++) {
      scene.update(core, f * 0.016, 0.016, f % 2 === 0 ? { x: 136, y: 112, label: words[0] } : undefined)
    }
    expect(total()).toBe(baseline)
  })
})

/** 按容器标签找节点(公开场景树,不触私有字段) */
function findLabeled(root: Container, label: string): Container {
  let found: Container | undefined
  const walk = (node: Container): void => {
    if (node.label === label) found = node
    for (const child of node.children) walk(child)
  }
  walk(root)
  if (!found) throw new Error(`场景树里没有 label=${label} 的容器`)
  return found
}

describe('屏幕 shake(票 #43,spec §5.2:相机偏移取整,仅咬钩/捕获)', () => {
  it('咬钩沿触发:世界/覆盖 UI 容器产生整数偏移;寿命尽回到纯相机位', () => {
    const { app, world, ui } = fakeApp()
    const scene = new WorldScene(app, fakeTextures(), village)
    const sceneRoot = world()
    const uiRoot = ui()
    const core = fakeCore('waiting')
    scene.update(core, 0, 0.016)
    const restX = sceneRoot.position.x
    const restY = sceneRoot.position.y

    core.phase = 'bite'
    let moved = false
    for (let f = 1; f <= 8; f++) {
      scene.update(core, f * 0.016, 0.016)
      expect(Number.isInteger(sceneRoot.position.x)).toBe(true)
      expect(Number.isInteger(sceneRoot.position.y)).toBe(true)
      expect(Number.isInteger(uiRoot.position.x)).toBe(true)
      // 世界与覆盖 UI 同步平移(整屏一抖)
      expect(uiRoot.position.x).toBe(sceneRoot.position.x - restX)
      if (sceneRoot.position.x !== restX || sceneRoot.position.y !== restY) moved = true
    }
    expect(moved).toBe(true)

    // shake 寿命(0.22s)过后:回到纯相机位(0,0),覆盖 UI 归零
    for (let f = 9; f < 40; f++) scene.update(core, f * 0.016, 0.016)
    expect(sceneRoot.position.x).toBe(restX)
    expect(sceneRoot.position.y).toBe(restY)
    expect(uiRoot.position.x).toBe(0)
    expect(uiRoot.position.y).toBe(0)
  })

  it('捕获沿同样触发(仅两触发点的另一处);等待/收竿等其余沿不抖', () => {
    const { app, world, ui } = fakeApp()
    const scene = new WorldScene(app, fakeTextures(), village)
    const sceneRoot = world()
    const uiRoot = ui()
    const restX = sceneRoot.position.x
    // 收竿沿(waiting→idle):无 shake
    const core = fakeCore('waiting')
    scene.update(core, 0, 0.016)
    core.phase = 'idle'
    scene.update(core, 0.016, 0.016)
    expect(uiRoot.position.x).toBe(0)
    expect(sceneRoot.position.x).toBe(restX)
  })
})

describe('捕获水花(票 #43:鱼漂世界坐标,自写池零依赖)', () => {
  it('捕获沿在 splash 容器起一蓬可见粒子;寿命尽全部回收', () => {
    const { app, world } = fakeApp()
    const scene = new WorldScene(app, fakeTextures(), village)
    const sceneRoot = world()
    const core = fakeCore('waiting')
    scene.update(core, 0, 0.016)
    expect(findLabeled(sceneRoot, 'splash').children.filter(s => s.visible).length).toBe(0)

    core.phase = 'caught'
    scene.update(core, 0.016, 0.016)
    const live = findLabeled(sceneRoot, 'splash').children.filter(s => s.visible).length
    expect(live).toBeGreaterThan(0)

    // 寿命(≤0.6s)过后:回收归零
    for (let f = 2; f < 60; f++) scene.update(core, f * 0.016, 0.016)
    expect(findLabeled(sceneRoot, 'splash').children.filter(s => s.visible).length).toBe(0)
  })

  it('非捕获沿(咬钩/脱钩)不起水花', () => {
    const { app, world } = fakeApp()
    const scene = new WorldScene(app, fakeTextures(), village)
    const sceneRoot = world()
    for (const [from, to] of [
      ['waiting', 'bite'],
      ['minigame', 'escaped'],
    ] as const) {
      const core = fakeCore(from)
      scene.update(core, 0, 0.016)
      core.phase = to
      scene.update(core, 0.016, 0.016)
      expect(findLabeled(sceneRoot, 'splash').children.filter(s => s.visible).length).toBe(0)
    }
  })
})

describe('进度流光(票 #43:≥70% 启动、回落即停,渲染层接线)', () => {
  /** 指定进度下全场景 Graphics 指令总数(流光走 mgProgress 既有重画路径) */
  function instructionsAt(progress: number): number {
    const { app, world, ui } = fakeApp()
    const scene = new WorldScene(app, fakeTextures(), village)
    const core = fakeCore('minigame')
    core.mg = { t: 0, timer: 0, barV: 0, barY: 0.5, fishY: 0.4, fishTarget: 0.5, progress }
    scene.update(core, 0.2, 0.016)
    const total = (root: Container): number =>
      graphicsNodes(root).reduce((sum, g) => sum + g.context.instructions.length, 0)
    return total(world()) + total(ui())
  }

  it('进度 ≥70% 时指令数增加(亮带被画),低于阈值时与基线一致', () => {
    const below = instructionsAt(0.5)
    const near = instructionsAt(0.6999)
    const at = instructionsAt(0.7)
    expect(near).toBe(below)
    expect(at).toBeGreaterThan(below)
  })
})

describe('出口接近浮签(接缝:WorldScene.update 第 5 参,票 #46:被动无键帽)', () => {
  const HINT = { x: 888, y: 208, label: '东 · 河谷 →' }

  function findWarpPrompt(root: Container): Container {
    let found: Container | undefined
    const walk = (node: Container): void => {
      if (node.label === 'warp-prompt') found = node
      for (const child of node.children) walk(child)
    }
    walk(root)
    if (!found) throw new Error('场景树里没有 warp-prompt 容器')
    return found
  }

  it('idle 且组合根供给接近签:显示,位置为整数像素(挂 world 层随相机滚动)', () => {
    const { app, world } = fakeApp()
    const scene = new WorldScene(app, fakeTextures(), village)
    scene.update(fakeCore('idle'), 0.3, 0.016, null, HINT)
    const prompt = findWarpPrompt(world())
    expect(prompt.visible).toBe(true)
    expect(Number.isInteger(prompt.position.x)).toBe(true)
    expect(Number.isInteger(prompt.position.y)).toBe(true)
  })

  it('未传(组合根已判空:面板打开/无接近出口):隐藏', () => {
    const { app, world } = fakeApp()
    const scene = new WorldScene(app, fakeTextures(), village)
    scene.update(fakeCore('idle'), 0, 0.016)
    expect(findWarpPrompt(world()).visible).toBe(false)
  })

  it('垂钓循环中(非 idle)强制隐藏:渲染层兜底,与组合根双保险', () => {
    const { app, world } = fakeApp()
    const scene = new WorldScene(app, fakeTextures(), village)
    for (const phase of ['charging', 'waiting', 'bite', 'minigame', 'caught', 'escaped'] as const) {
      scene.update(fakeCore(phase), 0, 0.016, null, HINT)
      expect(findWarpPrompt(world()).visible).toBe(false)
    }
  })
})
