import { describe, expect, it } from 'vitest'
import { TUNE } from '../config'
import { FISHING_CHEST_LOOTS } from '../core/chests'
import { CoreLoop } from '../core/coreLoop'
import { Rng } from '../core/rng'
import type { LoopPhase } from '../core/types'
import {
  CHEST_TRAIL,
  FishingChestTracker,
  chestSyncCovered,
  chestTrackY,
  rollChestAppearance,
  sessionFishingChestRng,
} from './fishingChest'

/**
 * 钓上宝箱(票 #56,spec #52 内容扩充):渲染层宝箱追踪器消费核心**已暴露**的
 * 相位与小游戏状态(条/鱼位置)——核心循环零改动(既有核心测试逐位不动)。
 *
 * 接缝与期望值来源:
 * - 现身判定 = 独立派生种子的 Rng 抽一签(沿 sessionQualityRng 先例,主序列一个 draw 不动),
 *   概率入 TUNE;种子钉定用 quality.test 已钉过的首抽字面量(Rng(7) = 0.0117 / Rng(8) = 0.1563);
 * - 同步率 = 纯函数几何(绿条带同时罩住鱼与宝箱),期望值为独立字面量;
 * - 掉落复用既有宝箱内容表(柳纹木雕钓获专属,表驱动断言在 chests.test)。
 */

/** 12% 在整抽流上的经验速率:同一会话种子 400 签的命中占比应落在 5%–20% */
function empiricalRate(seed: number): number {
  const rng = sessionFishingChestRng(seed)
  let hits = 0
  for (let i = 0; i < 400; i++) if (rollChestAppearance(rng)) hits++
  return hits / 400
}

describe('宝箱现身判定(接缝:rollChestAppearance + sessionFishingChestRng,票 #56)', () => {
  it('概率 12% 入 TUNE(票面调参位,独立字面量)', () => {
    expect(TUNE.fishingChest.chance).toBe(0.12)
    expect(TUNE.fishingChest.syncNeeded).toBe(0.5)
  })

  it('种子钉定:Rng(7) 首抽 0.0117 < 12% → 现身;Rng(8) 首抽 0.1563 ≥ 12% → 不现身', () => {
    expect(rollChestAppearance(new Rng(7))).toBe(true)
    expect(rollChestAppearance(new Rng(8))).toBe(false)
  })

  it('同主种子 → 同现身序列(?seed 可复现,多抽一致)', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const a = sessionFishingChestRng(seed)
      const b = sessionFishingChestRng(seed)
      for (let i = 0; i < 8; i++) expect(rollChestAppearance(b)).toBe(rollChestAppearance(a))
    }
  })

  it('派生种子与主序列解耦:同种子的首抽与主 Rng 不同(盐真实参与派生)', () => {
    expect(sessionFishingChestRng(42).float()).not.toBe(new Rng(42).float())
  })

  it('缺省概率取 TUNE:0.12 档下多种子经验速率落在 5%–20%(不翻倍不归零)', () => {
    for (const seed of [3, 42, 777, 2024]) {
      const rate = empiricalRate(seed)
      expect(rate).toBeGreaterThan(0.05)
      expect(rate).toBeLessThan(0.2)
    }
  })

  it('概率边界可注入:chance 1 → 全现身,chance 0 → 全不现身', () => {
    const rng = sessionFishingChestRng(9)
    for (let i = 0; i < 30; i++) {
      expect(rollChestAppearance(rng, 1)).toBe(true)
      expect(rollChestAppearance(rng, 0)).toBe(false)
    }
  })
})

describe('小游戏轨道几何(接缝:chestTrackY / chestSyncCovered,纯函数)', () => {
  it('宝箱跟随鱼:固定尾距 CHEST_TRAIL = 0.12(独立字面量),鱼 0.4 → 宝箱 0.52', () => {
    expect(CHEST_TRAIL).toBe(0.12)
    expect(chestTrackY(0.4)).toBeCloseTo(0.52, 12)
  })

  it('尾距钳在轨道界内(与鱼同界 0.02–0.98):贴顶鱼不再把宝箱顶出轨道', () => {
    expect(chestTrackY(0.98)).toBeCloseTo(0.98, 12)
    expect(chestTrackY(0.02)).toBeCloseTo(0.14, 12)
  })

  it('绿条同时罩住鱼与宝箱:带 [0.46, 0.66] 落在条 [0.45, 0.73] 内 → true', () => {
    // 鱼 0.5、宝箱 0.62、判定半径 0.04 → 需罩住 [0.46, 0.66];条高 0.28、条底 0.45
    expect(chestSyncCovered(0.45, 0.28, 0.5, 0.62, 0.04)).toBe(true)
  })

  it('只罩住鱼(条偏低)或只罩住宝箱(条偏高)都不同步 → false', () => {
    expect(chestSyncCovered(0.3, 0.28, 0.5, 0.62, 0.04)).toBe(false) // 高 0.58 < 宝箱上缘 0.66
    expect(chestSyncCovered(0.55, 0.28, 0.5, 0.62, 0.04)).toBe(false) // 低 0.55 > 鱼下缘 0.46
  })

  it('宝箱在鱼下方(通用几何)同样按 min/max 取带判定', () => {
    // 鱼 0.6、宝箱 0.44 → 需罩住 [0.40, 0.64];条 [0.38, 0.66] 覆盖 → true
    expect(chestSyncCovered(0.38, 0.28, 0.6, 0.44, 0.04)).toBe(true)
    expect(chestSyncCovered(0.62, 0.28, 0.6, 0.44, 0.04)).toBe(false)
  })

  it('罩住鱼与宝箱必罩住鱼:同步覆盖是渔获进度覆盖的子集(组合根口径的安全性)', () => {
    for (let i = 0; i <= 20; i++) {
      const fishY = 0.05 + (0.9 * i) / 20
      const chestY = chestTrackY(fishY)
      for (let j = 0; j <= 10; j++) {
        const barY = 0.72 * (j / 10)
        if (chestSyncCovered(barY, 0.28, fishY, chestY, 0.04)) {
          const fishCovered = fishY + 0.04 >= barY && fishY - 0.04 <= barY + 0.28
          expect(fishCovered).toBe(true)
        }
      }
    }
  })
})

/** 结构化最小核心状态(与 worldScene.test fakeCore 同姿态:字段名与 CoreLoop 公开面一致) */
function fakeCore(phase: LoopPhase, mg?: { barY: number; fishY: number }): CoreLoop {
  return {
    phase,
    mg: mg
      ? { t: 0, timer: 0, barV: 0, barY: mg.barY, fishY: mg.fishY, fishTarget: 0.5, progress: 0.5 }
      : null,
    rodParams: { height: 0.28, vUp: 1.4, vDown: 1.15, response: 15, tapBoost: 0.55, bounce: 0.3 },
  } as unknown as CoreLoop
}

/** 脚本化 Rng 替身:依次吐出给定签值(签序列循环复用,多竿脚本同样可控) */
function stubRng(...floats: number[]): Rng {
  let i = 0
  return { float: () => floats[i++ % floats.length]! } as unknown as Rng
}

/** 现身且掉落抽到第 n 项的追踪器(FISHING_CHEST_LOOTS 均匀 5 项:r < (k+1)/5 命中第 k 项) */
function trackerWithLoot(index: number): FishingChestTracker {
  const appear = 0.05
  const draw = (index + 0.5) / 5
  return new FishingChestTracker(1, stubRng(appear, draw))
}

describe('钓上宝箱追踪器(接缝:FishingChestTracker,渲染层消费核心公开态)', () => {
  it('抛竿落水沿 roll:现身影子下 active = true,掉落在现身时刻抽定(同签同掉落)', () => {
    const core = fakeCore('idle')
    const tracker = new FishingChestTracker(1, stubRng(0.05, 0.1))
    tracker.update(core, 0.016)
    core.phase = 'waiting'
    tracker.update(core, 0.016)
    expect(tracker.active).toBe(true)
    expect(FISHING_CHEST_LOOTS).toContain(tracker.activeLoot)
  })

  it('未命中 12%:本竿无宝箱,小游戏全程也不结算(active 恒 false、outcome null)', () => {
    const core = fakeCore('idle')
    const tracker = new FishingChestTracker(1, stubRng(0.9))
    core.phase = 'waiting'
    tracker.update(core, 0.016)
    expect(tracker.active).toBe(false)
    core.phase = 'minigame'
    core.mg = { t: 0, timer: 0, barV: 0, barY: 0.45, fishY: 0.5, fishTarget: 0.5, progress: 0.5 }
    for (let f = 0; f < 30; f++) tracker.update(core, 0.016)
    core.phase = 'caught'
    tracker.update(core, 0.016)
    expect(tracker.captureOutcome).toBeNull()
    expect(tracker.capturedLoot).toBeNull()
  })

  it('同步率达标(全程罩住)→ 捕获沿 captured:capturedLoot = 现身时抽定的掉落', () => {
    const tracker = trackerWithLoot(0)
    const core = fakeCore('idle')
    tracker.update(core, 0.016)
    core.phase = 'waiting'
    tracker.update(core, 0.016)
    const loot = tracker.activeLoot
    core.phase = 'minigame'
    tracker.update(core, 0.016)
    // 全程把条停在同时罩住鱼 0.5 与宝箱 0.62 的位置(条底 0.45)
    for (let f = 0; f < 30; f++) {
      core.mg = { t: 0, timer: 0, barV: 0, barY: 0.45, fishY: 0.5, fishTarget: 0.5, progress: 0.5 }
      tracker.update(core, 0.016)
    }
    expect(tracker.syncRatio).toBe(1)
    core.phase = 'caught'
    tracker.update(core, 0.016)
    expect(tracker.captureOutcome).toBe('captured')
    expect(tracker.capturedLoot).toBe(loot)
  })

  it('同步率不足(全程脱开)→ 捕获沿 escaped:宝箱逃走、capturedLoot null(渔获照常,核心已判)', () => {
    const tracker = trackerWithLoot(1)
    const core = fakeCore('idle')
    tracker.update(core, 0.016)
    core.phase = 'waiting'
    tracker.update(core, 0.016)
    core.phase = 'minigame'
    tracker.update(core, 0.016)
    for (let f = 0; f < 30; f++) {
      core.mg = { t: 0, timer: 0, barV: 0, barY: 0.05, fishY: 0.5, fishTarget: 0.5, progress: 0.5 }
      tracker.update(core, 0.016)
    }
    expect(tracker.syncRatio).toBe(0)
    core.phase = 'caught'
    tracker.update(core, 0.016)
    expect(tracker.captureOutcome).toBe('escaped')
    expect(tracker.capturedLoot).toBeNull()
  })

  it('恰在 50% 门槛(≥ 判定):0.5s 罩住 + 0.5s 脱开 → captured(dt 取 0.25 二进制精确累计)', () => {
    const tracker = trackerWithLoot(2)
    const core = fakeCore('idle')
    tracker.update(core, 0.016)
    core.phase = 'waiting'
    tracker.update(core, 0.016)
    core.phase = 'minigame'
    tracker.update(core, 0.016)
    for (let f = 0; f < 2; f++) {
      core.mg = { t: 0, timer: 0, barV: 0, barY: 0.45, fishY: 0.5, fishTarget: 0.5, progress: 0.5 }
      tracker.update(core, 0.25)
    }
    for (let f = 0; f < 2; f++) {
      core.mg = { t: 0, timer: 0, barV: 0, barY: 0.05, fishY: 0.5, fishTarget: 0.5, progress: 0.5 }
      tracker.update(core, 0.25)
    }
    expect(tracker.syncRatio).toBe(0.5)
    core.phase = 'caught'
    tracker.update(core, 0.016)
    expect(tracker.captureOutcome).toBe('captured')
  })

  it('脱钩沿(小游戏失败)宝箱一并逃走:active 复位、不结算掉落', () => {
    const tracker = trackerWithLoot(3)
    const core = fakeCore('idle')
    tracker.update(core, 0.016)
    core.phase = 'waiting'
    tracker.update(core, 0.016)
    core.phase = 'minigame'
    tracker.update(core, 0.016)
    core.mg = { t: 0, timer: 0, barV: 0, barY: 0.45, fishY: 0.5, fishTarget: 0.5, progress: 0.5 }
    tracker.update(core, 0.016)
    core.phase = 'escaped'
    tracker.update(core, 0.016)
    expect(tracker.active).toBe(false)
    expect(tracker.captureOutcome).toBeNull()
    expect(tracker.capturedLoot).toBeNull()
  })

  it('等待中收竿(waiting → idle)宝箱即消失;下一竿重新 roll(每竿一签)', () => {
    const tracker = trackerWithLoot(3)
    const core = fakeCore('idle')
    tracker.update(core, 0.016)
    core.phase = 'waiting'
    tracker.update(core, 0.016)
    expect(tracker.active).toBe(true)
    core.phase = 'idle'
    tracker.update(core, 0.016)
    expect(tracker.active).toBe(false)

    // 下一竿:脚本恒 0.05 → 再度现身,同步计数已清零(不跨竿累计)
    core.phase = 'waiting'
    tracker.update(core, 0.016)
    expect(tracker.active).toBe(true)
    core.phase = 'minigame'
    tracker.update(core, 0.016)
    core.mg = { t: 0, timer: 0, barV: 0, barY: 0.05, fishY: 0.5, fishTarget: 0.5, progress: 0.5 }
    tracker.update(core, 0.5)
    expect(tracker.syncRatio).toBe(0)
  })

  it('垂钓循环外的相位(waiting→bite→minigame)不计入同步;结算停留期不重判', () => {
    const tracker = trackerWithLoot(4)
    const core = fakeCore('idle')
    tracker.update(core, 0.016)
    core.phase = 'waiting'
    tracker.update(core, 0.016)
    core.phase = 'bite'
    tracker.update(core, 0.5)
    core.phase = 'minigame'
    tracker.update(core, 0.5)
    expect(tracker.syncRatio).toBe(0) // bite 帧不计;minigame 首帧条不在位
    core.mg = { t: 0, timer: 0, barV: 0, barY: 0.45, fishY: 0.5, fishTarget: 0.5, progress: 0.5 }
    tracker.update(core, 0.25)
    core.phase = 'caught'
    tracker.update(core, 0.016)
    expect(tracker.captureOutcome).toBe('captured') // 0.25 / 0.25 = 100% ≥ 50%
    // 结算停留期重复喂帧:结果不翻转(捕获沿恰好判一次)
    tracker.update(core, 0.016)
    expect(tracker.captureOutcome).toBe('captured')
  })
})

describe('钓上宝箱 × 真实核心循环(组合根同款接线:每竿一签,等待期即现身)', () => {
  const DT = 1 / 60

  /** 蓄满一竿并松开(与 economyWiring.test castFull 同款驱动,真实相位机) */
  function castFull(core: CoreLoop): void {
    core.update(DT, { holding: true, moveX: 0, moveY: 0 })
    for (let i = 0; i < Math.round(1 / DT); i++) core.update(DT, { holding: true, moveX: 0, moveY: 0 })
    core.update(DT, { holding: false, moveX: 0, moveY: 0 })
    expect(core.phase).toBe('waiting')
  }

  it('60 竿(真实相位机)现身速率落在 2%–30%:waiting 边沿恰好一签,不随帧重复', () => {
    let casts = 0
    let appearances = 0
    for (let seed = 1; seed <= 60; seed++) {
      const mainSeed = seed * 7 + 3
      const core = new CoreLoop(new Rng(mainSeed))
      core.setInteractionSource(() => ({ kind: 'spot' })) // 抛竿门禁:钓位范围内
      const tracker = new FishingChestTracker(mainSeed)
      castFull(core)
      casts++
      tracker.update(core, DT)
      const appeared = tracker.active
      if (appeared) appearances++
      // 等待/咬钩期间继续喂帧:现身状态恒定(若逐帧重 roll,12% 档会被打满)
      for (let f = 0; f < 90 && (core.phase === 'waiting' || core.phase === 'bite'); f++) {
        core.update(DT, { holding: false, moveX: 0, moveY: 0 })
        tracker.update(core, DT)
        expect(tracker.active).toBe(appeared)
      }
    }
    expect(appearances).toBeGreaterThan(casts * 0.02)
    expect(appearances).toBeLessThan(casts * 0.3)
  })

  it('真实小游戏状态可直接驱动同步累计:条罩住鱼与宝箱的帧计入占比(现身竿)', () => {
    // 找一竿现身宝箱的种子(12% 档,逐种子试到命中为止)
    let mainSeed = 0
    let core: CoreLoop | null = null
    let tracker: FishingChestTracker | null = null
    for (let seed = 1; seed <= 200 && !core; seed++) {
      const candidate = seed * 7 + 3
      const c = new CoreLoop(new Rng(candidate))
      c.setInteractionSource(() => ({ kind: 'spot' }))
      const t = new FishingChestTracker(candidate)
      castFull(c)
      t.update(c, DT)
      if (t.active) {
        mainSeed = candidate
        core = c
        tracker = t
      }
    }
    expect(mainSeed).toBeGreaterThan(0)
    // 6.5s 覆盖等待上限(TUNE.wait.max 6.0)+ 咬钩窗口:不响应必走完等待→咬钩→脱钩
    for (let f = 0; f < 400; f++) {
      core!.update(DT, { holding: false, moveX: 0, moveY: 0 })
      tracker!.update(core!, DT)
      if (core!.phase !== 'waiting' && core!.phase !== 'bite') break
      expect(tracker!.active).toBe(true) // 现身竿:等待/咬钩期保持
    }
    if (core!.phase === 'minigame' && core!.mg) {
      // 条停在同时罩住鱼与宝箱的位置喂 0.25s:占比 100%(真实 mg/rodParams 驱动)
      const barBottom = Math.max(0, Math.min(1 - core!.rodParams.height, core!.mg.fishY - 0.02))
      core!.mg.barY = barBottom
      tracker!.update(core!, 0.25)
      expect(tracker!.syncRatio).toBe(1)
    } else {
      // 错过响应窗口 → 脱钩收场:宝箱一并消失,同步计数清零
      expect(core!.phase).toBe('escaped')
      expect(tracker!.active).toBe(false)
      expect(tracker!.syncRatio).toBe(0)
    }
  })
})
