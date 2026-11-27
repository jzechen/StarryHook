import { Application } from 'pixi.js'
// 像素字体自托管(spec #12):fontsource 纯 CSS + woff2,Vite 负责打包与按需加载。
// font-display: swap → 首帧可能以系统字体闪现再切换(轻微 FOUT,票面接受);
// 不做预载:该包为单文件全量中文字集(woff2 约 600KB),预载会挤占首屏关键资源
import '@fontsource/fusion-pixel-12px-proportional-sc'
import { RODS } from './config'
import { BackpackStore } from './core/backpack'
import { chestDef, chestOpenToastText } from './core/chests'
import { ChestOpenedStore } from './core/chestState'
import { CollectionStore, type KvStorage } from './core/collection'
import { COLLECTIBLES } from './core/collectibles'
import { CoreLoop } from './core/coreLoop'
import { FISH } from './core/fishCatalog'
import { OrderBoardStore, sessionOrderRng } from './core/orderBoard'
import { ProgressionStore } from './core/progression'
import { Rng } from './core/rng'
import { TimedBestStore } from './core/timedBest'
import type { LoopPhase } from './core/types'
import { WalletStore } from './core/wallet'
import { WorldDirector } from './render/worldDirector'
import { GrandSlamOverlay } from './render/grandSlam'
import { loadSceneTextures } from './render/textures'
import { applyViewportToCanvas } from './render/viewport'
import { interactionPromptText, nearestInteraction, parseInteractionSpots } from './world/interactions'
import { warpHintAt } from './world/warpHint'
import { waterDistancePx } from './world/waterDistance'
import { WORLD_MAPS } from './world/maps'
import type { MapId } from './core/types'
import { baitBadgeText } from './ui/baitBadgeText'
import { ambientWaterLevel } from './ui/ambientWater'
import { BgmChannel } from './ui/bgm'
import { countdownTick } from './ui/countdownTick'
import { advanceStepClock } from './ui/footstepClock'
import { CollectionPanel } from './ui/collectionPanel'
import { collectionToasts, snapshotOf } from './ui/collectionToastPolicy'
import { countdownBadgeText } from './ui/countdownBadgeText'
import { baitEffectSource, buyBaitOutcome, deliverOrderOutcome, equippedBaitView, grantChestLoot, sellFishOutcome } from './ui/economyWiring'
import { BackpackPanel } from './ui/backpackPanel'
import { Hud } from './ui/hud'
import { ModePanel } from './ui/modePanel'
import { OrderPanel } from './ui/orderPanel'
import { MuteStore } from './ui/muteStore'
import { PanelExclusion } from './ui/panelExclusion'
import { progressionToastText } from './ui/progressionToastPolicy'
import { roundJustEnded } from './ui/roundEdgePolicy'
import { roundSettlementText } from './ui/roundSettlementText'
import { AudioSfxPlayer, MuteAwareSfxPlayer } from './ui/sfx'
import { bgmForScene, sfxForEvent } from './ui/sfxMapping'
import { ShopPanel, type ShopBuyOutcome } from './ui/shopPanel'
import { StoragePanel } from './ui/storagePanel'
import { transferBetween } from './ui/storageWiring'
import { stallPressAction } from './ui/interactionPolicy'
import { ToastLayer } from './ui/toastLayer'

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
  // 世界(票 #35):三图村舍↔河谷↔湖畔的编排层——开机按位置快照恢复
  // (位置 + 朝向 + 图级水域推导;无/坏快照回村舍出生点)、地图驱动碰撞
  // 注入、出口过场(淡黑 300ms,输入锁、不写存档)、仅 idle 落盘。
  // 核心循环只消费注入的碰撞来源与 setWater,不感知过场与存档。
  const storage = localStorageKv()
  // 宝箱已开态(票 #41,spec §4.5/§4.6):一次性开启的 kv 集合键,损坏按全未开降级;
  // 供两处消费——世界场景两态外观(空箱跟随已开态)与动作键开箱的一次性判定
  const chests = new ChestOpenedStore(storage)
  // 场景配乐 BGM 通道(票 #54,spec 术语「场景配乐」):每场景一轨循环,
  // 切轨挂世界导演入图沿(过场淡入完成沿 = 场景横幅同点),交叉淡入淡出约 1s;
  // 通道只管状态机,每帧供给经静音门(sfx.setBgm)透传给播放器——静音全覆盖
  const bgm = new BgmChannel()
  const director = new WorldDirector({
    app,
    textures,
    core,
    storage,
    chestIsOpen: id => chests.isOpen(id),
    onSceneEntered: mapId => bgm.setTarget(bgmForScene(mapId)),
  })
  const seedEl = document.getElementById('seed')
  if (seedEl) seedEl.textContent = `seed ${seed}`

  // 收集册:捕获自动登记,跨会话持久(隐私模式下写入失败自动降级为内存收集)
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
  // 本票接香饵抛竿消耗,商店购竿与购饵 UI 属后续票。
  // 票 #39 起:金币唯一来源 = 摊位卖鱼 + 宝箱(spec §4.1),捕获不再即时入账
  const wallet = new WalletStore(storage)
  // 背包(票 #39 堆叠语义 + 票 #40 kv 持久化):渔获按(鱼种 × 品质)堆叠,
  // 收藏品为第二分区(目录 = collectibles 表,票 #41 填充内容,本票为空表)。
  // 变动即落盘(独立键),损坏快照按空包降级;储物箱 = 同一 store 形态的第二
  // 实例(家中仓库,独立键),两块面板与转移接线消费。
  const collectibleIds = COLLECTIBLES.map(c => c.id)
  const backpack = new BackpackStore(FISH.map(f => f.id), collectibleIds, {
    storage,
    key: 'starryhook:backpack',
  })
  const storageBox = new BackpackStore(FISH.map(f => f.id), collectibleIds, {
    storage,
    key: 'starryhook:storage',
  })
  // 公告板(票 #55,spec 内容扩充「公告板与订单」):当前订单一单(队列制),
  // 订单轮转走独立派生种子的 Rng(sessionOrderRng,与品质旁路同构,主序列一个
  // draw 不动);kv 持久化跨会话保留(独立键),损坏按重出首单降级。
  // 交付 = deliverOrderOutcome 接线(扣背包渔获 + 酬金入钱包 + 出新单一体)
  const orders = new OrderBoardStore(sessionOrderRng(seed), {
    storage,
    key: 'starryhook:orders',
  })
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
  // 商店摊位兼收购(票 #39,spec §4.3):卖鱼回调接线 sellFishOutcome
  // (背包取出 + wallet.earn 按分值×品质倍率入账一体),面板保持只读消费背包堆叠
  const shopPanel = new ShopPanel(
    wallet,
    progression,
    buyRodOutcome,
    buyBaitOutcome(wallet),
    equipBait,
    backpack,
    sellFishOutcome(backpack, wallet),
    panelExclusion,
  )
  // 模式面板(票 #24):顶栏「模式」入口 + 选择面板(无限休闲/限时挑战 + 单局最高纪录),
  // 只读消费核心模式状态(core.phase/mode/roundActive)与限时纪录,切换走核心 setMode
  // ——垂钓中核心层同样拒绝,与入口策略(modePanelAllowed,仅待机)双保险。
  // 局毕(归零强制结算)自动回面板可再来一局;第四面板经 PanelExclusion 注册即入
  const modePanel = new ModePanel(core, timedBest, panelExclusion)
  // 背包面板(票 #40,spec §4.4):顶栏「背包」pill 开总览面板(无快捷键),
  // 渔获区(鱼种 × 品质堆叠 + 星标)+ 收藏品区(内容表 #41 填充,空区占位);
  // 鱼饵不进包——余量走钱包/顶栏徽章,本面板只读
  const backpackPanel = new BackpackPanel(backpack, panelExclusion)
  // 储物箱面板(票 #40,spec §4.4):村舍储物箱交互点 E 开两栏转移面板
  // (左背包/右储物箱,点按整堆转移);转移 = 源取出 + 目标存入一体
  // (transferBetween 接线,组合根注入回调;面板只管展示与转发)
  const storagePanel = new StoragePanel(
    backpack,
    storageBox,
    transferBetween(backpack, storageBox),
    transferBetween(storageBox, backpack),
    panelExclusion,
  )
  // 公告板面板(票 #55):河谷公告板交互点 E 开小面板——查看当前订单(鱼种 ×
  // 品质门槛 × 数量 + 酬金与持有进度)、交付(扣包 + 酬金入钱包 + 出新单一体,
  // 行内反馈沿商店 ShopBuyOutcome 风格,缺鱼/品质不足分列拒绝)
  const orderPanel = new OrderPanel(orders, backpack, deliverOrderOutcome(orders, backpack, wallet), panelExclusion)
  // 轻提示层:新收录等常规轻提示,顶部居中,不拦截游戏输入
  const toasts = new ToastLayer()
  // 大满贯全屏演出(票 #43,spec §5.2):替代既有 toast——画布内横幅 +
  // 星芒/彩带粒子(约 2s),屏空间挂组合根 stage(场景过场遮罩之上;换图时
  // director 经 pinOnTop 按开机层序复位,演出不随场景重建被掩埋)。
  // 「集齐」状态与一辈子一次的幂等标记沿用 collection 既有
  // (collectionToasts 决策 + acknowledgeCompletion),本层只管演出本身。
  const grandSlam = new GrandSlamOverlay()
  app.stage.addChild(grandSlam.container)
  director.pinOnTop(grandSlam.container)
  let prevPhase: LoopPhase = core.phase
  // 限时局进行中边沿基准(票 #24):判定单源在 roundJustEnded(roundEdgePolicy),
  // 此处只存上一帧局标志——true→false 且模式仍限时 = 归零强制结算完成
  let prevRoundActive = core.roundActive
  // 动作键按下边沿基准(票 #36):与核心同帧消费同一 holding 信号
  let prevHolding = false
  // 音效状态基准(票 #44):脚步相位钟(跨帧积累,静止归零)与上一帧限时剩余
  // (倒计时 tick 的跨秒边沿判定需要上一帧值,同 prevPhase/prevRoundActive 姿态)
  let footstepAccum = 0
  let prevTimeRemaining = core.timeRemaining

  // —— 交互点系统(票 #36,spec §2.1–2.3):物件层声明 → 触发判定 → 动作 ——
  // 解析交互点(钓位/摊位;note 等后续票 kind 不在本票解析范围);
  // 触发 = 统一 1.5 tile(radius 属性可覆盖),重叠取最近。
  // 交互点随图切换(票 #35 三图):按 mapId 惰性解析缓存,过场换图后即用新图集合。
  const interactionCache = new Map<string, ReturnType<typeof parseInteractionSpots>>()
  const interactionsOf = (mapId: MapId): ReturnType<typeof parseInteractionSpots> => {
    let list = interactionCache.get(mapId)
    if (!list) {
      const map = WORLD_MAPS[mapId]
      list = parseInteractionSpots(map.objects, map.tileWidth)
      interactionCache.set(mapId, list)
    }
    return list
  }
  // 已开面板(互斥协调器保证至多一个):面板打开时世界动作全歇、浮签全隐、移动锁死
  const openPanel = (): { close(): void } | null =>
    [collectionPanel, shopPanel, modePanel, backpackPanel, storagePanel, orderPanel].find(p => p.isOpen()) ?? null
  // 每帧刷新的「范围内最近交互点」:交互门禁/浮签/自动切水/摊位动作四方同源,
  // 不因各自取值时机不同而打架(核心门禁在 core.update 内消费的即本帧值)
  let nearestTarget: ReturnType<typeof nearestInteraction> = null
  const anyPanelOpen = (): boolean => openPanel() !== null
  // 交互点来源注入(核心门禁:idle 按下须最近交互点是钓位才蓄力;
  // 面板打开时来源恒 null——动作键优先关面板,同一次按下不会「关面板又开竿」)。
  // 钓位微差(票 #38):钓位物件的倍率表随来源透传,抛竿按当前钓位读取
  core.setInteractionSource(() => {
    if (anyPanelOpen()) return null
    return nearestTarget?.kind === 'spot' ? { kind: 'spot', spotMul: nearestTarget.spotMul } : null
  })

  // —— 输入:鼠标/触摸 + 键盘(动作键 = E/空格/按住鼠标三等效,WASD/方向键 = 移动,ESC = 关面板) ——
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
  // ESC 关面板(票 #36 spec §2.2 新增键位):与关闭钮/再按动作键同口径,幂等
  window.addEventListener('keydown', e => {
    if (e.code !== 'Escape') return
    openPanel()?.close()
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

    // 动作键(票 #36 spec §2.2)= E ∨ 空格 ∨ 鼠标/触摸按住,同语义三等效;
    // 按下边沿与核心同帧同源(同一 holding 信号),摊位开面板/关面板按意图策略走
    const holding = mouseHold || keys.has('Space') || keys.has('KeyE')
    const pressed = holding && !prevHolding
    prevHolding = holding
    // 范围内最近交互点(本帧单源);面板打开时世界交互全歇(浮签全隐、无动作)
    const panelOpen = anyPanelOpen()
    nearestTarget = panelOpen ? null : nearestInteraction(interactionsOf(director.mapId), core.px, core.py)

    // 过场中输入锁定(票 #35):组合根停止喂输入,核心停在 idle——
    // 核心循环不感知过场;位置冻结,存档门禁同样跳过(worldDirector 内判)
    // 面板打开锁移动(spec §2.4):方向分量清零,核心侧无需感知面板
    // 脚步声地面真值(票 #44):取本帧核心循环前后的实际位移——被墙挡住/
    // 锁移动/面板开时位移 ≈ 0,脚步钟视同静止(按方向键的意图不作依据)
    const footPrevX = core.px
    const footPrevY = core.py
    if (!director.inputLocked) {
      core.update(dt, { holding, moveX: panelOpen ? 0 : dx, moveY: panelOpen ? 0 : dy })
    }
    // 脚步声(票 #44):移动中按步频触发、停止即停(相位钟纯函数,余量制)
    const step = advanceStepClock(footstepAccum, dt, Math.hypot(core.px - footPrevX, core.py - footPrevY))
    footstepAccum = step.accum
    if (step.fire) sfx.play(sfxForEvent('footstep'))
    // 限时倒计时(票 #44):最后 10 秒每秒一响;归零强制结算帧不新增音效
    // (纯函数边沿判定,上一帧剩余为基准,同 prevPhase 的跨帧姿态)
    if (countdownTick(prevTimeRemaining, core)) sfx.play(sfxForEvent('countdown'))
    prevTimeRemaining = core.timeRemaining

    // 动作键按下边沿 → 意图(关闭口径优先):关面板 / 摊位开商店 / 储物箱开转移
    // 面板 / 宝箱一次性开启 / 公告板开订单面板 / 叙事物读彩蛋;钓位蓄力抛竿不经
    // 此处——核心已按交互门禁在本帧 update 内处理。
    // 叙事物(票 #37)仅在待机响应:小游戏连按 E 是玩法操作,垂钓中不弹彩蛋
    // (与摊位「仅 idle 可开」同口径);toast 一句静态文案,零奖励、可重复查看
    // 过场中同样不响应(输入锁定的组成部分,票 #35)
    // 宝箱(票 #41)同样仅待机响应:开箱是世界动作,垂钓中不结算;已开箱
    // open() 返回 false = 不结算不弹提示(一次性判定单点在 ChestOpenedStore)
    if (pressed && !director.inputLocked) {
      const intent = stallPressAction(panelOpen, nearestTarget?.kind ?? null)
      if (intent === 'close-panel') openPanel()?.close()
      else if (intent === 'open-shop') shopPanel.open()
      else if (intent === 'open-storage') storagePanel.open()
      else if (intent === 'open-board') orderPanel.open()
      else if (intent === 'open-chest' && core.phase === 'idle') {
        const chestId = nearestTarget?.chestId
        if (chestId && chests.open(chestId)) {
          const def = chestDef(chestId)
          if (def) {
            grantChestLoot(def, wallet, backpack)
            toasts.showText(chestOpenToastText(def))
          }
        }
      } else if (intent === 'read-narrative' && core.phase === 'idle') {
        const narrative = nearestTarget?.text
        if (narrative) toasts.showNarrative(narrative)
      }
    }

    // 钓位走近自动切所属水域(仅 idle;setWater 核心门禁保留,票 #15 禁切口径零改动;
    // 水域来源 = 钓位物件 area 属性;图级兜底推导已随 #35 并入(deriveWaterArea,
    // 组合根开机/换图落位时调用),此处只做钓位级精修)
    if (
      !panelOpen &&
      !director.inputLocked &&
      core.phase === 'idle' &&
      nearestTarget?.kind === 'spot' &&
      nearestTarget.area !== undefined &&
      core.area !== nearestTarget.area
    ) {
      core.setWater(nearestTarget.area)
    }
    // 交互浮签供给(idle ∧ 无面板 ∧ 范围内有交互点):渲染层另有非 idle 兜底;
    // 钓位名进浮签(票 #38,spec §3:「深湾 · 抛竿」),其余 kind 沿动作短词。
    // 已开宝箱不供给浮签(票 #41):空箱外观即状态,「开启」浮签不再误导
    const chestOpened = nearestTarget?.kind === 'chest' && chests.isOpen(nearestTarget.chestId ?? '')
    const promptState =
      core.phase === 'idle' && nearestTarget && !chestOpened
        ? { x: nearestTarget.x, y: nearestTarget.y, label: interactionPromptText(nearestTarget) }
        : null
    // 出口接近浮签(票 #46,spec 术语「出口」):被动无键帽「东 · 河谷 →」,
    // 挂出口触发区接近判定上——非交互点(不新增 kind、不进 stallPressAction)。
    // 门禁:idle ∧ 无面板 ∧ 非过场(垂钓循环与过场中不显);有交互签则让位
    // (出口旁的路牌签优先,二者不叠加);过场中由 director 侧再兜一层底
    const warpHint =
      !panelOpen && !director.inputLocked && core.phase === 'idle' && !promptState
        ? warpHintAt(WORLD_MAPS[director.mapId], core.px, core.py)
        : null
    // 世界推进(票 #35):过场状态机、出口检测、换图落位、存档门禁、场景渲染
    // (交互浮签随场景渲染一并供给,放最后——过场完成/换图在本帧内生效;
    // 入图场景名横幅由导演在淡入完成沿起演,组合根不经手)
    director.update(tk.lastTime / 1000, dt, promptState, warpHint)
    // 场景配乐(票 #54):入图沿(本帧 director.update 内)切轨后,交叉淡入淡出
    // 的双轨供给每帧透传给播放器(outgoing = 淡出旧轨,incoming = 当前轨);
    // 静音覆盖 = MuteAwareSfxPlayer.setBgm(静音即对整条通道显式停)
    const bgmMix = bgm.update(dt)
    sfx.setBgm(bgmMix.outgoing, bgmMix.incoming)
    // 近水水声(票 #44):距离 = 世界层纯函数(到最近水 cell 的矩形距离,
    // 单一来源),音量随距离淡入淡出;常驻循环走 setAmbient 通道,
    // 静音覆盖 = MuteAwareSfxPlayer.setAmbient(静音即显式停循环)
    sfx.setAmbient(sfxForEvent('ambient-water'), ambientWaterLevel(waterDistancePx(WORLD_MAPS[director.mapId], core.px, core.py)))
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
        // 全屏演出替代既有 toast(票 #43):画布内横幅 + 粒子,约 2s;
        // 演出中重复触发由演出层幂等(start 不重入),一辈子一次由下行的
        // 持久化标记保证(重开/刷新后不再触发)
        grandSlam.start()
        // 音效(票 #44):大满贯 jingle 与演出同帧起播(#43 预留的接缝,
        // #44 落表行即通,演出层零改动)
        sfx.play(sfxForEvent('grand-slam'))
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
      // 经济(票 #39 有意规格变更):捕获 → 渔获入背包,不再即时入账金币
      // (「捕获即得金币」退役;金币唯一来源 = 摊位卖鱼 + 宝箱,spec §4.1——
      // 经济总量不变、时点后移)。品质由核心在结算沿 roll(独立派生种子),
      // 组合根只读转接入包;得分/XP/图鉴三路照旧,均不受品质影响。
      backpack.addFish(fishId, core.caughtQuality)
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
    // 大满贯演出推进(票 #43):时长内推进横幅时间线与粒子,结束自动收场
    grandSlam.update(dt)
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
    // 商店面板(票 #20 → #36 摊位交互):离开待机自动收起、余额/库存/竿状态刷新(打开时游戏照常推进)
    shopPanel.update(core)
    // 模式面板(票 #24):入口可用性(仅待机)、自动收起、局毕自动回面板、当前模式与纪录刷新
    modePanel.update(core)
    // 背包面板(票 #40):入口可用性(待机/蓄力/等待)、自动收起、堆叠刷新(打开时游戏照常推进)
    backpackPanel.update(core)
    // 储物箱面板(票 #40):离开待机自动收起、两栏内容刷新(打开时游戏照常推进)
    storagePanel.update(core)
    // 公告板面板(票 #55):离开待机自动收起、当前订单与持有进度刷新
    // (打开时游戏照常推进——垂钓中可积累,交付不限时)
    orderPanel.update(core)
  })
}

main().catch(err => {
  document.body.textContent = `启动失败:${err instanceof Error ? err.message : String(err)}`
})
