import { describe, expect, it } from 'vitest'
import {
  BGM_BASE_LEVEL,
  BGM_CROSSFADE_SECONDS,
  BgmChannel,
  bgmCrossfadeLevels,
} from './bgm'
import { MuteAwareSfxPlayer } from './sfx'

/**
 * 接缝:交叉淡入淡出曲线(纯函数)。切轨后 elapsed 秒的双轨音量档:
 * 旧轨从满档线性降到 0,新轨从 0 线性升到满档(满档 = 低调铺底档
 * BGM_BASE_LEVEL,不是 1——BGM 是铺底层,不抢事件音/环境声)。
 * 期望值为独立字面量钉死曲线形状:任何漂移(改斜率/改满档)都会在此暴露。
 */
describe('bgmCrossfadeLevels(接缝:交叉淡入淡出曲线)', () => {
  it('起切沿:旧轨满档、新轨静默', () => {
    expect(bgmCrossfadeLevels(0)).toEqual({ outgoing: BGM_BASE_LEVEL, incoming: 0 })
  })

  it('半程:双轨各占满档一半(交叉中点)', () => {
    expect(bgmCrossfadeLevels(BGM_CROSSFADE_SECONDS / 2)).toEqual({
      outgoing: BGM_BASE_LEVEL / 2,
      incoming: BGM_BASE_LEVEL / 2,
    })
  })

  it('走满交叉时长:旧轨归零,新轨满档(稳态)', () => {
    expect(bgmCrossfadeLevels(BGM_CROSSFADE_SECONDS)).toEqual({
      outgoing: 0,
      incoming: BGM_BASE_LEVEL,
    })
    expect(bgmCrossfadeLevels(BGM_CROSSFADE_SECONDS * 3)).toEqual({
      outgoing: 0,
      incoming: BGM_BASE_LEVEL,
    })
  })

  it('单色性推进:两档此消彼长,不会同时超过满档', () => {
    for (let i = 0; i <= 20; i++) {
      const { outgoing, incoming } = bgmCrossfadeLevels((BGM_CROSSFADE_SECONDS * i) / 20)
      expect(outgoing).toBeGreaterThanOrEqual(0)
      expect(incoming).toBeGreaterThanOrEqual(0)
      expect(outgoing + incoming).toBeCloseTo(BGM_BASE_LEVEL, 10)
    }
  })

  it('负数/NaN 按起切沿兜底(与环境声音量函数同款纪律)', () => {
    expect(bgmCrossfadeLevels(-0.5)).toEqual({ outgoing: BGM_BASE_LEVEL, incoming: 0 })
    expect(bgmCrossfadeLevels(Number.NaN)).toEqual({ outgoing: BGM_BASE_LEVEL, incoming: 0 })
  })
})

/**
 * 接缝:BGM 通道状态机(组合根每帧驱动的表驱动状态):
 * setTarget 声明当前应响的轨(同 id 空操作),update(dt) 推进交叉淡入淡出
 * 并产出双轨供给(outgoing = 淡出中的旧轨,incoming = 当前轨)。
 * 供给的 id/level 直接透传给播放器 BgmPlayer.setBgm。
 */
describe('BgmChannel(接缝:切轨状态机)', () => {
  it('开机首设轨:只有新轨从静默爬升,无旧轨', () => {
    const bgm = new BgmChannel()
    bgm.setTarget('bgm-village')
    const mix = bgm.update(0.25)
    expect(mix.outgoing).toBeNull()
    expect(mix.incoming).toEqual({ id: 'bgm-village', level: BGM_BASE_LEVEL * 0.25 })
  })

  it('未设轨前 update 空供给(双 null,播放器按停语义消化)', () => {
    const bgm = new BgmChannel()
    expect(bgm.update(0.5)).toEqual({ outgoing: null, incoming: null })
  })

  it('稳态切轨:旧轨线性淡出、新轨线性淡入,交叉时长走满后只剩新轨', () => {
    const bgm = new BgmChannel()
    bgm.setTarget('bgm-village')
    bgm.update(2) // 稳态
    bgm.setTarget('bgm-river')
    const mid = bgm.update(BGM_CROSSFADE_SECONDS / 2)
    expect(mid.outgoing).toEqual({ id: 'bgm-village', level: BGM_BASE_LEVEL / 2 })
    expect(mid.incoming).toEqual({ id: 'bgm-river', level: BGM_BASE_LEVEL / 2 })
    // 交叉窗走满:旧轨不再供给(显式 null = 播放器停掉该轨,不放任 0 音量空转)
    let mix = { outgoing: null as unknown, incoming: null as unknown }
    for (let i = 0; i < 120; i++) mix = bgm.update(1 / 60)
    expect(mix.outgoing).toBeNull()
    expect(mix.incoming).toEqual({ id: 'bgm-river', level: BGM_BASE_LEVEL })
  })

  it('同 id 重复 setTarget 空操作:不重开交叉时间线', () => {
    const bgm = new BgmChannel()
    bgm.setTarget('bgm-village')
    bgm.update(0.5)
    bgm.setTarget('bgm-village')
    const mix = bgm.update(0.5)
    expect(mix.outgoing).toBeNull() // 没有发生切轨
    expect(mix.incoming).toEqual({ id: 'bgm-village', level: BGM_BASE_LEVEL }) // 时间线未被重置
  })

  it('交叉中途再切轨:更旧的轨被丢弃(硬停),当前轨转为淡出', () => {
    const bgm = new BgmChannel()
    bgm.setTarget('bgm-village')
    bgm.update(2)
    bgm.setTarget('bgm-river')
    bgm.update(0.4) // 河谷淡入到 40% 时再切
    bgm.setTarget('bgm-lake')
    const mix = bgm.update(0)
    expect(mix.outgoing).toEqual({ id: 'bgm-river', level: BGM_BASE_LEVEL }) // 河谷从头淡出
    expect(mix.incoming).toEqual({ id: 'bgm-lake', level: 0 })
    // 村舍不应再出现在任何供给里
    for (let i = 0; i < 120; i++) {
      const m = bgm.update(1 / 60)
      expect(m.outgoing?.id === 'bgm-village' || m.incoming?.id === 'bgm-village').toBe(false)
    }
  })

  it('切到 null(预留扩展位):旧轨完整淡出后归空', () => {
    const bgm = new BgmChannel()
    bgm.setTarget('bgm-village')
    bgm.update(2)
    bgm.setTarget(null)
    const mid = bgm.update(BGM_CROSSFADE_SECONDS / 2)
    expect(mid.outgoing).toEqual({ id: 'bgm-village', level: BGM_BASE_LEVEL / 2 })
    expect(mid.incoming).toBeNull()
    let mix = { outgoing: null as unknown, incoming: null as unknown }
    for (let i = 0; i < 120; i++) mix = bgm.update(1 / 60)
    expect(mix.outgoing).toBeNull()
    expect(mix.incoming).toBeNull()
  })
})

/**
 * 集成缝(组合根接线 = 本测试调用序):世界导演入图沿 onSceneEntered
 * → setTarget(bgmForScene(mapId)),每帧 update 后把双轨供给喂给
 * MuteAwareSfxPlayer.setBgm。验证三件事:进场景播对应轨、切换交叉淡入淡出
 * 约 1s、静音覆盖 BGM(静音 = 显式双停令,不放任空转)。
 */
describe('集成:入图沿切轨 → 交叉淡入淡出 → 静音门', () => {
  /** 录制型替身(与 sfx.test.ts 同款,补 setBgm 通道) */
  function recordingPlayer() {
    const bgmCalls: [unknown, unknown][] = []
    const player = {
      muted: false,
      bgmCalls,
      play: () => {},
      setAmbient: () => {},
      setBgm(outgoing: unknown, incoming: unknown) {
        bgmCalls.push([outgoing, incoming])
      },
    }
    return player
  }

  it('村舍 → 河谷:到达沿起交叉,约 1s 后只剩新轨;静音时收到停令', () => {
    const inner = recordingPlayer()
    const sfx = new MuteAwareSfxPlayer(inner as never, () => inner.muted)
    const bgm = new BgmChannel()
    const dt = 1 / 60
    const enterScene = (mapId: 'village' | 'river' | 'lake'): void => bgm.setTarget(mapId === 'village' ? 'bgm-village' : mapId === 'river' ? 'bgm-river' : 'bgm-lake')

    // 开机进村舍:到达沿 → 村舍轨爬升
    enterScene('village')
    let mix = bgm.update(dt)
    sfx.setBgm(mix.outgoing, mix.incoming)
    for (let i = 0; i < 120; i++) {
      mix = bgm.update(dt)
      sfx.setBgm(mix.outgoing, mix.incoming)
    }
    const steadyBefore = inner.bgmCalls.at(-1)
    expect(steadyBefore).toEqual([null, { id: 'bgm-village', level: BGM_BASE_LEVEL }])

    // 走到出口 → 过场淡入完成沿(到达):切河谷,双轨交叉约 1s
    enterScene('river')
    mix = bgm.update(dt)
    sfx.setBgm(mix.outgoing, mix.incoming)
    expect(mix.outgoing?.id).toBe('bgm-village')
    expect(mix.incoming?.id).toBe('bgm-river')
    for (let i = 0; i < 70; i++) {
      mix = bgm.update(dt)
      sfx.setBgm(mix.outgoing, mix.incoming)
    }
    expect(inner.bgmCalls.at(-1)).toEqual([null, { id: 'bgm-river', level: BGM_BASE_LEVEL }])

    // 静音:BGM 通道收到显式停令(双 null),覆盖交叉中与稳态两种情形
    inner.bgmCalls.length = 0
    inner.muted = true
    bgm.setTarget('bgm-lake')
    mix = bgm.update(dt)
    sfx.setBgm(mix.outgoing, mix.incoming)
    expect(inner.bgmCalls).toEqual([[null, null]])
  })
})
