import { Application, Container, Graphics, Texture } from 'pixi.js'
import { describe, expect, it, vi } from 'vitest'
import type { CoreLoop } from '../core/coreLoop'
import type { LoopPhase } from '../core/types'
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
    bobber: tex(),
    fishFrames: { slim: n(2), round: n(2), heavy: n(2), puff: n(2), bolt: n(2) },
  }
}

/** 固定逻辑分辨率下的假 Application:只提供 WorldScene 用到的 screen 与 stage */
function fakeApp(): { app: Application; world: () => Container } {
  let world: Container | undefined
  const app = {
    screen: { width: 480, height: 270 },
    stage: {
      addChild: (...children: Container[]) => {
        world = children[0]
      },
    },
  } as unknown as Application
  // world 以取值函数返回:WorldScene 构造时才把场景根挂上 stage,返回时还没发生
  return { app, world: () => world! }
}

/** 最小可用核心状态:字段名与 CoreLoop 公开字段一致,取值为世界像素 */
function fakeCore(phase: LoopPhase): CoreLoop {
  return {
    px: 72,
    py: 64,
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
