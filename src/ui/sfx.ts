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

/** BGM 单轨供给(票 #54):轨文件标识 + 当帧音量档(0..1) */
export interface BgmTrack {
  id: SfxId
  level: number
}

/**
 * BGM 通道接口(票 #54,注入式系统边界):常驻双轨循环 + 交叉淡入淡出。
 * 供给由组合根的 BgmChannel(src/ui/bgm.ts)每帧产出,原样透传:
 * - incoming = 当前应响的轨;outgoing = 交叉淡出中的旧轨(null = 无);
 * - 任一轨 id = null 或 level ≤ 0 → 该轨显式停(与环境声通道同一纪律,
 *   不放任音量 0 空转);同 id 重复调用只调音量,不重启循环。
 */
export interface BgmPlayer {
  setBgm(outgoing: BgmTrack | null, incoming: BgmTrack | null): void
}

/** 播放器主音量(事件音与环境声共用一档兜底;响度档见 public/sfx/README.md) */
const MASTER_VOLUME = 0.6

/** 播放器内单条常驻循环(元素 + 当前 id) */
interface LoopSlot {
  audio: HTMLAudioElement | null
  id: SfxId | null
}

/** 槽内换装:id 变了 → 停旧起新;同 id → 只校音量;供给为空/0 音量 → 显式停 */
function setLoopSlot(slot: LoopSlot, id: SfxId | null, level: number): void {
  const next = id && level > 0 ? id : null
  if (!next) {
    slot.audio?.pause()
    slot.audio = null
    slot.id = null
    return
  }
  if (!slot.audio || slot.id !== next) {
    slot.audio?.pause()
    slot.audio = new Audio(`/sfx/${next}.ogg`)
    slot.audio.loop = true
    slot.audio.preload = 'auto'
    slot.id = next
  }
  slot.audio.volume = Math.max(0, Math.min(1, MASTER_VOLUME * level))
  // 循环中只调音量;被暂停过(如中途静音)才重新起播
  if (slot.audio.paused) void slot.audio.play().catch(() => {})
}

/**
 * 真实实现:浏览器 Audio。按需懒创建并复用同名音频元素;
 * autoplay 拦截/解码失败等一律静默吞掉(音效是点缀,绝不打断游戏)。
 * 本身不写单测(仓库既定约定:播放行为不测),静音门控在其外层 MuteAwareSfxPlayer 承担。
 */
export class AudioSfxPlayer implements SfxPlayer, AmbientLoopPlayer, BgmPlayer {
  private pool = new Map<SfxId, HTMLAudioElement>()
  /** 环境声循环(单实例;与一次性 pool 分开,避免共享元素互相打断) */
  private readonly ambientSlot: LoopSlot = { audio: null, id: null }
  /** BGM 双轨(票 #54):当前轨 + 交叉淡出中的旧轨,各自独立循环元素 */
  private readonly bgmSlot: LoopSlot = { audio: null, id: null }
  private readonly bgmFadeSlot: LoopSlot = { audio: null, id: null }

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
    setLoopSlot(this.ambientSlot, id, level)
  }

  setBgm(outgoing: BgmTrack | null, incoming: BgmTrack | null): void {
    // 双轨同 id 不可能由通道产出(防御:避免两个元素抢同一轨)
    const fade = outgoing && outgoing.id !== incoming?.id ? outgoing : null
    setLoopSlot(this.bgmFadeSlot, fade?.id ?? null, fade?.level ?? 0)
    setLoopSlot(this.bgmSlot, incoming?.id ?? null, incoming?.level ?? 0)
  }
}

/**
 * 静音门:组合根把它包在真实播放器外,静音判定用注入的谓词(读 MuteStore)。
 * 静音 → 不触底层(事件音不播;两条常驻通道都显式停掉底层循环);
 * 非静音 → 原样透传(null 也透传,空操作语义归底层)。
 */
export class MuteAwareSfxPlayer implements SfxPlayer, AmbientLoopPlayer, BgmPlayer {
  constructor(
    private inner: SfxPlayer & AmbientLoopPlayer & BgmPlayer,
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

  setBgm(outgoing: BgmTrack | null, incoming: BgmTrack | null): void {
    if (this.isMuted()) {
      this.inner.setBgm(null, null)
      return
    }
    this.inner.setBgm(outgoing, incoming)
  }
}
