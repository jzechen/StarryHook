import type { SfxId } from './sfxMapping'

/**
 * 播放接口(注入式系统边界):真实实现为浏览器 Audio(AudioSfxPlayer),
 * 测试用录制替身顶替。play(null) = 事件未配音效,空操作。
 */
export interface SfxPlayer {
  play(id: SfxId | null): void
}

/**
 * 真实实现:浏览器 Audio。按需懒创建并复用同名音频元素;
 * autoplay 拦截/解码失败等一律静默吞掉(音效是点缀,绝不打断游戏)。
 * 本身不写单测(仓库既定约定:播放行为不测),静音门控在其外层 MuteAwareSfxPlayer 承担。
 */
export class AudioSfxPlayer implements SfxPlayer {
  private pool = new Map<SfxId, HTMLAudioElement>()

  play(id: SfxId | null): void {
    if (!id) return
    let audio = this.pool.get(id)
    if (!audio) {
      audio = new Audio(`/sfx/${id}.ogg`)
      audio.volume = 0.6
      audio.preload = 'auto'
      this.pool.set(id, audio)
    }
    // 从头重放;异步启动,被浏览器策略拒绝(如无手势)时静默放弃
    audio.currentTime = 0
    void audio.play().catch(() => {})
  }
}

/**
 * 静音门:组合根把它包在真实播放器外,静音判定用注入的谓词(读 MuteStore)。
 * 静音 → 不触底层;非静音 → 原样透传(null 也透传,空操作语义归底层)。
 */
export class MuteAwareSfxPlayer implements SfxPlayer {
  constructor(
    private inner: SfxPlayer,
    private isMuted: () => boolean,
  ) {}

  play(id: SfxId | null): void {
    if (this.isMuted()) return
    this.inner.play(id)
  }
}
