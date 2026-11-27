import type { SfxId } from './sfxMapping'

/**
 * 播放接口(注入式系统边界):真实实现为浏览器 Audio(AudioSfxPlayer),
 * 测试用录制替身顶替。play(null) = 事件未配音效,空操作。
 */
export interface SfxPlayer {
  play(id: SfxId | null): void
}

/**
 * 环境声循环接口(票 #44,注入式系统边界):常驻单实例循环,音量随环境
 * 逐帧淡入淡出(近水水声)。与一次性 play 分属两通道:
 * - id = null 或 level ≤ 0 → 停掉循环(显式停,不放任音量 0 空转);
 * - 同 id 重复调用只调音量,不重启(淡入淡出 = 逐帧改音量,不是断续重播)。
 */
export interface AmbientLoopPlayer {
  setAmbient(id: SfxId | null, level: number): void
}

/** 播放器主音量(事件音与环境声共用一档兜底;响度档见 public/sfx/README.md) */
const MASTER_VOLUME = 0.6

/**
 * 真实实现:浏览器 Audio。按需懒创建并复用同名音频元素;
 * autoplay 拦截/解码失败等一律静默吞掉(音效是点缀,绝不打断游戏)。
 * 本身不写单测(仓库既定约定:播放行为不测),静音门控在其外层 MuteAwareSfxPlayer 承担。
 */
export class AudioSfxPlayer implements SfxPlayer, AmbientLoopPlayer {
  private pool = new Map<SfxId, HTMLAudioElement>()
  /** 环境声循环元素(单实例;与一次性 pool 分开,避免共享元素互相打断) */
  private ambient: HTMLAudioElement | null = null
  private ambientId: SfxId | null = null

  play(id: SfxId | null): void {
    if (!id) return
    let audio = this.pool.get(id)
    if (!audio) {
      audio = new Audio(`/sfx/${id}.ogg`)
      audio.volume = MASTER_VOLUME
      audio.preload = 'auto'
      this.pool.set(id, audio)
    }
    // 从头重放;异步启动,被浏览器策略拒绝(如无手势)时静默放弃
    audio.currentTime = 0
    void audio.play().catch(() => {})
  }

  setAmbient(id: SfxId | null, level: number): void {
    const next = id && level > 0 ? id : null
    if (!next) {
      if (this.ambient) {
        this.ambient.pause()
        this.ambient = null
        this.ambientId = null
      }
      return
    }
    let audio = this.ambient
    if (!audio || this.ambientId !== next) {
      audio?.pause()
      audio = new Audio(`/sfx/${next}.ogg`)
      audio.loop = true
      audio.preload = 'auto'
      this.ambient = audio
      this.ambientId = next
    }
    audio.volume = Math.max(0, Math.min(1, MASTER_VOLUME * level))
    // 循环中只调音量;被暂停过(如中途静音)才重新起播
    if (audio.paused) void audio.play().catch(() => {})
  }
}

/**
 * 静音门:组合根把它包在真实播放器外,静音判定用注入的谓词(读 MuteStore)。
 * 静音 → 不触底层(事件音不播;环境声显式停掉底层循环);
 * 非静音 → 原样透传(null 也透传,空操作语义归底层)。
 */
export class MuteAwareSfxPlayer implements SfxPlayer, AmbientLoopPlayer {
  constructor(
    private inner: SfxPlayer & AmbientLoopPlayer,
    private isMuted: () => boolean,
  ) {}

  play(id: SfxId | null): void {
    if (this.isMuted()) return
    this.inner.play(id)
  }

  setAmbient(id: SfxId | null, level: number): void {
    if (this.isMuted()) {
      this.inner.setAmbient(null, 0)
      return
    }
    this.inner.setAmbient(id, level)
  }
}
