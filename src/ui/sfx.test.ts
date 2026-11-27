import { describe, expect, it } from 'vitest'
import { MuteAwareSfxPlayer, type AmbientLoopPlayer, type SfxPlayer } from './sfx'

/** 录制型测试替身:记录每次 play / setAmbient 调用,验证门控逻辑(不触真实音频) */
function recordingPlayer(): SfxPlayer & AmbientLoopPlayer & { calls: (string | null)[]; ambientCalls: [string | null, number][] } {
  const calls: (string | null)[] = []
  const ambientCalls: [string | null, number][] = []
  return {
    calls,
    ambientCalls,
    play(id) {
      calls.push(id)
    },
    setAmbient(id, level) {
      ambientCalls.push([id, level])
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
