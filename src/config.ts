/**
 * 调参面板 —— 原型验收标准对应的手感参数全部集中在这里。
 * 改完保存即可(Vite HMR 即时生效),不用重启。
 */
export const TUNE = {
  move: {
    /** 移动速度(世界像素/秒,票 #34 有意规格变更:归一化 0.5 屏高/秒 ≈135px/s → 70px/s ≈ 4.4 tile/s) */
    speed: 70,
  },
  charge: {
    /** 蓄力从 0 到满的秒数 */
    maxTime: 0.9,
  },
  wait: {
    /** 咬钩前随机等待时长范围(秒) */
    min: 1.5,
    max: 6.0,
  },
  bite: {
    /** 响应窗口随机范围(秒),错过即脱钩收竿 */
    windowMin: 0.45,
    windowMax: 0.85,
    /** 输入缓冲:咬钩前这么久内的按下也算起竿(预判不吃亏) */
    pressBuffer: 0.25,
    /** 等待中持续按住多久判定为主动收竿(短按不打断) */
    reelHold: 0.35,
  },
  bar: {
    /** 绿条高度(占轨道比例) */
    height: 0.28,
    /** 按住时的目标上升速度(轨道/秒) */
    vUp: 1.4,
    /** 松开时的目标下沉速度(轨道/秒) */
    vDown: 1.15,
    /** 逼近目标速度的响应(1/s):越大越跟手,越小惯性越重 */
    response: 15,
    /** 每次点按的瞬时上冲脉冲(点按也能控条) */
    tapBoost: 0.55,
    /** 撞到轨道上下边缘的反弹系数 */
    bounce: 0.3,
  },
  minigame: {
    /** 进度条初始值 */
    progressStart: 0.35,
    /** 罩住鱼时每秒上涨 */
    gain: 0.22,
    /** 脱开时每秒流失 */
    drain: 0.18,
    /** 鱼图标的判定半径(占轨道比例) */
    fishHalf: 0.04,
  },
  /** 蓄力对出鱼权重的影响强度:weight = 1 + power × poolBias × difficulty */
  poolBias: 0.9,
  /** 浓饵对出鱼权重的修正强度(票 #21):装备生效时 weight ×(1 + richBaitBias × difficulty)——难度 1 ×1.2、难度 3 ×1.6、难度 5 ×2.0,恒 > 1 永不归零 */
  richBaitBias: 0.2,
  /**
   * 渔获品质概率表(票 #39,spec §4.2):蓄力既选鱼种、也定品质——
   * 银星概率 = silverBase + 蓄力 × silverChargeBonus,金星同构,普通 = 余量。
   * 起步调参:轻抛银 12%/金 3%,蓄满银 30%/金 10%。
   */
  quality: {
    silverBase: 0.12,
    silverChargeBonus: 0.18,
    goldBase: 0.03,
    goldChargeBonus: 0.07,
    /** 品质卖价倍率:卖价 = 鱼分值 × 倍率(银 ×1.5、金 ×2 量级;半数分值四舍五入到整数金币) */
    sellMul: { normal: 1, silver: 1.5, gold: 2 },
  },
  world: {
    /** 会话天气为雨的概率(会话开始一次抽样,会话内恒定;晴 = 1 − 该值) */
    rainChance: 0.3,
  },
  resolution: {
    /** 捕获/脱钩提示停留秒数 */
    holdTime: 1.1,
  },
  /** 限时挑战(票 #22/#23):纯计时壳,玩法机制与无限一致,归零强制结算 */
  timed: {
    /** 单局时长(秒):倒计时归零即强制结束当前尝试 */
    duration: 120,
  },
} as const

/** 绿条手感参数组(竿档携带,注入绿条物理) */
export interface BarParams {
  /** 绿条高度(占轨道比例) */
  height: number
  /** 按住时的目标上升速度(轨道/秒) */
  vUp: number
  /** 松开时的目标下沉速度(轨道/秒) */
  vDown: number
  /** 逼近目标速度的响应(1/s) */
  response: number
  /** 每次点按的瞬时上冲脉冲 */
  tapBoost: number
  /** 撞到轨道上下边缘的反弹系数 */
  bounce: number
}

/** 一档鱼竿:解锁条件(等级制 + 商店购买两条路径)与整组绿条参数 */
export interface RodDef {
  id: string
  name: string
  /** 达到该等级即自动解锁并切换 */
  unlockLevel: number
  /** 商店售价(金币);等级已解锁的竿购买无意义(商店标"已拥有") */
  price: number
  params: BarParams
}

/** 一种鱼饵:装备后管定数竿、抛竿消耗(spec #17 经济系统;库存与装备槽由 WalletStore 管理) */
export interface BaitDef {
  id: string
  name: string
  /** 单次购买提供的竿数(起步 10) */
  charges: number
  /** 单次购买价格(金币) */
  price: number
}

/**
 * 鱼饵表:香饵(等待时长减半)与浓饵(难鱼权重提升)。
 * 浓饵的玩法效果随 D 世界权重引擎接入,本表先行定义目录与调参叶数值。
 */
export const BAITS: BaitDef[] = [
  { id: 'xianger', name: '香饵', charges: 10, price: 30 },
  { id: 'nonger', name: '浓饵', charges: 10, price: 50 },
]

/**
 * 竿档表:3 档,解锁等级 L1/L3/L6 为起步调参值。
 * 硬约束(spec #5):竹竿参数逐字等于现行 TUNE.bar(起点手感不变);
 * 档间步进总幅度 ±15% 内,方向只会更容易(绿条更高 / 更快 / 反弹更收敛)。
 */
export const RODS: RodDef[] = [
  {
    id: 'zhugan',
    name: '竹竿',
    unlockLevel: 1,
    price: 0, // 初始竿,永远已拥有(等级解锁),不可购
    // 逐字复制 TUNE.bar:竹竿 = 现行手感(结构上由 config.test.ts 锁定)
    params: { ...TUNE.bar },
  },
  {
    id: 'tangan',
    name: '碳竿',
    unlockLevel: 3,
    price: 200, // 起步值:约 10~15 次普通捕获的金币(鱼分值 10~50)
    params: { height: 0.3, vUp: 1.5, vDown: 1.22, response: 16, tapBoost: 0.58, bounce: 0.28 },
  },
  {
    id: 'xinggou',
    name: '星钩',
    unlockLevel: 6,
    price: 600, // 起步值:后期大件
    params: { height: 0.32, vUp: 1.6, vDown: 1.3, response: 17, tapBoost: 0.62, bounce: 0.26 },
  },
]
