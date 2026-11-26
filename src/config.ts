/**
 * 调参面板 —— 原型验收标准对应的手感参数全部集中在这里。
 * 改完保存即可(Vite HMR 即时生效),不用重启。
 */
export const TUNE = {
  move: {
    /** 移动速度(屏幕高度/秒) */
    speed: 0.5,
  },
  /** 池塘范围(归一化),同时是角色不可进入的区域 */
  pond: { x0: 0.16, y0: 0.14, x1: 0.86, y1: 0.8 },
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
  resolution: {
    /** 捕获/脱钩提示停留秒数 */
    holdTime: 1.1,
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

/** 一档鱼竿:解锁条件(等级制,商店购买路径待经济系统扩展)与整组绿条参数 */
export interface RodDef {
  id: string
  name: string
  /** 达到该等级即自动解锁并切换 */
  unlockLevel: number
  params: BarParams
}

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
    // 逐字复制 TUNE.bar:竹竿 = 现行手感(结构上由 config.test.ts 锁定)
    params: { ...TUNE.bar },
  },
  {
    id: 'tangan',
    name: '碳竿',
    unlockLevel: 3,
    params: { height: 0.3, vUp: 1.5, vDown: 1.22, response: 16, tapBoost: 0.58, bounce: 0.28 },
  },
  {
    id: 'xinggou',
    name: '星钩',
    unlockLevel: 6,
    params: { height: 0.32, vUp: 1.6, vDown: 1.3, response: 17, tapBoost: 0.62, bounce: 0.26 },
  },
]
