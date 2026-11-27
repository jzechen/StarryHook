import { Application, Container, Graphics } from 'pixi.js'
import { PLAYER_HALF_H, PLAYER_HALF_W, type CoreLoop } from '../core/coreLoop'
import type { KvStorage } from '../core/kvSnapshot'
import { PlayerPositionStore, type PlayerPositionSnapshot } from '../core/playerPosition'
import type { MapId } from '../core/types'
import { deriveWaterArea, isKnownMapId, SCENE_NAMES, WORLD_MAPS } from '../world/maps'
import { warpAt, type WarpZone } from '../world/warps'
import { blockedBox, worldCollisionSource } from '../world/worldMap'
import type { WarpHint } from '../world/warpHint'
import type { InteractionPromptState } from './worldScene'
import type { SceneTextures } from './textures'
import { SceneBanner } from './sceneBanner'
import { SceneTransition } from './sceneTransition'
import { WorldScene } from './worldScene'

/**
 * 世界导演(票 #35,spec §1.4/§1.5):三图世界的组合根编排层——
 * 场景换图、出口过场演出与玩家位置存档都在这里,核心循环不感知过场与存档。
 *
 * 职责与归属:
 * - 开机恢复:读位置快照 (mapId, x, y, 朝向),语义校验(mapId 入库 + 位置
 *   可行走)后精确恢复;无/坏快照回村舍出生点。当前水域由 mapId 推导
 *   (deriveWaterArea,不落库);碰撞来源随图注入(core.setWorldCollision)。
 * - 出口过场:玩家脚部点走入触发区(idle 时)→ SceneTransition 淡黑 300ms
 *   → 'switch' 时换图落位(朝向保持行进方向——核心 facing 不动)→ 淡入
 *   300ms → 解锁。过场期间组合根停止喂输入(director.inputLocked)。
 * - 存档门禁:仅 idle 且非过场落盘;过场与垂钓中零写入。位置变化
 *   (含过场到达)经短暂节流落盘,跨会话精确恢复。
 */
export interface WorldDirectorDeps {
  app: Application
  textures: SceneTextures
  core: CoreLoop
  /** KvStorage(组合根的 localStorage 适配器;快照键见 playerPosition.ts) */
  storage: KvStorage
  /** 宝箱已开态查询(票 #41,组合根注入;场景按 id 切换闭箱/空箱外观) */
  chestIsOpen?: (chestId: string) => boolean
  /**
   * 入图沿(票 #54,组合根注入):进入场景时以场景 id 通知恰好一次——
   * 开机入图(位置快照恢复亦算)与过场淡入完成沿各一次,与场景横幅同点;
   * 过场进行中不通知。BGM 切轨消费此沿(与场景横幅同点起播对应轨)。
   */
  onSceneEntered?: (mapId: MapId) => void
}

/** 空闲存档节流(秒):位置/朝向变化后至多延迟这么久落盘 */
const POSITION_SAVE_INTERVAL = 0.25

/** 全屏淡黑遮罩色 */
const FADE_COLOR = 0x000000

export class WorldDirector {
  private readonly core: CoreLoop
  private readonly textures: SceneTextures
  private readonly app: Application
  private readonly chestIsOpen: (chestId: string) => boolean
  private readonly onSceneEntered: (mapId: MapId) => void
  private readonly positions: PlayerPositionStore
  private readonly transition = new SceneTransition()
  private readonly overlay: Graphics
  /** 入图场景名横幅(票 #46):屏空间,挂在遮罩之上,换图不重建 */
  readonly sceneBanner = new SceneBanner()
  private scene: WorldScene
  private mapIdValue: MapId
  private saveTimer = 0
  private lastSaved: PlayerPositionSnapshot | null = null
  /** 常驻世界之上的屏空间容器(登记序 = 层序;applyWarp 重建场景后按序复位) */
  private readonly pinned: Container[] = []

  constructor(deps: WorldDirectorDeps) {
    this.app = deps.app
    this.core = deps.core
    this.textures = deps.textures
    this.chestIsOpen = deps.chestIsOpen ?? (() => false)
    this.onSceneEntered = deps.onSceneEntered ?? (() => {})
    this.positions = new PlayerPositionStore(deps.storage)

    // —— 开机恢复(位置是唯一持久的世界状态;spec §1.5)——
    // 形态校验在 store,语义校验在此:mapId 须入库,坐标须可行走
    // (旧版存档/改图后落水的位置按无快照处理,回村舍出生点)。
    const saved = this.positions.load()
    let startMapId: MapId = 'village'
    let x = WORLD_MAPS.village.spawn.x
    let y = WORLD_MAPS.village.spawn.y
    let facing = this.core.facing
    if (saved && isKnownMapId(saved.mapId)) {
      const map = WORLD_MAPS[saved.mapId]
      if (!blockedBox(map, saved.x, saved.y, PLAYER_HALF_W, PLAYER_HALF_H)) {
        startMapId = saved.mapId
        x = saved.x
        y = saved.y
        facing = saved.facing
        this.lastSaved = saved
      }
    }
    this.mapIdValue = startMapId
    this.core.px = x
    this.core.py = y
    this.core.facing = facing
    this.core.setWorldCollision(worldCollisionSource(WORLD_MAPS[startMapId]))
    this.core.setWater(deriveWaterArea(startMapId, x, y))
    this.scene = new WorldScene(this.app, this.textures, WORLD_MAPS[startMapId], this.chestIsOpen)

    // 过场遮罩:全屏黑色,盖在世界与覆盖 UI 之上(构造时挂顶,换图后重新置顶)
    this.overlay = new Graphics()
      .rect(0, 0, this.app.screen.width, this.app.screen.height)
      .fill(FADE_COLOR)
    this.overlay.alpha = 0
    this.overlay.visible = false
    this.app.stage.addChild(this.overlay)

    // 入图场景名横幅(票 #46,spec 术语「场景横幅」):开机即入图——
    // 位置快照恢复亦然(恢复 = 进入该场景)。屏空间挂遮罩之上,并登记常驻
    // 顶层(applyWarp 重建场景后重新置顶,与大满贯演出层同一缝)。
    this.app.stage.addChild(this.sceneBanner.container)
    this.pinned.push(this.sceneBanner.container)
    this.sceneBanner.begin(SCENE_NAMES[startMapId])
    // 开机即入图(票 #54):与横幅同点通知组合根(BGM 据此起播对应轨)
    this.onSceneEntered(startMapId)
  }

  /** 当前场景 id(组合根/hud 消费;换图在过场 'switch' 时刻生效) */
  get mapId(): MapId {
    return this.mapIdValue
  }

  /** 过场进行中 = 组合根停止喂输入(核心循环不感知,停在 idle) */
  get inputLocked(): boolean {
    return this.transition.locked
  }

  /** 每帧推进:过场状态机 → 换图落位 → 出口检测 → 存档门禁 → 场景渲染 */
  update(t: number, dt: number, promptState?: InteractionPromptState | null, warpPrompt?: WarpHint | null): void {
    const action = this.transition.update(dt)
    if (action === 'switch' && this.transition.warp) this.applyWarp(this.transition.warp)
    // 入图横幅(票 #46):淡入完成沿('arrived')起演新场景名——「过场淡入
    // 完成后底部显示」,确认切换已发生;演出推进每帧走(未开演为空操作)
    // 入图沿(票 #54):同一沿通知组合根(BGM 切轨与横幅同点,恰好一次)
    if (action === 'arrived') {
      this.sceneBanner.begin(SCENE_NAMES[this.mapIdValue])
      this.onSceneEntered(this.mapIdValue)
    }
    this.sceneBanner.update(dt)

    this.overlay.alpha = this.transition.alpha
    this.overlay.visible = this.transition.alpha > 0

    // 出口检测:仅待机可触发(垂钓中不离开场景;过场结束后到达点不在对侧
    // 触发区内,几何由 maps.test 不变量保证,不会到达即回传)
    if (!this.transition.locked && this.core.phase === 'idle') {
      const warp = warpAt(WORLD_MAPS[this.mapIdValue], this.core.px, this.core.py)
      if (warp) this.transition.begin(warp)
    }

    this.trySave(dt)
    // 出口接近浮签(票 #46):过场中强制隐藏(组合根 gating 之外的导演侧
    // 双保险——过场是本层的职责,门禁在本层收口)
    this.scene.update(this.core, t, dt, promptState, this.transition.locked ? null : warpPrompt)
  }

  /**
   * 登记常驻世界之上的屏空间容器(票 #43 大满贯演出层,组合根构造演出后调用):
   * 换图重建场景会把新场景树追加在既有 stage children 之上,登记的容器若不复位
   * 就会被压到世界之下;applyWarp 按登记次序重新置顶,维持开机层序(演出在遮罩之上)。
   */
  pinOnTop(container: Container): void {
    this.pinned.push(container)
  }

  /** 换图落位(过场 'switch' 时刻,全黑瞬间):旧场景销毁、对侧入口出现 */
  private applyWarp(warp: WarpZone): void {
    if (!isKnownMapId(warp.target)) return // 出口数据已过校验;未入库目标按原地不动兜底
    const next = WORLD_MAPS[warp.target]
    this.scene.destroy()
    this.mapIdValue = warp.target
    this.core.setWorldCollision(worldCollisionSource(next))
    this.core.px = warp.tx
    this.core.py = warp.ty
    // 朝向保持行进方向:core.facing 不动(spec §1.4)
    this.core.setWater(deriveWaterArea(warp.target, warp.tx, warp.ty))
    this.scene = new WorldScene(this.app, this.textures, next, this.chestIsOpen)
    this.app.stage.addChild(this.overlay) // 新场景压顶后,遮罩重新置顶
    // 常驻顶层容器(演出层)随之复位:新场景树也追加在它们之上,仅遮罩复位不够
    for (const container of this.pinned) this.app.stage.addChild(container)
    // 到达即存:把节流计时顶到阈值,过场结束后的第一帧立即落盘
    // (此刻仍在过场中,不直接写——「过场中不写存档」口径保持)
    this.saveTimer = POSITION_SAVE_INTERVAL
  }

  /** 空闲存档门禁:仅 idle 落盘(垂钓/过场中零写入);内容不变不重写 */
  private trySave(dt: number): void {
    if (this.transition.locked) return
    if (this.core.phase !== 'idle') return
    this.saveTimer += dt
    if (this.saveTimer < POSITION_SAVE_INTERVAL) return
    this.saveTimer = 0
    const snapshot: PlayerPositionSnapshot = {
      mapId: this.mapIdValue,
      x: this.core.px,
      y: this.core.py,
      facing: this.core.facing,
    }
    const last = this.lastSaved
    if (last && last.mapId === snapshot.mapId && last.x === snapshot.x && last.y === snapshot.y && last.facing === snapshot.facing) {
      return
    }
    this.lastSaved = snapshot
    this.positions.save(snapshot)
  }
}
