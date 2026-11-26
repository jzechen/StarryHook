/**
 * 调参面板 —— 原型验收标准对应的手感参数全部集中在这里。
 * 改完保存即可(Vite HMR 即时生效),不用重启。
 */
export const TUNE = {
  charge: {
    /** 蓄力从 0 到满的秒数 */
    maxTime: 1.2,
  },
  wait: {
    /** 咬钩前随机等待时长范围(秒) */
    min: 1.5,
    max: 6.0,
  },
  bite: {
    /** 响应窗口随机范围(秒),错过即脱钩收竿 */
    windowMin: 0.4,
    windowMax: 0.8,
  },
  bar: {
    /** 绿条高度(占轨道比例) */
    height: 0.28,
    /** 按住时的向上加速度(轨道归一化单位 /s²) */
    accelUp: 4.2,
    /** 松开时的重力加速度 */
    gravity: 3.0,
    /** 速度上限 */
    vmax: 1.7,
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
