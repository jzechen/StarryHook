import { describe, expect, it } from 'vitest'
import { MuteAwareSfxPlayer, type AmbientLoopPlayer, type BgmPlayer, type BgmTrack, type SfxPlayer } from './sfx'

/** 录制型测试替身:记录每次 play / setAmbient / setBgm 调用,验证门控逻辑(不触真实音频) */
function recordingPlayer(): SfxPlayer & AmbientLoopPlayer & BgmPlayer & {
  calls: (string | null)[]
  ambientCalls: [string | null, number][]
  bgmCalls: [BgmTrack | null, BgmTrack | null][]
} {
  const calls: (string | null)[] = []
  const ambientCalls: [string | null, number][] = []
  const bgmCalls: [BgmTrack | null, BgmTrack | null][] = []
  return {
    calls,
    ambientCalls,
    bgmCalls,
    play(id) {
      calls.push(id)
    },
    setAmbient(id, level) {
      ambientCalls.push([id, level])
    },
    setBgm(outgoing, incoming) {
      bgmCalls.push([outgoing, incoming])
    },
  }
}

/**
 * 接缝:静音门(播放器包装)。静音时对底层播放器空操作;
 * 底层播放器可整体替换(注入式),真实实现为浏览器 Audio。
 */
describe('MuteAwareSfxPlayer(接缝:静音门)', () => {
  it('非静音:调用透传给底层播放器', () => {
    const inner = recordingPlayer()
    const player = new MuteAwareSfxPlayer(inner, () => false)
    player.play('bite')
    expect(inner.calls).toEqual(['bite'])
  })

  it('静音:空操作,底层播放器不被触发', () => {
    const inner = recordingPlayer()
    const player = new MuteAwareSfxPlayer(inner, () => true)
    player.play('bite')
    player.play(null)
    expect(inner.calls).toEqual([])
  })

  it('null(未配音效事件)在非静音时透传,由底层播放器空操作', () => {
    const inner = recordingPlayer()
    const player = new MuteAwareSfxPlayer(inner, () => false)
    player.play(null)
    expect(inner.calls).toEqual([null])
  })
})

/**
 * 接缝:环境声循环的静音门(票 #44)。环境声是常驻循环,静音必须显式停掉
 * 底层循环(而不是放任其以音量 0 空转);非静音时音量档原样透传,
 * 淡入淡出的数值语义归纯函数 ambientWaterLevel,门只管通断。
 */
describe('MuteAwareSfxPlayer.setAmbient(接缝:环境声静音门)', () => {
  it('非静音:id 与音量档原样透传给底层播放器', () => {
    const inner = recordingPlayer()
    const player = new MuteAwareSfxPlayer(inner, () => false)
    player.setAmbient('ambient-water', 0.5)
    expect(inner.ambientCalls).toEqual([['ambient-water', 0.5]])
  })

  it('静音:显式停掉底层循环(setAmbient(null, 0)),不放任空转', () => {
    const inner = recordingPlayer()
    const player = new MuteAwareSfxPlayer(inner, () => true)
    player.setAmbient('ambient-water', 0.8)
    expect(inner.ambientCalls).toEqual([[null, 0]])
  })

  it('静音中多次推进(距离变化)同样只收到停令', () => {
    const inner = recordingPlayer()
    const player = new MuteAwareSfxPlayer(inner, () => true)
    player.setAmbient('ambient-water', 0.8)
    player.setAmbient('ambient-water', 0.4)
    player.setAmbient(null, 0)
    expect(inner.ambientCalls).toEqual([
      [null, 0],
      [null, 0],
      [null, 0],
    ])
  })
})

/**
 * 接缝:BGM 通道的静音门(票 #54)。BGM 是常驻循环(且切轨时双轨并存),
 * 静音必须对整条通道显式停(outgoing 与 incoming 一并置空)——
 * 与环境声通道同一纪律:停,而不是放任音量 0 空转;非静音时供给原样透传,
 * 交叉淡入淡出的数值语义归纯函数/通道(bgm.ts),门只管通断。
 */
describe('MuteAwareSfxPlayer.setBgm(接缝:BGM 静音门)', () => {
  it('非静音:双轨供给原样透传给底层播放器', () => {
    const inner = recordingPlayer()
    const player = new MuteAwareSfxPlayer(inner, () => false)
    const outgoing = { id: 'bgm-village', level: 0.5 }
    const incoming = { id: 'bgm-river', level: 0.25 }
    player.setBgm(outgoing, incoming)
    expect(inner.bgmCalls).toEqual([[outgoing, incoming]])
  })

  it('静音:整条通道显式停(双 null),不放任任一轨空转', () => {
    const inner = recordingPlayer()
    const player = new MuteAwareSfxPlayer(inner, () => true)
    player.setBgm({ id: 'bgm-village', level: 0.5 }, { id: 'bgm-river', level: 0.25 })
    player.setBgm(null, { id: 'bgm-river', level: 0.6 })
    expect(inner.bgmCalls).toEqual([
      [null, null],
      [null, null],
    ])
  })
})
