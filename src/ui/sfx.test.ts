import { describe, expect, it } from 'vitest'
import { MuteAwareSfxPlayer, type SfxPlayer } from './sfx'

/** 录制型测试替身:记录每次 play 调用,验证门控逻辑(不触真实音频) */
function recordingPlayer(): SfxPlayer & { calls: (string | null)[] } {
  const calls: (string | null)[] = []
  return {
    calls,
    play(id) {
      calls.push(id)
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
