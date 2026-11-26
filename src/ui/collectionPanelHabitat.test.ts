import { describe, expect, it } from 'vitest'
import { FISH } from '../core/fishCatalog'
import type { FishHabitat } from '../core/types'
import { habitatLabel } from './collectionPanelHabitat'

/**
 * 接缝:图鉴条目「出没条件」文案派生(纯函数,只吃亲和字段,期望值为独立字面量)。
 * spec(#13 用户故事 9):图鉴条目显示每条鱼的出没条件,玩家据此规划去哪钓;
 * 文案只泄「去哪钓」的知识,不泄配色(入参类型上就没有颜色)。
 */
describe('habitatLabel(接缝:图鉴出没条件文案)', () => {
  it('全维度无修饰(小白条:未声明 habitat)→ 任何时间 · 任何水域', () => {
    expect(habitatLabel(undefined)).toBe('任何时间 · 任何水域')
  })

  it('单水域硬门:只声明湖 →「湖」(水域必显)', () => {
    const habitat: FishHabitat = { areas: ['lake'] }
    expect(habitatLabel(habitat)).toBe('湖')
  })

  it('多水域硬门:池塘 + 湖(气球河豚)→「池塘/湖」,按池塘/河流/湖规范序排列', () => {
    const habitat: FishHabitat = { areas: ['lake', 'pond'] }
    expect(habitatLabel(habitat)).toBe('池塘/湖')
  })

  it('声明覆盖全部三水域 → 视为不限,归一为「任何水域」(不罗列)', () => {
    const habitat: FishHabitat = { areas: ['pond', 'river', 'lake'] }
    expect(habitatLabel(habitat)).toBe('任何时间 · 任何水域')
  })

  it('季节软修正:稳重鲫({夏0.8,秋1.4})只显增益季 →「任何水域 · 秋季加成」', () => {
    const habitat: FishHabitat = { seasonMul: { summer: 0.8, autumn: 1.4 } }
    expect(habitatLabel(habitat)).toBe('任何水域 · 秋季加成')
  })

  it('季节纯减益(无增益)→「夏季较少」(减益也是该维度的修饰,须提示)', () => {
    const habitat: FishHabitat = { areas: ['river'], seasonMul: { summer: 0.8 } }
    expect(habitatLabel(habitat)).toBe('河流 · 夏季较少')
  })

  it('季节多增益 → 单字季连写「春秋季加成」', () => {
    const habitat: FishHabitat = { seasonMul: { spring: 1.2, autumn: 1.3 } }
    expect(habitatLabel(habitat)).toBe('任何水域 · 春秋季加成')
  })

  it('季节硬门优先于软修正:仅春秋 + 秋季 1.3 → 只显「仅春秋」,不展开加成', () => {
    const habitat: FishHabitat = { seasons: ['autumn', 'spring'], seasonMul: { autumn: 1.3 } }
    expect(habitatLabel(habitat)).toBe('任何水域 · 仅春秋')
  })

  it('季节硬门按春夏秋冬规范序连写:冬+春 →「仅春冬」', () => {
    const habitat: FishHabitat = { seasons: ['winter', 'spring'] }
    expect(habitatLabel(habitat)).toBe('任何水域 · 仅春冬')
  })

  it('昼夜硬门:仅夜 →「仅夜间」(词汇对齐徽章「日」)', () => {
    const habitat: FishHabitat = { areas: ['river'], daylight: ['night'] }
    expect(habitatLabel(habitat)).toBe('河流 · 仅夜间')
  })

  it('昼夜软修正:铅坠鲶({夜1.6,日0.7})→「夜间加成」', () => {
    const habitat: FishHabitat = { daylightMul: { night: 1.6, day: 0.7 } }
    expect(habitatLabel(habitat)).toBe('任何水域 · 夜间加成')
  })

  it('昼夜硬门优先于软修正:仅夜 + 夜 1.6 → 只显「仅夜间」', () => {
    const habitat: FishHabitat = { daylight: ['night'], daylightMul: { night: 1.6 } }
    expect(habitatLabel(habitat)).toBe('任何水域 · 仅夜间')
  })

  it('昼夜声明覆盖两值 → 视为不限(无硬门);倍率全 1 → 无修正,不显示该维度', () => {
    const habitat: FishHabitat = { daylight: ['day', 'night'], daylightMul: { day: 1, night: 1 } }
    expect(habitatLabel(habitat)).toBe('任何时间 · 任何水域')
  })

  it('天气加成:晴天增益 →「晴天加成」;天气无硬门域,仅 weatherMul 有区分才显示', () => {
    const habitat: FishHabitat = { areas: ['lake'], weatherMul: { sunny: 1.2 } }
    expect(habitatLabel(habitat)).toBe('湖 · 晴天加成')
  })

  it('天气纯减益 →「雨天较少」', () => {
    const habitat: FishHabitat = { weatherMul: { rain: 0.7 } }
    expect(habitatLabel(habitat)).toBe('任何水域 · 雨天较少')
  })

  it('生产目录:5 条鱼的实际文案逐条锁定(期望值为独立字面量,非派生重算)', () => {
    expect(FISH.map(f => habitatLabel(f.habitat))).toEqual([
      '任何时间 · 任何水域', // 小白条:无 habitat,全维度无修饰
      '任何水域 · 秋季加成 · 日间加成 · 雨天加成', // 稳重鲫:areas 全覆盖归一,夏抑秋扬
      '池塘/河流 · 夏季加成 · 夜间加成 · 雨天加成', // 铅坠鲶:不进湖,夜钓雨钓更活跃
      '池塘/湖 · 夏季加成 · 日间加成 · 晴天加成', // 气球河豚:不进河流,晴天夏日
      '池塘/河流 · 春季加成 · 日间加成 · 晴天加成', // 闪电梭:不进湖,春日晴天
    ])
  })

  it('不泄名:任何鱼的文案都不含鱼名(未捕获行剪影契约的文案侧)', () => {
    for (const fish of FISH) {
      expect(habitatLabel(fish.habitat)).not.toContain(fish.name)
    }
  })

  it('纯函数:不改动传入的亲和字段(冻结对象调用不抛错、内容不变)', () => {
    const habitat: FishHabitat = Object.freeze({
      areas: Object.freeze(['pond', 'river']),
      seasonMul: Object.freeze({ winter: 0.8, summer: 1.2 }),
      daylightMul: Object.freeze({ night: 1.6, day: 0.7 }),
      weatherMul: Object.freeze({ rain: 1.3 }),
    })
    expect(habitatLabel(habitat)).toBe('池塘/河流 · 夏季加成 · 夜间加成 · 雨天加成')
    expect(habitat).toEqual({
      areas: ['pond', 'river'],
      seasonMul: { winter: 0.8, summer: 1.2 },
      daylightMul: { night: 1.6, day: 0.7 },
      weatherMul: { rain: 1.3 },
    })
  })
})
