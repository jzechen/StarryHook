import { Application } from 'pixi.js'
// 像素字体自托管(spec #12):fontsource 纯 CSS + woff2,Vite 负责打包与按需加载。
// font-display: swap → 首帧可能以系统字体闪现再切换(轻微 FOUT,票面接受);
// 不做预载:该包为单文件全量中文字集(woff2 约 600KB),预载会挤占首屏关键资源
import '@fontsource/fusion-pixel-12px-proportional-sc'
import { RODS } from './config'
import { CollectionStore, type KvStorage } from './core/collection'
import { CoreLoop } from './core/coreLoop'
import { FISH } from './core/fishCatalog'
import { ProgressionStore } from './core/progression'
import { Rng } from './core/rng'
import { TimedBestStore } from './core/timedBest'
import type { LoopPhase } from './core/types'
import { WalletStore } from './core/wallet'
import { WorldScene } from './render/worldScene'
import { loadSceneTextures } from './render/textures'
import { applyViewportToCanvas } from './render/viewport'
import { village } from './world/village'
import { worldCollisionSource } from './world/worldMap'
import { baitBadgeText } from './ui/baitBadgeText'
import { CollectionPanel } from './ui/collectionPanel'
import { collectionToasts, snapshotOf } from './ui/collectionToastPolicy'
import { countdownBadgeText } from './ui/countdownBadgeText'
import { baitEffectSource, buyBaitOutcome, equippedBaitView } from './ui/economyWiring'
import { Hud } from './ui/hud'
import { ModePanel } from './ui/modePanel'
import { MuteStore } from './ui/muteStore'
import { PanelExclusion } from './ui/panelExclusion'
import { progressionToastText } from './ui/progressionToastPolicy'
import { roundJustEnded } from './ui/roundEdgePolicy'
import { roundSettlementText } from './ui/roundSettlementText'
import { AudioSfxPlayer, MuteAwareSfxPlayer } from './ui/sfx'
import { sfxForEvent } from './ui/sfxMapping'
import { ShopPanel, type ShopBuyOutcome } from './ui/shopPanel'
import { ToastLayer } from './ui/toastLayer'
import { WaterPanel } from './ui/waterPanel'

/** 浏览器 localStorage 适配器:读写两侧都吞异常(隐私模式/配额),游戏不受影响 */
function localStorageKv(): KvStorage {
  return {
    get: key => {
      try {
        return localStorage.getItem(key)
      } catch {
        return null
      }
    },
    set: (key, value) => {
      try {
        localStorage.setItem(key, value)
      } catch {
        // 写入失败不影响游戏
      }
    },
  }
}

async function main(): Promise<void> {
  // ?seed=123 可复现整局(调手感时对比用)
  const params = new URLSearchParams(location.search)
  const seed = Number(params.get('seed')) || (Date.now() % 2147483647)

  // 视口(ADR-0002):画布固定 480×270 逻辑分辨率,渲染 1x;
  // CSS 整数倍放大 + nearest-neighbor(index.html image-rendering),resize 时纯函数重算信箱。
  // DOM 覆盖层(#hud)不在此列,保持原生分辨率。
  const app = new Application()
  await app.init({
    width: 480,
    height: 270,
    background: '#2c3b2a',
    antialias: false,
    resolution: 1,
    autoDensity: true,
  })
  document.getElementById('game')!.appendChild(app.canvas)
  const refitViewport = (): void => applyViewportToCanvas(app.canvas, window.innerWidth, window.innerHeight)
  refitViewport()
  window.addEventListener('resize', refitViewport)

  const core = new CoreLoop(new Rng(seed))
  // 场景素材:图集加载 + 切片(素材文件 → 图集 → 精灵 管线入口)
  const textures = await loadSceneTextures()
  // 世界(票 #34):村舍场景图 + 地图驱动碰撞注入 + 出生点落位。
  // 碰撞来源 = 解析器产出的 blocked 网格谓词(水 tile/大件),核心不 import 地图/渲染;
  // 位置模型为世界像素,出生点来自物件层(村舍图左上空地)。
  const scene = new WorldScene(app, textures, village)
  core.setWorldCollision(worldCollisionSource(village))
  core.px = village.spawn.x
  core.py = village.spawn.y
  const seedEl = document.getElementById('seed')
  if (seedEl) seedEl.textContent = `seed ${seed}`

  // 收集册:捕获自动登记,跨会话持久(隐私模式下写入失败自动降级为内存收集)
  const storage = localStorageKv()
  // 限时单局最高纪录(票 #23 纪录双轨):独立键跨会话持久,损坏按 0 降级。
  // 消费三处,写入只有一处——顶栏限时轨展示(顶栏「最高纪录」,票 #22 review)、
  // 归零结算的破纪录判定源(recordIfHigher,唯一写入点)与模式面板的纪录展示
  const timedBest = new TimedBestStore(storage)
  // 静音:纯 UI 层状态,独立键持久(损坏按默认非静音降级);
  // 音效播放器注入式 —— 外层静音门 + 内层浏览器 Audio 实现,测试可整体替换
  const mute = new MuteStore(storage)
  const sfx = new MuteAwareSfxPlayer(new AudioSfxPlayer(), () => mute.muted())
  const hud = new Hud(
    () => core.resetSession(),
    () => mute.toggle(),
    timedBest,
  )
  hud.setMuted(mute.muted())
  const collection = new CollectionStore(FISH.map(f => f.id), storage)
  // 成长:经验/等级/竿,独立键名跨会话持久;启动时从恢复的等级注入当前竿参数,
  // 顶栏同步显示恢复的真实等级/竿(老玩家上线即见,不从 1 级竹竿开始闪)
  const progression = new ProgressionStore(storage)
  core.setRodParams(progression.rod().params)
  hud.setProgression(progression.level(), progression.rod().name)
  // 经济(票 #18):金币/鱼饵钱包,独立键名跨会话持久(损坏按初始状态降级);
  // 本票接捕获入账与香饵抛竿消耗,商店购竿与购饵 UI 属后续票
  const wallet = new WalletStore(storage)
  // 鱼饵生效(票 #19 香饵 + 票 #21 浓饵;review 修复后两缝合一):核心循环在抛竿时刻
  // (进入 waiting 边沿,core cast 内)调用单一饵效果来源恰好一次,本竿饵消耗恰好一次,
  // 消耗与效果同源产出,不再有调用次序契约:
  // - 香饵:装备且消耗成功 → 等待时长减半(TUNE.wait.min/max 同乘 0.5,分布形状不变);
  // - 浓饵:装备且消耗成功 → 权重引擎浓饵入参生效,难鱼权重提升(等待不减半);
  // - 未装备/耗尽 → null,本竿无饵效果,自动回退现行。
  // 接线本体抽至 ui/economyWiring(可测单源,组合层集成测试直接驱动同一段接线)
  core.setBaitEffectSource(baitEffectSource(wallet))
  // 面板互斥协调器:任一面板打开即收起其余,右侧同位不重叠遮挡;
  // 面板构造时自注册,组合根不再串互斥回调,商店面板(GLOSSARY 经济与模式)注册即入
  const panelExclusion = new PanelExclusion()
  // 图鉴面板:只读消费收集册,入口常驻(可用性随阶段变化)
  const collectionPanel = new CollectionPanel(collection, panelExclusion)
  // 换水域面板(票 #15):入口仅待机可用(waterSwitchPolicy),切换调核心 setWater
  // ——垂钓中核心层同样拒绝,双保险
  const waterPanel = new WaterPanel(core, panelExclusion)
  // 商店面板(票 #20):购买回调在组合根接线 wallet/progression 的既有公开方法,core/ 零改动。
  // 购竿 = 可负担预检(读 wallet.coins)→ progression.purchaseRod(无意义购买在此拒绝:
  // 已拥有/初始竿/降档)→ wallet.spend 扣款 → 竿立即生效(绿条参数注入 + 顶栏竿名刷新)。
  // spend 的拒绝分支在此不可达,理由可查证:金额取竿表正数常量(invalid 分支不成立);
  // 预检与 spend 处于同一同步块,中间仅调用 progression.purchaseRod(独立存储键,
  // 不触钱包),余额不可能在两步之间变少(insufficient 的唯一成因不成立)。
  // 若未来在两步之间引入会动余额的路径,spend 会如实拒绝并反馈 insufficient
  // (拒绝时状态原样,不会扣成负数),不会静默出账。
  const buyRodOutcome = (rodId: string): ShopBuyOutcome => {
    const rod = RODS.find(r => r.id === rodId)
    if (!rod) return 'meaningless'
    if (wallet.coins() < rod.price) return 'insufficient'
    const purchased = progression.purchaseRod(rodId)
    if (!purchased) return 'meaningless'
    if (!wallet.spend(rod.price).ok) return 'insufficient'
    core.setRodParams(purchased.params)
    hud.setProgression(progression.level(), progression.rod().name)
    return 'ok'
  }
  // 购饵 = wallet.buyBait(价格扣款 + 库存增加一体)+ 成功即自动装备(review 修复:
  // 买到即生效,效果实玩可达);目录外/非法 id 映射为无意义购买。
  // 装备切换同样经组合根回调接线 wallet.equip(装备槽一种,切换不清余量)——
  // 面板保持只读消费钱包,写操作全走回调(与购竿/购饵同款纪律)
  const equipBait = (baitId: string): void => wallet.equip(baitId)
  const shopPanel = new ShopPanel(
    wallet,
    progression,
    buyRodOutcome,
    buyBaitOutcome(wallet),
    equipBait,
    panelExclusion,
  )
  // 模式面板(票 #24):顶栏「模式」入口 + 选择面板(无限休闲/限时挑战 + 单局最高纪录),
  // 只读消费核心模式状态(core.phase/mode/roundActive)与限时纪录,切换走核心 setMode
  // ——垂钓中核心层同样拒绝,与入口策略(modePanelAllowed,仅待机)双保险。
  // 局毕(归零强制结算)自动回面板可再来一局;第四面板经 PanelExclusion 注册即入
  const modePanel = new ModePanel(core, timedBest, panelExclusion)
  // 轻提示层:新收录 / 池塘大满贯,顶部居中,不拦截游戏输入
  const toasts = new ToastLayer()
  let prevPhase: LoopPhase = core.phase
  // 限时局进行中边沿基准(票 #24):判定单源在 roundJustEnded(roundEdgePolicy),
  // 此处只存上一帧局标志——true→false 且模式仍限时 = 归零强制结算完成
  let prevRoundActive = core.roundActive

  // —— 输入:鼠标/触摸 + 键盘(空格 = 起竿,WASD/方向键 = 移动) ——
  const keys = new Set<string>()
  let mouseHold = false

  app.canvas.addEventListener('pointerdown', e => {
    e.preventDefault()
    mouseHold = true
  })
  window.addEventListener('pointerup', () => {
    mouseHold = false
  })
  window.addEventListener('pointercancel', () => {
    mouseHold = false
  })
  window.addEventListener('keydown', e => {
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault()
    keys.add(e.code)
  })
  window.addEventListener('keyup', e => {
    keys.delete(e.code)
  })
  window.addEventListener('blur', () => {
    keys.clear()
    mouseHold = false
  })

  app.ticker.add(tk => {
    const dt = Math.min(tk.deltaMS / 1000, 0.05) // 钳制大帧,防止切后台跳变

    // 移动方向:斜向归一(票 #34 世界像素坐标;原「x 按宽高比折算」是屏内
    // 归一化坐标的产物,迁移后废除——核心速度为世界像素/秒,合速度恒定)
    let dx = 0
    let dy = 0
    if (keys.has('KeyD') || keys.has('ArrowRight')) dx += 1
    if (keys.has('KeyA') || keys.has('ArrowLeft')) dx -= 1
    if (keys.has('KeyS') || keys.has('ArrowDown')) dy += 1
    if (keys.has('KeyW') || keys.has('ArrowUp')) dy -= 1
    if (dx !== 0 || dy !== 0) {
      const len = Math.hypot(dx, dy)
      dx = dx / len
      dy = dy / len
    }

    core.update(dt, { holding: mouseHold || keys.has('Space'), moveX: dx, moveY: dy })
    // 结算捕获 → 登记进收集册与成长(两系统无耦合,核心循环自身不感知)。
    // 顺序不可换:先读捕获前快照 → 登记 → 再读快照 → 按纯函数决策弹提示
    if (core.phase === 'caught' && prevPhase !== 'caught' && core.fish) {
      const fishId = core.fish.id
      const before = snapshotOf(collection, fishId)
      collection.recordCatch(fishId)
      const decision = collectionToasts(before, snapshotOf(collection, fishId))
      if (decision.newEntry) {
        toasts.show('new-entry')
        // 与既有提示同点触发:新收录音效跟提示一起出
        sfx.play(sfxForEvent('new-entry'))
      }
      if (decision.grandSlam) {
        toasts.show('grand-slam')
        // 一辈子只弹一次:弹出的同时置持久化标记,重开/刷新后不再弹
        collection.acknowledgeCompletion()
      }
      // 成长:按捕获分值登记经验(非幂等,每次都加);竿档变化 → 注入新参数
      const progress = progression.recordCatch(core.fish.score)
      if (progress.rodUnlocked) core.setRodParams(progress.rodUnlocked.params)
      // 成长反馈:升级增量喂文案纯函数(未升级 → null 不弹),顶栏即时刷新。
      // 提示走轻提示层顶部居中,不占蓄力条/绿条/进度条/底部提示的位置
      if (progress.levelsGained > 0) {
        const toastText = progressionToastText({
          levelsGained: progress.levelsGained,
          rodName: progress.rodUnlocked?.name ?? null,
          level: progression.level(),
        })
        if (toastText) toasts.showText(toastText)
        // 与升级提示同点触发
        sfx.play(sfxForEvent('level-up'))
        hud.setProgression(progression.level(), progression.rod().name)
      }
      // 经济:按捕获分值入账金币(图鉴 → 经验之后的第三路,三系统无耦合;
      // 金币 = 鱼分值,非幂等每次都加,跨会话持久)
      wallet.earn(core.fish.score)
    }
    // —— 音效:相位边沿触发(映射纯函数查表;静音时播放器空操作)——
    // 抛竿入水 = 进入 waiting 边沿;咬钩 = 进入 bite 边沿;捕获/脱钩 = 结算相位边沿。
    // idle/charging/minigame 三相位无音效,不查表
    if (core.phase !== prevPhase) {
      switch (core.phase) {
        case 'waiting':
          sfx.play(sfxForEvent('cast-splash'))
          break
        case 'bite':
          sfx.play(sfxForEvent('bite'))
          break
        case 'caught':
          sfx.play(sfxForEvent('catch'))
          break
        case 'escaped':
          sfx.play(sfxForEvent('escape'))
          break
      }
    }
    prevPhase = core.phase
    // —— 限时局结算反馈(票 #24):归零强制结算完成触发恰好一次。局毕边沿判定
    // 单源在 roundJustEnded(roundEdgePolicy,与模式面板两处消费同一份):
    // 上一帧局进行中、本帧已结束且模式仍限时。切回无限同样会置否 roundActive,
    // 但 mode 已变且 setMode 已把定格分清零——那是玩家主动放弃,不算「一局结束」,不弹。
    // 本局得分读归零定格分(roundActive 已置否,roundScore 返回定格值,不再漂移);
    // 破纪录判定源 = recordIfHigher 返回值,在定格分上恰好调用一次(严格更高才 true,
    // 持平/更低不更新),「破纪录!」只随真实破纪录追加
    if (roundJustEnded(prevRoundActive, core)) {
      const score = core.roundScore
      const recordBroken = timedBest.recordIfHigher(score)
      toasts.showText(roundSettlementText(score, recordBroken))
    }
    prevRoundActive = core.roundActive
    scene.update(core, tk.lastTime / 1000, dt)
    hud.update(core)
    // 经济常驻展示(票 #17 故事 2/10,review 修复):金币余额与装备饵余量上顶栏,
    // 内容变化才重写 DOM(hud 既有守卫);垂钓进行中商店不可开,饵余量由此常驻可见,
    // 耗尽(文案 null)自动隐藏。文案派生:baitBadgeText ← equippedBaitView ← 钱包
    hud.setCoins(wallet.coins())
    hud.setBaitBadge(baitBadgeText(equippedBaitView(wallet)))
    // 顶栏倒计时(票 #24):限时逐秒「1:23」,无限 null 即隐藏(切回无残留);
    // 文案变化才重写 DOM(hud 既有守卫),不逐帧刷新
    hud.setCountdown(countdownBadgeText(core.mode, core.timeRemaining))
    // 图鉴面板:入口可用性、自动收起、进度刷新(打开时核心循环照常推进)
    collectionPanel.update(core)
    // 换水域面板(票 #15):入口可用性(仅待机)、自动收起、当前水域标识
    waterPanel.update(core)
    // 商店面板(票 #20):入口可用性(仅待机)、自动收起、余额/库存/竿状态刷新(打开时游戏照常推进)
    shopPanel.update(core)
    // 模式面板(票 #24):入口可用性(仅待机)、自动收起、局毕自动回面板、当前模式与纪录刷新
    modePanel.update(core)
  })
}

main().catch(err => {
  document.body.textContent = `启动失败:${err instanceof Error ? err.message : String(err)}`
})
