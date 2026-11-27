import { describe, expect, it } from 'vitest'
import { SHIMMER_PERIOD, SHIMMER_THRESHOLD, shimmerActive, shimmerBand } from './progressShimmer'

/**
 * 进度流光(接缝:shimmerActive/shimmerBand 纯函数,票 #43,spec §5.2)。
 *
 * 紧张感信号,非常驻装饰:绿条小游戏进度 ≥70% 才启动,回落即停。
 * 流光 = 沿进度条已填充段循环上行的亮带(纯几何,由渲染层画进
 * mgProgress 的既有重画路径,不新增每帧 Graphics)。
 */

describe('流光启停(接缝:shimmerActive 纯函数)', () => {
  it('进度 ≥70% 启动,回落(哪怕一点点)即停', () => {
    expect(shimmerActive(0.7)).toBe(true)
    expect(shimmerActive(0.85)).toBe(true)
    expect(shimmerActive(1)).toBe(true)
    expect(shimmerActive(0.6999)).toBe(false)
    expect(shimmerActive(0.35)).toBe(false)
  })

  it('阈值即常量单源(渲染层不再各写一份 0.7)', () => {
    expect(SHIMMER_THRESHOLD).toBe(0.7)
  })
})

describe('流光带(接缝:shimmerBand 纯函数)', () => {
  it('带宽占轨道比例有界且明显小于已填段(不遮挡玩法信息)', () => {
    const band = shimmerBand(0)
    expect(band.height).toBeGreaterThan(0)
    expect(band.height).toBeLessThanOrEqual(0.2)
  })

  it('位置随时间循环上行:同周期内递增,跨周期回到起点(0..1 循环)', () => {
    const a = shimmerBand(0).pos
    const b = shimmerBand(SHIMMER_PERIOD / 4).pos
    const c = shimmerBand(SHIMMER_PERIOD / 2).pos
    expect(b).toBeGreaterThan(a)
    expect(c).toBeGreaterThan(b)
    expect(shimmerBand(SHIMMER_PERIOD).pos).toBe(a)
  })

  it('同刻采样逐位一致(确定性)', () => {
    expect(shimmerBand(0.13)).toEqual(shimmerBand(0.13))
  })
})
