import type { SfxId } from './sfxMapping'

/**
 * BGM 通道(票 #54,spec 术语「场景配乐」):每场景一轨循环背景音乐,
 * 场景切换时约 1s 交叉淡入淡出。与近水水声(ambient-water)分属两条常驻
 * 循环通道:BGM 全场景常响、音量低调铺底;水声按距离淡入淡出。
 *
 * 归属:切轨时机归世界导演的入图沿(过场淡入完成沿 = 场景横幅同点,组合根
 * 经 onSceneEntered 调 setTarget);本层只管「应响哪条轨」到「双轨音量供给」
 * 的状态机——供给由组合根每帧透传给播放器(`BgmPlayer.setBgm`)。
 */

/**
 * 交叉淡入淡出时长(秒,票面「约 1s」):旧轨线性淡出、新轨线性淡入,
 * 两档此消彼长,和恒等于铺底档(不会同时超过满档)。
 */
export const BGM_CROSSFADE_SECONDS = 1.0

/**
 * BGM 铺底音量档(0..1,实际听感 = 播放器主音量 × 本档 × 素材自身响度):
 * 素材入库时已归一到 -14 dB 峰值(环境声同档,见 public/sfx/README.md),
 * 本档在其上再压一成,保证「低调铺底不干扰玩法音效」。
 */
export const BGM_BASE_LEVEL = 0.75

/**
 * 交叉淡入淡出音量曲线(纯函数):切轨后 elapsed 秒的旧轨/新轨音量档
 * (0..BGM_BASE_LEVEL)。负数/NaN 按起切沿兜底(与环境声音量函数同款纪律)。
 */
export function bgmCrossfadeLevels(elapsed: number): { outgoing: number; incoming: number } {
  const t = elapsed >= 0 && elapsed <= BGM_CROSSFADE_SECONDS ? elapsed / BGM_CROSSFADE_SECONDS : elapsed > BGM_CROSSFADE_SECONDS ? 1 : 0
  return { outgoing: (1 - t) * BGM_BASE_LEVEL, incoming: t * BGM_BASE_LEVEL }
}

/** 单轨供给:id + 当帧音量档(直接透传给播放器) */
export interface BgmTrackSupply {
  id: SfxId
  level: number
}

/** 每帧双轨供给:outgoing = 淡出中的旧轨(null = 无),incoming = 当前轨 */
export interface BgmMix {
  outgoing: BgmTrackSupply | null
  incoming: BgmTrackSupply | null
}

/**
 * BGM 通道状态机:组合根在入图沿声明目标轨(setTarget),每帧推进(update)
 * 并把双轨供给透传给播放器。
 *
 * - 同 id 重复 setTarget 空操作(不重开交叉时间线);
 * - 交叉中途再切轨:更旧的淡出轨被丢弃(硬停)——1s 内连穿两个出口是极端
 *   情形,宁可硬切也不叠三轨;
 * - 切到 null = 停播(预留扩展位,如标题画面;当前三场景恒有轨)。
 */
export class BgmChannel {
  private current: SfxId | null = null
  private fading: SfxId | null = null
  private elapsed = 0

  /** 声明当前应响的轨(入图沿;同 id 空操作) */
  setTarget(id: SfxId | null): void {
    if (id === this.current) return
    this.fading = this.current
    this.current = id
    this.elapsed = 0
  }

  /** 每帧推进:交叉时间线 → 双轨供给(组合根原样透传给 BgmPlayer.setBgm) */
  update(dt: number): BgmMix {
    if (this.fading === null && this.current === null) return { outgoing: null, incoming: null }
    this.elapsed += dt
    const levels = bgmCrossfadeLevels(this.elapsed)
    const outgoing = this.fading !== null && levels.outgoing > 0 ? { id: this.fading, level: levels.outgoing } : null
    if (outgoing === null) this.fading = null // 淡出窗走满,显式停令已交给播放器
    const incoming = this.current !== null ? { id: this.current, level: levels.incoming } : null
    return { outgoing, incoming }
  }
}
