import { Application } from 'pixi.js'
// 像素字体自托管(spec #12):fontsource 纯 CSS + woff2,Vite 负责打包与按需加载。
// font-display: swap → 首帧可能以系统字体闪现再切换(轻微 FOUT,票面接受);
// 不做预载:该包为单文件全量中文字集(woff2 约 600KB),预载会挤占首屏关键资源
import '@fontsource/fusion-pixel-12px-proportional-sc'
import { RODS } from './config'
import { BackpackStore } from './core/backpack'
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
import { interactionLabel, nearestInteraction, parseInteractionSpots } from './world/interactions'
import { worldCollisionSource } from './world/worldMap'
import { baitBadgeText } from './ui/baitBadgeText'
import { CollectionPanel } from './ui/collectionPanel'
import { collectionToasts, snapshotOf } from './ui/collectionToastPolicy'
import { countdownBadgeText } from './ui/countdownBadgeText'
import { baitEffectSource, buyBaitOutcome, equippedBaitView, sellFishOutcome } from './ui/economyWiring'
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
  // 本票接香饵抛竿消耗,商店购竿与购饵 UI 属后续票。
  // 票 #39 起:金币唯一来源 = 摊位卖鱼 + 宝箱(spec §4.1),捕获不再即时入账
  const wallet = new WalletStore(storage)
  // 背包(票 #39):渔获按(鱼种 × 品质)堆叠,纯核心 store;kv 持久化与
  // 背包/储物箱面板归票 #40,本票只接捕获入包与摊位卖鱼
  const backpack = new BackpackStore(FISH.map(f => f.id))
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
  // 轻提示层:新收录 / 池塘大满贯,顶部居中,不拦截游戏输入
  const toasts = new ToastLayer()
  let prevPhase: LoopPhase = core.phase
  // 限时局进行中边沿基准(票 #24):判定单源在 roundJustEnded(roundEdgePolicy),
  // 此处只存上一帧局标志——true→false 且模式仍限时 = 归零强制结算完成
  let prevRoundActive = core.roundActive
  // 动作键按下边沿基准(票 #36):与核心同帧消费同一 holding 信号
  let prevHolding = false

  // —— 交互点系统(票 #36,spec §2.1–2.3):物件层声明 → 触发判定 → 动作 ——
  // 解析村舍图交互点(钓位/摊位;note 等后续票 kind 不在本票解析范围);
  // 触发 = 统一 1.5 tile(radius 属性可覆盖),重叠取最近。
  const interactions = parseInteractionSpots(village.objects, village.tileWidth)
  // 已开面板(互斥协调器保证至多一个):面板打开时世界动作全歇、浮签全隐、移动锁死
  const openPanel = (): { close(): void } | null =>
    [collectionPanel, shopPanel, modePanel].find(p => p.isOpen()) ?? null
  // 每帧刷新的「范围内最近交互点」:交互门禁/浮签/自动切水/摊位动作四方同源,
  // 不因各自取值时机不同而打架(核心门禁在 core.update 内消费的即本帧值)
  let nearestTarget: ReturnType<typeof nearestInteraction> = null
  const anyPanelOpen = (): boolean => openPanel() !== null
  // 交互点来源注入(核心门禁:idle 按下须最近交互点是钓位才蓄力;
  // 面板打开时来源恒 null——动作键优先关面板,同一次按下不会「关面板又开竿」)
  core.setInteractionSource(() => {
    if (anyPanelOpen()) return null
    return nearestTarget?.kind === 'spot' ? { kind: 'spot' } : null
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
    nearestTarget = panelOpen ? null : nearestInteraction(interactions, core.px, core.py)

    // 面板打开锁移动(spec §2.4):方向分量清零,核心侧无需感知面板
    core.update(dt, { holding, moveX: panelOpen ? 0 : dx, moveY: panelOpen ? 0 : dy })

    // 动作键按下边沿 → 意图(关闭口径优先):关面板 / 摊位开商店 / 叙事物读彩蛋;
    // 钓位蓄力抛竿不经此处——核心已按交互门禁在本帧 update 内处理。
    // 叙事物(票 #37)仅在待机响应:小游戏连按 E 是玩法操作,垂钓中不弹彩蛋
    // (与摊位「仅 idle 可开」同口径);toast 一句静态文案,零奖励、可重复查看
    if (pressed) {
      const intent = stallPressAction(panelOpen, nearestTarget?.kind ?? null)
      if (intent === 'close-panel') openPanel()?.close()
      else if (intent === 'open-shop') shopPanel.open()
      else if (intent === 'read-narrative' && core.phase === 'idle') {
        const narrative = nearestTarget?.text
        if (narrative) toasts.showNarrative(narrative)
      }
    }

    // 钓位走近自动切所属水域(仅 idle;setWater 核心门禁保留,票 #15 禁切口径零改动;
    // 水域来源 = 钓位物件 area 属性,图级推导待 #35 并入后在此接缝)
    if (
      !panelOpen &&
      core.phase === 'idle' &&
      nearestTarget?.kind === 'spot' &&
      nearestTarget.area !== undefined &&
      core.area !== nearestTarget.area
    ) {
      core.setWater(nearestTarget.area)
    }
    // 交互浮签供给(idle ∧ 无面板 ∧ 范围内有交互点):渲染层另有非 idle 兜底
    const promptState =
      core.phase === 'idle' && nearestTarget
        ? { x: nearestTarget.x, y: nearestTarget.y, label: interactionLabel(nearestTarget.kind) }
        : null
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
    scene.update(core, tk.lastTime / 1000, dt, promptState)
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
  })
}

main().catch(err => {
  document.body.textContent = `启动失败:${err instanceof Error ? err.message : String(err)}`
})
