import { TUNE } from '../config'
import type { ChestLoot } from '../core/chests'
import { FISHING_CHEST_LOOTS } from '../core/chests'
import type { CoreLoop } from '../core/coreLoop'
import { deriveSeed, Rng } from '../core/rng'
import type { LoopPhase } from '../core/types'

/**
 * 钓上宝箱(票 #56,spec #52 内容扩充):渲染层宝箱追踪器——消费核心**已暴露**
 * 的相位与小游戏状态(条/鱼位置,`core.phase` / `core.mg` / `core.rodParams`),
 * 核心循环零改动(既有核心测试逐位不动)。
 *
 * - 现身:抛竿落水沿(waiting 边沿)对独立派生种子的 Rng 抽一签,命中 TUNE
 *   概率即现身,同一签顺带抽定掉落(均一权重,?seed 可复现);
 * - 同步率:小游戏进行中逐帧累计「绿条同时罩住鱼与宝箱」的时长占比
 *   (宝箱跟随鱼、固定尾距,罩住二者是罩住鱼的子集,渔获进度不受影响);
 * - 结算:捕获沿占比 ≥ TUNE 门槛 → 宝箱随渔获一并入手(掉落由组合根经
 *   economyWiring 既有入账路径发放);不足则宝箱逃走,渔获照常。
 */

/** 宝箱相对鱼的固定尾距(轨道归一化;单源:追踪器判定与场景绘制共用) */
export const CHEST_TRAIL = 0.12

/** 钓上宝箱旁路的派生盐:主种子经派生后喂独立 Rng,与主随机序列完全解耦(沿品质/天气先例) */
export const FISHING_CHEST_SEED_SALT = 0x63c2a5e1

/** 钓上宝箱会话 Rng:会话开始由主种子派生一次,每次抛竿落水沿抽一签(现身) */
export function sessionFishingChestRng(mainSeed: number): Rng {
  return new Rng(deriveSeed(mainSeed, FISHING_CHEST_SEED_SALT))
}

/**
 * 宝箱现身判定:对传入 Rng 抽一签,签值低于概率即现身。
 * 概率可注入(缺省 = TUNE.fishingChest.chance);调用方须喂独立派生种子的
 * Rng(sessionFishingChestRng),不动主随机序列。
 */
export function rollChestAppearance(rng: Rng, chance: number = TUNE.fishingChest.chance): boolean {
  return rng.float() < chance
}

/**
 * 小游戏中宝箱的轨道位置:跟随鱼、固定尾距,钳在轨道内(与鱼同界 0.02–0.98)
 * ——鱼贴顶时尾距自然收窄(宝箱贴向轨道顶,图标不被顶出轨道)。注意条顶
 * ≤ 1.0 的轨道硬界不因尾距收窄而放宽:贴顶位置的可同步性由 chestSyncCovered
 * 的相交口径保证,不在此处制造「天然喘息位」。
 */
export function chestTrackY(fishY: number): number {
  return Math.max(0.02, Math.min(0.98, fishY + CHEST_TRAIL))
}

/**
 * 绿条是否同时罩住鱼与宝箱(同步判定的几何单源):轨道归一化,barY 为条底。
 * 判定半径 fishHalf 只作用于鱼侧——鱼用与核心渔获进度**同口径**的相交判定
 * (鱼判定盘与条带有公共点即算罩住;贴顶/贴底时判定盘越出轨道的部分物理
 * 不可罩,条顶 ≤ 1.0 / 条底 ≥ 0,苛求整盘入条会让贴边位置永远不同步);
 * 宝箱按点位落条判定,不另计半径。同步条件包含核心对鱼的覆盖条件,故同步帧
 * 同时是渔获进度的上涨帧。
 */
export function chestSyncCovered(
  barY: number,
  barHeight: number,
  fishY: number,
  chestY: number,
  fishHalf: number,
): boolean {
  const fishCovered = fishY + fishHalf >= barY && fishY - fishHalf <= barY + barHeight
  const chestCovered = chestY >= barY && chestY <= barY + barHeight
  return fishCovered && chestCovered
}

/** 钓上宝箱掉落抽定:对传入 Rng 抽一签,池上均一权重(现身时刻恰好一签,同签同掉落) */
export function pickFishingChestLoot(rng: Rng): ChestLoot {
  const index = Math.min(FISHING_CHEST_LOOTS.length - 1, Math.floor(rng.float() * FISHING_CHEST_LOOTS.length))
  return FISHING_CHEST_LOOTS[index]!
}

/** 捕获沿结算结果:captured = 随渔获一并入手;escaped = 宝箱逃走(渔获照常) */
export type FishingChestOutcome = 'captured' | 'escaped'

/**
 * 渲染层宝箱追踪器:组合根构造一次(seed 派生会话 Rng),每帧在 core.update
 * 之后喂入核心公开态。相位边沿单源判定——现身/抽定在 waiting 边沿,同步累计
 * 只在 minigame 相位,结算只在 caught 边沿恰好一次;收竿/脱钩/回待机即消失。
 */
export class FishingChestTracker {
  private readonly rng: Rng
  private present = false
  private loot: ChestLoot | null = null
  private outcome: FishingChestOutcome | null = null
  /** 罩住鱼与宝箱的累计秒数与本竿小游戏累计秒数(同步率 = synced / total) */
  private synced = 0
  private total = 0
  private prevPhase: LoopPhase = 'idle'

  /**
   * @param mainSeed 主种子(派生会话 Rng;?seed 可复现)
   * @param rng 注入替身(测试脚本化签值;缺省 = 主种子派生)
   */
  constructor(mainSeed: number, rng: Rng = sessionFishingChestRng(mainSeed)) {
    this.rng = rng
  }

  /** 本竿宝箱是否已现身(浮标旁/小游戏轨道的图标显隐由场景按相位消费) */
  get active(): boolean {
    return this.present
  }

  /** 现身时刻抽定的掉落(未现身 = null;结算前可读,供测试钉「同签同掉落」) */
  get activeLoot(): ChestLoot | null {
    return this.loot
  }

  /** 捕获沿结算结果(null = 无宝箱 / 非捕获沿);捕获沿恰好判一次,不随结算停留翻转 */
  get captureOutcome(): FishingChestOutcome | null {
    return this.outcome
  }

  /** 宝箱随渔获一并入手时的掉落(其余一切状态 = null;组合根捕获沿据此发放) */
  get capturedLoot(): ChestLoot | null {
    return this.outcome === 'captured' ? this.loot : null
  }

  /** 当前同步率(罩住鱼与宝箱的累计时长占比;无小游戏累计 = 0) */
  get syncRatio(): number {
    return this.total > 0 ? this.synced / this.total : 0
  }

  /** 每帧推进:先判相位边沿(现身/结算/消失),再做小游戏同步累计 */
  update(core: CoreLoop, dt: number): void {
    const phase = core.phase
    if (phase !== this.prevPhase) {
      if (phase === 'waiting') {
        // 抛竿落水沿:一签定现身,命中即同签顺带抽定掉落(两签,?seed 可复现)
        this.present = rollChestAppearance(this.rng)
        this.loot = this.present ? pickFishingChestLoot(this.rng) : null
        this.synced = 0
        this.total = 0
        this.outcome = null
      } else if (phase === 'caught') {
        // 捕获沿:同步率达门槛 → 宝箱随渔获入手;不足则宝箱逃走(渔获照常,
        // 捕获本身由核心结算沿判定,本层不参与)。末帧不足 16ms 的累计不回补
        // (settle 发生在 core.update 内,本帧相位已是 caught),偏差远小于门槛。
        if (this.present) {
          this.outcome = this.syncRatio >= TUNE.fishingChest.syncNeeded ? 'captured' : 'escaped'
        }
      } else if (phase === 'idle' || phase === 'escaped') {
        // 收竿 / 脱钩 / 回待机:宝箱消失,掉落与同步计数一并作废
        this.present = false
        this.loot = null
        this.outcome = null
        this.synced = 0
        this.total = 0
      }
      this.prevPhase = phase
    }
    // 同步累计:仅现身宝箱的小游戏相位;宝箱位置 = 跟随鱼(chestTrackY 单源)
    if (this.present && phase === 'minigame' && core.mg) {
      this.total += dt
      const mg = core.mg
      const chestY = chestTrackY(mg.fishY)
      if (chestSyncCovered(mg.barY, core.rodParams.height, mg.fishY, chestY, TUNE.minigame.fishHalf)) {
        this.synced += dt
      }
    }
  }
}
