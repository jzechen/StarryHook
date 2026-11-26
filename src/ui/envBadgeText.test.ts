import { describe, expect, it } from 'vitest'
import type { EnvState } from '../core/types'
import { envBadgeText } from './envBadgeText'

/** 穷举 4 季 × 2 昼夜 × 2 天气的徽章文案(标签映射无遗漏、格式统一) */
function envOf(season: EnvState['season'], daylight: EnvState['daylight'], weather: EnvState['weather']): EnvState {
  return { area: 'pond', season, daylight, weather }
}

describe('环境徽章文案(接缝:纯函数,票 #15)', () => {
  it('票面样例:春 · 日 · 晴(水域不进徽章,换水域面板可见)', () => {
    expect(envBadgeText(envOf('spring', 'day', 'sunny'))).toBe('春 · 日 · 晴')
  })

  it('穷举 16 组环境:季节/昼夜/天气标签逐维正确,以「 · 」相连', () => {
    const seasonOf = ['spring', 'summer', 'autumn', 'winter'] as const
    const expectedSeason = ['春', '夏', '秋', '冬']
    const daylightOf = ['day', 'night'] as const
    const expectedDaylight = ['日', '夜']
    const weatherOf = ['sunny', 'rain'] as const
    const expectedWeather = ['晴', '雨']
    for (let s = 0; s < 4; s++) {
      for (let d = 0; d < 2; d++) {
        for (let w = 0; w < 2; w++) {
          const text = envBadgeText(envOf(seasonOf[s]!, daylightOf[d]!, weatherOf[w]!))
          expect(text, `${seasonOf[s]}/${daylightOf[d]}/${weatherOf[w]}`).toBe(
            `${expectedSeason[s]} · ${expectedDaylight[d]} · ${expectedWeather[w]}`,
          )
        }
      }
    }
  })
})
