import { Application, Container, Graphics, Sprite, Text, TilingSprite } from 'pixi.js'
import { advanceWalkPhase, breathPose, castLeanPose, facingToward, shadowPose, walkBobOffset } from './characterMotion'
import { computeCamera } from './camera'
import { AREA_PALETTES } from './areaPalette'
import { DEFAULT_AREA } from '../core/waterAreas'
import type { CoreLoop } from '../core/coreLoop'
import type { Facing, LoopPhase, WaterAreaId } from '../core/types'
import { BASE_GROUND_GID, waterFillsBounds, type WorldMapData } from '../world/worldMap'
import { waterAimPoint } from '../world/waterDistance'
import { InteractionPrompt } from './interactionPrompt'
import { ScreenShake, shakeTrigger } from './screenShake'
import { SplashLayer } from './splash'
import { shimmerActive, shimmerBand } from './progressShimmer'
import type { SceneTextures, WaveEdge } from './textures'
import { FISH_FRAME_COUNT, PLAYER_FRAME_COUNT, TILE, WAVE_FRAME_COUNT, WATER_FRAME_COUNT } from './textures'

/**
 * 世界场景(票 #34 起步,票 #35 扩为三图通用):世界地图的薄渲染器。
 *
 * 架构(ADR-0002 精灵化;pondScene 的收编版):世界容器随相机平移
 * (整数像素,computeCamera),其上分层 = 草地基底(TilingSprite,整片)
 * → 地面叠加(路/石草等非基底 ground cell,逐 tile)→ 水体(形态分岔:
 * 填满 bbox 的矩形水沿用整片 TilingSprite + 池底/描边静态几何;湖畔 blob/
 * 河谷带状走逐 cell 水精灵)→ 岸线泡沫(逐 tile,由水 cell 邻接现算,
 * 不入地图数据)→ 装饰(deco 层逐 tile Sprite + 视口剔除)→ 实体
 * (角色/浮标/鱼线/蓄力条/咬钩「!」)→ 捕获水花(票 #43 粒子池)→
 * 交互浮签 → 覆盖 UI(小游戏面板 + 进度流光,屏空间,不随相机滚动);
 * 屏幕 shake(票 #43)以整数偏移叠加在两容器的平移上。
 *
 * 坐标系:核心循环输出世界像素(脚部点);画布固定 480×270 逻辑分辨率
 * (视口层信箱缩放),地图 60×26 tile = 960×416px,图内双向卷动。
 * 场景可整体换图(票 #35 出口过场):WorldScene 每图一个实例,换图时
 * 组合根 destroy 旧实例、建新实例(共享贴图归 SceneTextures,不销毁)。
 */

/** 流水帧轮换周期(秒)——13 帧一轮约 2s,读作缓慢水流(沿 pondScene) */
const WATER_FRAME_PERIOD = 0.15
/** 岸线波纹帧轮换周期(秒)——8 帧一轮 2.4s,浪涌节奏(沿 pondScene) */
const WAVE_FRAME_PERIOD = 0.3
/** 小游戏鱼精灵帧周期(秒)——2 帧交替(沿 pondScene) */
const FISH_FRAME_PERIOD = 0.2
/** 角色脚底相对核心坐标点(px/py)的偏移:贴图底边落在脚部点 */
const PLAYER_FOOT_OFFSET = 7
/** 波纹贴片土侧宽度:泡沫带起点距水边的像素数(沿 pondScene) */
const WAVE_LAND_SIDE = 6
/** 浮标落点距水边的内缩(像素):抛得再近也不落岸上 */
const BOBBER_INSET = 8
/** 浮标渲染侧微调量(贴图 8×12,锚点居中;沿 pondScene) */
const BOBBER_FX = {
  /** 鱼线系点相对浮标中心的偏移 */
  lineAnchorY: -4,
  /** 抛竿飞行的相对抬升 */
  castLift: 42,
  /** 抛竿起飞点相对竿尖的抬高 */
  castStartLift: 12,
  /** 等待中随波起伏幅度 */
  idleBob: 2,
  /** 咬钩下沉量 */
  biteDip: 4,
}

/** 岸线泡沫贴片:贴在水 cell 的岸边一侧,phase 决定环流中的帧偏移 */
interface FoamTile {
  sprite: Sprite
  edge: WaveEdge
  phase: number
}

/** 视口剔除用的静态精灵(位置固定,逐帧只翻 visible) */
interface CulledSprite {
  sprite: Sprite
  x: number
  y: number
}

/**
 * 交互浮签的渲染入参(票 #36):组合根按「idle ∧ 无面板 ∧ 范围内最近交互点」
 * 供给;null/缺省 = 本帧无浮签。渲染层另兜底「非 idle 强制隐藏」双保险。
 */
export interface InteractionPromptState {
  /** 交互点世界坐标 */
  x: number
  y: number
  /** 动作短词(「抛竿」「商店」) */
  label: string
}

/**
 * 宝箱已开态查询(票 #41,组合根注入):渲染层按 id 逐帧取两态外观——
 * 已开 = 开箱帧(空箱),未开 = 闭箱帧;跨会话恢复后首帧即空箱。
 */
export type ChestOpenLookup = (chestId: string) => boolean

/** 场景内一只宝箱:物件层条目派生的静态精灵(位置不随帧变,贴图随已开态切换) */
interface ChestSprite {
  chestId: string
  sprite: Sprite
}

export class WorldScene {
  private app: Application
  private textures: SceneTextures
  private map: WorldMapData

  /** 世界层(随相机平移)与覆盖 UI 层(屏空间) */
  private world = new Container()
  private ui = new Container()
  private groundTiling: TilingSprite
  /** 地面叠加容器(路/石草等非基底 cell;tint 随水域演出走) */
  private groundOverlay = new Container()
  private groundSprites: CulledSprite[] = []
  /** 水体层(矩形水 = 池底/整片 TilingSprite/描边;blob/带状 = 逐 cell 精灵) */
  private waterLayer = new Container()
  /** 池底与描边(静态几何:构造期绘制一次;Pixi v8 指令只增不减,不逐帧重画)。
   * 仅「水填满 bbox」的矩形水域建;blob/带状水走逐 cell 精灵,无矩形描边。 */
  private pondFill = new Graphics()
  private waterTiling: TilingSprite | null = null
  private pondStroke = new Graphics()
  /** 逐 cell 水体(blob/带状;共享流水帧逐帧轮换 + 视口剔除) */
  private waterCellSprites: CulledSprite[] = []
  private waveLayer = new Container()
  private foamTiles: FoamTile[] = []
  private decoLayer = new Container()
  private decoSprites: CulledSprite[] = []
  /** 宝箱层(票 #41):物件层 chest 条目派生,deco 之上、角色之下 */
  private chestLayer = new Container()
  private chestSprites: ChestSprite[] = []
  /** 静态农夫(票 #36 摊位场景件):立于摊板之后的摊主立绘 */
  private farmer: Sprite
  private ripples = new Graphics()
  private line = new Graphics()
  private chargeBar = new Graphics()
  private player = new Container()
  /** 脚下影子(票 #49):贴地椭圆,随 bob 微缩淡;画在角色精灵之下 */
  private shadow = new Graphics()
  private playerSprite: Sprite
  private bobberSprite = new Container()
  private bang: Text
  /** 交互浮签(票 #36):画布内像素浮签,挂 world 层随相机滚动 */
  private prompt = new InteractionPrompt()
  /** 捕获水花(票 #43):轻量 sprite 粒子池,挂 world 层,坐标 = 鱼漂世界坐标 */
  private splash = new SplashLayer()
  /** 屏幕 shake(票 #43):相机偏移量,像素取整后加到世界/覆盖 UI 两容器 */
  private shake = new ScreenShake()
  private track = new Graphics()
  private mgBar = new Graphics()
  private mgFishSprite: Sprite
  private mgProgress = new Graphics()

  private chestIsOpen: ChestOpenLookup
  private prevPhase: LoopPhase = 'idle'
  /** 抛竿飞行动画进度 0..1 */
  private castT = 1
  private biteT = 0
  /** 最近一次应用的水域色调(变化才重设 tint) */
  private renderedArea: WaterAreaId | null = null
  // —— 角色动画状态(朝向由核心持有,票 #35;行走相位/bob/呼吸曲线在 characterMotion,票 #49) ——
  /** 行走相位(按实际位移推进,票 #49);静止时归零回到待机帧 */
  private walkPhase = 0
  /** 持竿朝向(票 #49):垂钓中锁「朝水」;回 idle 释放,渲染回核心朝向 */
  private rodFacing: Facing | null = null
  private prevPx = -1
  private prevPy = -1

  constructor(app: Application, textures: SceneTextures, map: WorldMapData, chestIsOpen: ChestOpenLookup = () => false) {
    this.app = app
    this.textures = textures
    this.map = map

    // 草地基底:Kenney 平草(tile 0)整片平铺(BASE_GROUND_GID 契约,见 worldMap.ts)
    this.groundTiling = new TilingSprite({
      texture: textures.townTiles[0]!,
      width: map.widthPx,
      height: map.heightPx,
    })

    // 地面叠加:ground 层非基底 cell(泥路等)逐 tile 静态精灵
    for (let ty = 0; ty < map.height; ty++) {
      for (let tx = 0; tx < map.width; tx++) {
        const gid = map.ground[ty * map.width + tx]!
        if (gid === 0 || gid === BASE_GROUND_GID) continue
        this.addCulled(this.groundOverlay, this.groundSprites, map, gid, tx, ty)
      }
    }

    // 水体:形态分岔(票 #35)——填满 bbox 的矩形水沿用整片 TilingSprite
    // (spec §1.2 渐进收编)+ 池底/描边;blob/带状(河谷/湖畔)走逐 cell 精灵,
    // 岸线由泡沫承担。动画两路都按帧轮换,相位无差异。
    if (waterFillsBounds(map)) {
      const wr = map.waterRectPx
      this.waterTiling = new TilingSprite({ texture: textures.waterFrames[0]!, width: wr.width, height: wr.height })
      this.waterTiling.position.set(wr.x, wr.y)
      this.pondFill.rect(wr.x, wr.y, wr.width, wr.height).fill(0xffffff)
      this.pondStroke.rect(wr.x, wr.y, wr.width, wr.height).stroke({ width: 4, color: 0xffffff })
      this.waterLayer.addChild(this.pondFill, this.waterTiling, this.pondStroke)
    } else {
      for (let ty = 0; ty < map.height; ty++) {
        for (let tx = 0; tx < map.width; tx++) {
          if (map.water[ty * map.width + tx] === 0) continue
          const sprite = new Sprite(textures.waterFrames[0]!)
          sprite.position.set(tx * TILE, ty * TILE)
          this.waterLayer.addChild(sprite)
          this.waterCellSprites.push({ sprite, x: tx * TILE, y: ty * TILE })
        }
      }
    }

    // 装饰:deco 层逐 tile 静态精灵(视口剔除在 update)
    for (let ty = 0; ty < map.height; ty++) {
      for (let tx = 0; tx < map.width; tx++) {
        const gid = map.deco[ty * map.width + tx]!
        if (gid === 0) continue
        this.addCulled(this.decoLayer, this.decoSprites, map, gid, tx, ty)
      }
    }

    // 宝箱(票 #41,spec §4.5):物件层 chest 条目 → 两态精灵(闭箱/开箱),
    // 位置随物件点(锚 tile 中心;贴图底边落在 tile 底 = 物件点 +8px);
    // 已开态逐帧查注入的 store(3–4 只,零剔除成本),开箱当帧即换空箱外观。
    // 素材契约:chest 属性已由 interactions 解析期校验(非串/目录外进不来)。
    this.chestIsOpen = chestIsOpen
    for (const o of map.objects) {
      if (o.type !== 'chest') continue
      const chestId = o.properties['chest']
      if (typeof chestId !== 'string') continue
      const sprite = new Sprite(textures.chestFrames.closed)
      sprite.anchor.set(0.5, 1)
      sprite.position.set(o.x, o.y + TILE / 2)
      this.chestLayer.addChild(sprite)
      this.chestSprites.push({ chestId, sprite })
    }

    // 静态农夫(票 #36 立项,票 #49 换真件):摊位交互点后一格的摊主立绘,
    // 画在 deco 之上、角色之下(玩家从摊前走过时在前景)。素材 = Tiny Farm
    // tile 0109 派生立绘(textures.farmerStand,#36 的暖色 tint 替身就此退役),
    // 坐标随摊位物件走(数据驱动,不写死像素)。
    this.farmer = new Sprite(textures.farmerStand)
    this.farmer.anchor.set(0.5, 1)
    this.farmer.visible = false
    const stallObj = map.objects.find(o => o.type === 'stall')
    if (stallObj) {
      this.farmer.position.set(stallObj.x, stallObj.y - TILE)
      this.farmer.visible = true
    }

    // 岸线泡沫:逐水 cell 按邻接贴边(波峰绕水域质心环流)
    this.buildFoam()

    this.bang = new Text({
      text: '!',
      style: {
        fontFamily: 'sans-serif',
        fontSize: 22,
        fontWeight: '900',
        fill: 0xffd23f,
        stroke: { color: 0x5a3e00, width: 3 },
      },
    })
    this.bang.anchor.set(0.5)
    this.bang.visible = false

    const bobber = new Sprite(textures.bobber)
    bobber.anchor.set(0.5)
    this.bobberSprite.addChild(bobber)

    this.mgFishSprite = new Sprite(textures.fishFrames.slim[0]!)
    this.mgFishSprite.anchor.set(0.5)
    this.mgFishSprite.visible = false

    // 角色:脚底锚在核心坐标点下方(沿 pondScene);程序化姿态(bob/呼吸/
    // 前倾)直接应用到该精灵,label 供场景树测试定位(票 #49)
    this.playerSprite = new Sprite(textures.playerFrames.down[0]!)
    this.playerSprite.anchor.set(0.5, 1)
    this.playerSprite.position.set(0, PLAYER_FOOT_OFFSET)
    this.playerSprite.label = 'player-body'
    // 脚下影子(票 #49):先画影子再画角色(精灵压住影子后半),位置 = 角色
    // 容器内的地面线(脚底处),不随 bob 抬起——人抬起时影子留在地面读作离地
    this.shadow.label = 'player-shadow'
    this.shadow.position.set(0, PLAYER_FOOT_OFFSET)
    this.player.addChild(this.shadow, this.playerSprite)

    app.stage.addChild(this.world, this.ui)
    this.world.addChild(
      this.groundTiling,
      this.groundOverlay,
      this.waterLayer,
      this.waveLayer,
      this.decoLayer,
      this.chestLayer,
      this.farmer,
      this.ripples,
      this.line,
      this.chargeBar,
      this.player,
      this.bobberSprite,
      this.bang,
      this.splash.container,
      this.prompt.container,
    )
    this.ui.addChild(this.track, this.mgBar, this.mgFishSprite, this.mgProgress)

    // 首帧前先落默认水域色调(此后随 core.area 变化在 update 里切换)
    this.applyAreaPalette(DEFAULT_AREA)
  }

  /** 场景切换(票 #35 出口过场):销毁自身容器;共享贴图归 SceneTextures,不在此销毁 */
  destroy(): void {
    this.world.destroy({ children: true })
    this.ui.destroy({ children: true })
  }

  /** 按水域 tint 背景/水面(票 #15 沿革);快照缺 area 按默认水域渲染,不因缺字段抛错 */
  private applyAreaPalette(area: WaterAreaId | undefined): void {
    const target = area ?? DEFAULT_AREA
    if (target === this.renderedArea) return
    this.renderedArea = target
    const palette = AREA_PALETTES[target]
    this.groundTiling.tint = palette.bank
    this.groundOverlay.tint = palette.bank
    if (this.waterTiling) {
      this.waterTiling.tint = palette.water
      this.pondFill.tint = palette.fill
      this.pondStroke.tint = palette.stroke
    }
    for (const cell of this.waterCellSprites) cell.sprite.tint = palette.water
  }

  /** 建 tile 静态精灵(gid → townTiles 下标 = gid − firstGid,行优先) */
  private addCulled(
    parent: Container,
    list: CulledSprite[],
    map: WorldMapData,
    gid: number,
    tx: number,
    ty: number,
  ): void {
    const texture = this.textures.townTiles[gid - map.tileset.firstGid]!
    const sprite = new Sprite(texture)
    sprite.position.set(tx * TILE, ty * TILE)
    parent.addChild(sprite)
    list.push({ sprite, x: tx * TILE, y: ty * TILE })
  }

  /** 逐水 cell 按四邻接贴泡沫:陆侧露出 WAVE_LAND_SIDE(沿 pondScene 偏移公式) */
  private buildFoam(): void {
    const map = this.map
    const isWater = (tx: number, ty: number): boolean =>
      tx >= 0 && ty >= 0 && tx < map.width && ty < map.height && map.water[ty * map.width + tx] !== 0
    const frames = this.textures.waveFrames
    const tiles: { edge: WaveEdge; x: number; y: number }[] = []
    let sumX = 0
    let sumY = 0
    let n = 0
    for (let ty = 0; ty < map.height; ty++) {
      for (let tx = 0; tx < map.width; tx++) {
        if (!isWater(tx, ty)) continue
        sumX += tx * TILE + TILE / 2
        sumY += ty * TILE + TILE / 2
        n++
        if (!isWater(tx, ty - 1)) tiles.push({ edge: 'top', x: tx * TILE, y: ty * TILE - WAVE_LAND_SIDE })
        if (!isWater(tx, ty + 1)) tiles.push({ edge: 'bottom', x: tx * TILE, y: (ty + 1) * TILE - TILE + WAVE_LAND_SIDE })
        if (!isWater(tx - 1, ty)) tiles.push({ edge: 'left', x: tx * TILE - WAVE_LAND_SIDE, y: ty * TILE })
        if (!isWater(tx + 1, ty)) tiles.push({ edge: 'right', x: (tx + 1) * TILE - TILE + WAVE_LAND_SIDE, y: ty * TILE })
      }
    }
    // 相位 = 绕水域质心的角度序(波峰绕池游走;矩形池即环周序,pondScene 同观感)
    const cx = sumX / n
    const cy = sumY / n
    tiles.sort(
      (a, b) =>
        Math.atan2(a.y + TILE / 2 - cy, a.x + TILE / 2 - cx) - Math.atan2(b.y + TILE / 2 - cy, b.x + TILE / 2 - cx),
    )
    tiles.forEach((t, i) => {
      const sprite = new Sprite(frames[t.edge][0]!)
      sprite.position.set(t.x, t.y)
      this.waveLayer.addChild(sprite)
      this.foamTiles.push({ sprite, edge: t.edge, phase: i })
    })
  }

  update(core: CoreLoop, t: number, dt: number, prompt?: InteractionPromptState | null): void {
    const W = this.app.screen.width
    const H = this.app.screen.height

    // 相机:图内双向跟随 + 四边钳制 + 像素取整(整数平移,无亚像素抖动);
    // 屏幕 shake(票 #43)以整数偏移叠加在相机位上——世界与覆盖 UI 两容器
    // 同步平移读作「整屏一抖」,取整纪律不破(无亚像素抖动)
    const cam = computeCamera(core.px, core.py, this.map.widthPx, this.map.heightPx, W, H)
    const shake = this.shake.update(dt)
    this.world.position.set(Math.round(-cam.x + shake.x), Math.round(-cam.y + shake.y))
    this.ui.position.set(shake.x, shake.y)

    // 浮标落点(世界像素;钳在水域内):抛竿点向水域中心,远近由蓄力决定。
    // 提到阶段切换之前计算——抛竿沿的「朝水朝向」要用同一落点(票 #49)
    const wr = this.map.waterRectPx
    const ox = core.castX
    const oy = core.castY
    const cx = wr.x + wr.width / 2
    const cy = wr.y + wr.height / 2
    const k = 0.3 + 0.5 * core.bobberDist
    const tx = Math.max(wr.x + BOBBER_INSET, Math.min(wr.x + wr.width - BOBBER_INSET, ox + (cx - ox) * k))
    const ty = Math.max(wr.y + BOBBER_INSET, Math.min(wr.y + wr.height - BOBBER_INSET, oy + (cy - oy) * k))

    // 阶段切换检测(渲染侧动画计时)+ juice 触发沿(票 #43):shake 仅
    // 咬钩/捕获两边沿(screenShake.shakeTrigger 单源钉死),水花只随捕获沿
    // 在鱼漂位置起(spec §5.2 唯二触发点,其余相位零演出)。
    // 持竿朝向沿(票 #49):蓄力沿 = 朝最近水面(蓄力时尚无浮标落点);抛竿沿 =
    // 朝浮标落点;回 idle 释放(垂钓全程锁定,结算相位不翻回行进朝向)
    let caughtEdge = false
    if (core.phase !== this.prevPhase) {
      if (core.phase === 'waiting') this.castT = 0
      if (core.phase === 'bite') this.biteT = 0
      if (core.phase === 'charging') {
        const aim = waterAimPoint(this.map, core.px, core.py)
        if (aim) this.rodFacing = facingToward(aim.x - core.px, aim.y - core.py)
      }
      if (core.phase === 'waiting') this.rodFacing = facingToward(tx - core.px, ty - core.py)
      if (core.phase === 'idle') this.rodFacing = null
      const shakeKind = shakeTrigger(this.prevPhase, core.phase)
      if (shakeKind) this.shake.trigger(shakeKind)
      caughtEdge = core.phase === 'caught'
      this.prevPhase = core.phase
    }
    this.castT = Math.min(1, this.castT + dt / 0.22)
    this.biteT += dt

    // 池水流动:13 帧按周期轮换(矩形水换 TilingSprite 贴图;逐 cell 换精灵贴图)
    const waterFrame = Math.floor(t / WATER_FRAME_PERIOD) % WATER_FRAME_COUNT
    if (this.waterTiling) this.waterTiling.texture = this.textures.waterFrames[waterFrame]!
    else {
      const texture = this.textures.waterFrames[waterFrame]!
      for (const cell of this.waterCellSprites) cell.sprite.texture = texture
    }

    // 水域演出:变化才重设 tint
    this.applyAreaPalette(core.area)

    // 视口剔除:静态精灵只翻 visible(各向外扩一格,防边缘 tile 闪没)
    const cull = (list: CulledSprite[]): void => {
      for (const s of list) {
        s.sprite.visible =
          s.x + TILE > cam.x - TILE && s.x < cam.x + W + TILE && s.y + TILE > cam.y - TILE && s.y < cam.y + H + TILE
      }
    }
    cull(this.groundSprites)
    cull(this.decoSprites)
    cull(this.waterCellSprites)

    // 岸线泡沫:帧沿岸边环流(逐 tile 相位偏移)
    const waveFrame = Math.floor(t / WAVE_FRAME_PERIOD)
    for (const tile of this.foamTiles) {
      tile.sprite.texture = this.textures.waveFrames[tile.edge][(waveFrame + tile.phase) % WAVE_FRAME_COUNT]!
    }

    // 宝箱两态(票 #41):已开 = 开箱帧(空箱外观),未开 = 闭箱帧;
    // 逐帧查已开态(注入的 store),开箱当帧即换装,跨会话恢复首帧即空箱
    for (const chest of this.chestSprites) {
      chest.sprite.texture = this.chestIsOpen(chest.chestId) ? this.textures.chestFrames.open : this.textures.chestFrames.closed
    }

    // 角色朝向与行走:朝向由核心持有(票 #35),垂钓中覆盖为持竿朝向(票 #49)。
    // 行走相位按**实际位移**推进(票 #49:像素驱动 = 步频帧时序对齐移速,
    // 静止/被挡自动归零回待机);bob/呼吸/前倾曲线出整数像素姿态,应用到
    // 精灵(锚在脚底:呼吸纵伸向上、bob 抬起离地、前倾绕脚底旋转)
    let movedPx = 0
    if (this.prevPx >= 0) movedPx = Math.hypot(core.px - this.prevPx, core.py - this.prevPy)
    this.prevPx = core.px
    this.prevPy = core.py
    this.walkPhase = advanceWalkPhase(this.walkPhase, movedPx)
    const walking = this.walkPhase > 0
    const frame = walking ? Math.floor(this.walkPhase) % PLAYER_FRAME_COUNT : 0
    // 三态观感(票 #49):移动 = bob;静止 idle = 呼吸;垂钓/结算 = 持竿定身
    // (朝水朝向 + 抛竿前倾,casterT 与浮标飞行同源)
    const facing = this.rodFacing ?? core.facing
    const pose = walking
      ? { dy: walkBobOffset(this.walkPhase), scaleY: 1, rotation: 0 }
      : core.phase === 'idle'
        ? breathPose(t)
        : castLeanPose(this.castT, facing)
    this.playerSprite.texture = this.textures.playerFrames[facing][frame]!
    this.playerSprite.position.y = PLAYER_FOOT_OFFSET + pose.dy
    this.playerSprite.scale.set(1, pose.scaleY)
    this.playerSprite.rotation = pose.rotation
    this.player.position.set(Math.round(core.px), Math.round(core.py))

    // 脚下影子(票 #49):贴地不随容器内位移,几何随 bob 抬升微缩淡
    // (shadowPose 单源;呼吸是脚不动的纵伸,不算离地,影子不动)
    const sp = shadowPose(walking ? -walkBobOffset(this.walkPhase) : 0)
    this.shadow
      .clear()
      .ellipse(0, 0, sp.rx, sp.ry)
      .fill({ color: 0x0b1f12, alpha: sp.alpha })

    const showBobber = core.phase !== 'idle' && core.phase !== 'charging'
    let bx = tx
    let by = ty
    if (this.castT < 1 && showBobber) {
      const e = this.castT * (2 - this.castT)
      const sy = oy - BOBBER_FX.castStartLift
      bx = ox + (tx - ox) * e
      by = sy + (ty - sy) * e - Math.sin(Math.PI * this.castT) * BOBBER_FX.castLift
    }
    if (core.phase === 'waiting') by += Math.sin(t * 2.4) * BOBBER_FX.idleBob
    if (core.phase === 'bite') by += BOBBER_FX.biteDip + Math.sin(this.biteT * 30) * 4
    this.bobberSprite.visible = showBobber
    if (showBobber) {
      this.bobberSprite.position.set(Math.round(bx), Math.round(by))
    }
    // 捕获水花(票 #43):捕获沿在鱼漂世界坐标(落点 = 浮标回中位置)起一蓬,
    // 逐帧推进在层内部;生成/回收零依赖(spritePool),寿命 ≤0.6s
    if (caughtEdge) this.splash.spawn(tx, ty)
    this.splash.update(dt)

    // 鱼线(世界层,随相机滚动)
    this.line.clear()
    if (showBobber) {
      this.line
        .moveTo(Math.round(core.px), Math.round(core.py) - 13)
        .lineTo(Math.round(bx), Math.round(by) + BOBBER_FX.lineAnchorY)
        .stroke({ width: 1, color: 0xe8f4f8, alpha: 0.55 })
    }

    // 涟漪
    this.ripples.clear()
    if (showBobber && core.phase !== 'minigame') {
      for (let i = 0; i < 3; i++) {
        const p = (t * 0.55 + i / 3) % 1
        const r = 3 + p * 18
        this.ripples
          .ellipse(Math.round(bx), Math.round(by), r, r * 0.42)
          .stroke({ width: 1, color: 0x9fd8e8, alpha: 0.45 * (1 - p) })
      }
    }

    // 蓄力条(满格刻度;世界层,随相机滚动;尺寸沿 pondScene)
    const ppx = Math.round(core.px)
    const ppy = Math.round(core.py)
    this.chargeBar.clear()
    if (core.phase === 'charging') {
      const barX = ppx + 14
      const barW = 8
      const barH = 40
      const barBottom = ppy - 12
      this.chargeBar.rect(barX, barBottom - barH, barW, barH).fill({ color: 0x0b1f12, alpha: 0.55 })
      const fh = (barH - 2) * core.power
      const full = core.power >= 1
      const c = full ? 0x8ef07a : core.power < 0.45 ? 0xe4573d : core.power < 0.8 ? 0xf2c94c : 0x7bc95f
      this.chargeBar.roundRect(barX + 1.5, barBottom - 1 - fh, barW - 3, fh, 2).fill(c)
      this.chargeBar.rect(barX - 1, barBottom - barH - 2, barW + 2, 2).fill(0xeaf4f6)
    }

    // 咬钩 "!"
    this.bang.visible = core.phase === 'bite'
    if (this.bang.visible) {
      const s = 1.2 + 0.25 * Math.max(0, 1 - this.biteT / 0.1)
      this.bang.scale.set(s)
      this.bang.position.set(Math.round(bx), Math.round(by) - 26)
    }

    // 交互浮签(票 #36):跟随交互点世界坐标,随相机滚动(world 层),像素取整;
    // 渲染层兜底:非 idle 强制隐藏(与组合根「面板打开/范围外不供给」双保险)
    if (prompt && core.phase === 'idle') {
      this.prompt.setWord(prompt.label)
      this.prompt.showAt(prompt.x, prompt.y, t)
    } else {
      this.prompt.hide()
    }

    // 钓鱼小游戏面板(右侧;屏空间不随相机滚动;轨道/绿条/进度条几何绘制沿 pondScene)
    const mgVisible = core.phase === 'minigame'
    this.track.visible = mgVisible
    this.mgBar.visible = mgVisible
    this.mgFishSprite.visible = mgVisible
    this.mgProgress.visible = mgVisible
    if (mgVisible && core.mg && core.fish) {
      const mg = core.mg
      const trackX = W - 40
      const trackW = 26
      const trackH = Math.min(H * 0.72, 460)
      const trackY = (H - trackH) / 2
      this.track
        .clear()
        .roundRect(trackX, trackY, trackW, trackH, 6)
        .fill({ color: 0x0c2f3f, alpha: 0.88 })
        .stroke({ width: 1.5, color: 0x9fd8e8, alpha: 0.5 })
      const innerX = trackX + 3
      const innerY = trackY + 3
      const innerW = trackW - 6
      const innerH = trackH - 6

      // 绿条(高度跟随当前竿参数,与物理同源:核心循环 rodParams 即绿条物理所用参数)
      const bar = core.rodParams
      const barPixH = bar.height * innerH
      const barTop = innerY + innerH - (mg.barY + bar.height) * innerH
      this.mgBar.clear().roundRect(innerX, barTop, innerW, barPixH, 2).fill({ color: 0x6ee06e, alpha: 0.85 })

      // 鱼精灵:按场上鱼形取贴图,2 帧按周期交替(挣扎摆尾);配色来自贴图本身
      const fishFrames = this.textures.fishFrames[core.fish.shape]
      this.mgFishSprite.texture = fishFrames[Math.floor(t / FISH_FRAME_PERIOD) % FISH_FRAME_COUNT]!
      this.mgFishSprite.position.set(trackX + trackW / 2, innerY + innerH - mg.fishY * innerH)

      // 进度条
      const pgX = trackX - 10
      const pgW = 5
      const fillH = Math.max(1, mg.progress * innerH)
      const pc = mg.progress > 0.5 ? 0x6ee06e : mg.progress > 0.25 ? 0xf2c94c : 0xe4573d
      this.mgProgress
        .clear()
        .roundRect(pgX, innerY, pgW, innerH, 2)
        .fill({ color: 0x0c2f3f, alpha: 0.7 })
        .roundRect(pgX, innerY + innerH - fillH, pgW, fillH, 2)
        .fill(pc)
      // 进度流光(票 #43):≥70% 启动、回落即停——沿已填充段循环上行的亮带
      // (紧张感信号,非常驻装饰;细条不遮进度读数,阈值/几何单源在 progressShimmer)
      if (shimmerActive(mg.progress)) {
        const band = shimmerBand(t)
        const bandPixH = Math.max(1, band.height * innerH)
        const fillTop = innerY + innerH - fillH
        const bandBottom = innerY + innerH - band.pos * fillH
        const bandTop = Math.max(fillTop, bandBottom - bandPixH)
        if (bandBottom > bandTop) {
          this.mgProgress.roundRect(pgX, bandTop, pgW, bandBottom - bandTop, 2).fill({ color: 0xd6ffe8, alpha: 0.5 })
        }
      }
    }
  }
}
