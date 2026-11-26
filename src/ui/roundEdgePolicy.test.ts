import { describe, expect, it } from 'vitest'
import { roundJustEnded } from './roundEdgePolicy'

describe('限时局毕边沿(接缝:纯函数,票 #24 review 去重)', () => {
  it('上一帧局进行中、本帧已结束且模式仍限时 = 归零强制结算完成(唯一真值)', () => {
    expect(roundJustEnded(true, { roundActive: false, mode: 'timed' })).toBe(true)
  })

  it('本帧仍进行中:不算局毕(局尚未结束)', () => {
    expect(roundJustEnded(true, { roundActive: true, mode: 'timed' })).toBe(false)
  })

  it('上一帧本就没在局中:不算局毕(开局边沿 false→true 亦然)', () => {
    expect(roundJustEnded(false, { roundActive: false, mode: 'timed' })).toBe(false)
    expect(roundJustEnded(false, { roundActive: true, mode: 'timed' })).toBe(false)
  })

  it('切回无限导致置否:不算局毕(模式已变,那是玩家主动放弃,main/modePanel 两处同此口径)', () => {
    expect(roundJustEnded(true, { roundActive: false, mode: 'casual' })).toBe(false)
  })

  it('无限模式恒否(无「局」概念,双保险语义)', () => {
    expect(roundJustEnded(true, { roundActive: true, mode: 'casual' })).toBe(false)
    expect(roundJustEnded(false, { roundActive: false, mode: 'casual' })).toBe(false)
  })
})
