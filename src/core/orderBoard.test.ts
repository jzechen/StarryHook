import { describe, expect, it } from 'vitest'
import { FISH } from './fishCatalog'
import { Rng } from './rng'
import { memoryStorage } from '../testing/memoryStorage'
import {
  deliveryPlan,
  ORDERS_KEY,
  ORDER_TEMPLATES,
  orderReward,
  OrderBoardStore,
  sessionOrderRng,
  type OrderDef,
} from './orderBoard'

/**
 * 订单(票 #55,spec 内容扩充「公告板与订单」):公告板发布的渔获征集。
 * 本组钉纯函数面——交付校验(数量与品质门槛判定 + 扣包计划)与酬金公式,
 * 以及订单池模板表的表纪律。期望值为独立字面量(布局/公式决策),
 * 不从实现推导(沿 worldMap.test.ts 先例)。
 */

describe('交付校验(接缝:deliveryPlan,票 #55)', () => {
  it('普通门槛:普通品质堆叠即达标,计划从普通堆整堆取', () => {
    const plan = deliveryPlan(
      { fishId: 'xiaobaitiao', minQuality: 'normal', count: 3 },
      { normal: 3, silver: 0, gold: 0 },
    )
    expect(plan).toEqual({ ok: true, takes: [{ quality: 'normal', count: 3 }] })
  })

  it('普通门槛贪心从低品质取:普通够数时不吃银星堆', () => {
    const plan = deliveryPlan(
      { fishId: 'wenzhongji', minQuality: 'normal', count: 2 },
      { normal: 5, silver: 4, gold: 0 },
    )
    expect(plan).toEqual({ ok: true, takes: [{ quality: 'normal', count: 2 }] })
  })

  it('银星门槛:普通堆不计入,银星 + 金星都算达标(「以上」语义)', () => {
    const plan = deliveryPlan(
      { fishId: 'xiaobaitiao', minQuality: 'silver', count: 3 },
      { normal: 9, silver: 1, gold: 2 },
    )
    expect(plan).toEqual({
      ok: true,
      takes: [
        { quality: 'silver', count: 1 },
        { quality: 'gold', count: 2 },
      ],
    })
  })

  it('金星门槛:只有金星计入(门槛常量支持三档,池表本票只用前两档)', () => {
    const plan = deliveryPlan(
      { fishId: 'shandiansuo', minQuality: 'gold', count: 2 },
      { normal: 5, silver: 5, gold: 2 },
    )
    expect(plan).toEqual({ ok: true, takes: [{ quality: 'gold', count: 2 }] })
  })

  it('缺鱼:该鱼种全品质总数不足 → missing(与品质不足分列)', () => {
    const plan = deliveryPlan(
      { fishId: 'qiqiuHetun', minQuality: 'silver', count: 4 },
      { normal: 1, silver: 1, gold: 0 },
    )
    expect(plan).toEqual({ ok: false, reason: 'missing' })
  })

  it('品质不足:总数够但达标堆不够(普通堆再多也不补)', () => {
    const plan = deliveryPlan(
      { fishId: 'wenzhongji', minQuality: 'silver', count: 3 },
      { normal: 10, silver: 2, gold: 0 },
    )
    expect(plan).toEqual({ ok: false, reason: 'quality' })
  })

  it('金星门槛:银星满仓 = 品质不足(有鱼,星不够——不是缺鱼)', () => {
    const plan = deliveryPlan(
      { fishId: 'qianzhuinian', minQuality: 'gold', count: 2 },
      { normal: 0, silver: 9, gold: 0 },
    )
    expect(plan).toEqual({ ok: false, reason: 'quality' })
  })

  it('金星门槛缺货:该鱼种总数都不足 2 条 = missing', () => {
    const plan = deliveryPlan(
      { fishId: 'qianzhuinian', minQuality: 'gold', count: 2 },
      { normal: 1, silver: 0, gold: 0 },
    )
    expect(plan).toEqual({ ok: false, reason: 'missing' })
  })

  it('空包:任何订单都缺鱼', () => {
    const plan = deliveryPlan(
      { fishId: 'xiaobaitiao', minQuality: 'normal', count: 2 },
      { normal: 0, silver: 0, gold: 0 },
    )
    expect(plan).toEqual({ ok: false, reason: 'missing' })
  })
})

describe('酬金公式(接缝:orderReward,票 #55:分值 × 数量 × 1.5)', () => {
  it('小白条 ×3 = 10 × 3 × 1.5 = 45 金币', () => {
    expect(orderReward(10, 3)).toBe(45)
  })

  it('稳重鲫 ×2 = 15 × 2 × 1.5 = 45 金币', () => {
    expect(orderReward(15, 2)).toBe(45)
  })

  it('半金币四舍五入:25 × 3 × 1.5 = 112.5 → 113 金币', () => {
    expect(orderReward(25, 3)).toBe(113)
  })

  it('酬金与品质无关(品质只影响卖价;订单按条收,不按星溢价)', () => {
    expect(orderReward(10, 4)).toBe(60)
  })
})

describe('订单池(接缝:ORDER_TEMPLATES,票 #55 + #53 收口:8~10 模板表驱动轮转)', () => {
  it('池表 8~10 条(review 收口:补 #53 新鱼行后合并旧行的总量口径)', () => {
    expect(ORDER_TEMPLATES.length).toBeGreaterThanOrEqual(8)
    expect(ORDER_TEMPLATES.length).toBeLessThanOrEqual(10)
  })

  it('每条模板:鱼种在目录内、品质门槛三档之一、数量 2~5(票面口径)', () => {
    for (const t of ORDER_TEMPLATES) {
      expect(FISH.some(f => f.id === t.fishId), `鱼种 ${t.fishId} 在目录`).toBe(true)
      expect(['normal', 'silver', 'gold']).toContain(t.minQuality)
      expect(t.count).toBeGreaterThanOrEqual(2)
      expect(t.count).toBeLessThanOrEqual(5)
      expect(Number.isInteger(t.count)).toBe(true)
    }
  })

  it('模板互不重复(鱼种 × 门槛 × 数量 三元组唯一,轮转不空转)', () => {
    const keys = ORDER_TEMPLATES.map(t => `${t.fishId}|${t.minQuality}|${t.count}`)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('池表覆盖既有 5 鱼种 + #53 新鱼代表行(三水域 × 条件门:雨/冬/夜各有窗口)', () => {
    // 字面量钉池表覆盖面(不随鱼目录自动扩):既有 5 种是票 #55 验收红线;
    // #53 的 13 条新鱼按「三水域 + 新条件门」补代表行——雨鱼(泥趣鳅)、
    // 冬鱼(铁甲鲮)、夜鱼(月影鳗)、湖畔日鱼(金鳞鲤);双硬门鱼
    // (雾影鲈 = 雨夜、霜枪狗鱼 = 冬夜)不上板(白天晴天不可交付窗口过长)。
    for (const fishId of [
      'xiaobaitiao',
      'wenzhongji',
      'qianzhuinian',
      'qiqiuHetun',
      'shandiansuo',
      'niquQiu',
      'tiejiaLing',
      'yueyingMan',
      'jinlinLi',
    ]) {
      expect(ORDER_TEMPLATES.some(t => t.fishId === fishId), `鱼种 ${fishId} 有委托`).toBe(true)
    }
  })
})

describe('公告板 store(接缝:OrderBoardStore,票 #55:队列制同时仅一单 + kv)', () => {
  it('ORDERS_KEY 钉死持久化键字面量(跨会话存档契约:改键即弃档,消费者统一引用此常量)', () => {
    expect(ORDERS_KEY).toBe('starryhook:orders')
  })

  it('构造起恒有一单:无档也立即出首单,且订单在池表内', () => {
    const board = new OrderBoardStore(new Rng(1))
    const order = board.current()
    expect(ORDER_TEMPLATES).toContainEqual(order)
  })

  it('同种子 → 同订单序列(?seed 可复现);与品质旁路同构,不消费主序列', () => {
    const a = new OrderBoardStore(sessionOrderRng(2026)).current()
    const b = new OrderBoardStore(sessionOrderRng(2026)).current()
    const c = new OrderBoardStore(sessionOrderRng(2027)).current()
    expect(b).toEqual(a)
    expect(c).not.toEqual(a) // 不同种子首单可不同(派生盐分路;行为钉住即可)
  })

  it('complete() 轮转出新单:必在池表内且不与刚交付的模板相同', () => {
    const board = new OrderBoardStore(new Rng(7))
    const first = board.current()
    for (let i = 0; i < 12; i++) {
      const next = board.complete()
      expect(ORDER_TEMPLATES).toContainEqual(next)
      expect(next).not.toEqual(first)
    }
  })

  it('kv 持久化:交付轮转后跨实例保留(同 storage 重开公告板即同单)', () => {
    const storage = memoryStorage()
    const board = new OrderBoardStore(sessionOrderRng(7), { storage, key: ORDERS_KEY })
    const before = board.current()
    const after = board.complete()
    expect(after).not.toEqual(before)
    const reopened = new OrderBoardStore(sessionOrderRng(7), { storage, key: ORDERS_KEY })
    expect(reopened.current()).toEqual(after)
  })

  it('快照损坏 → 降级安全:重出首单(既有降级模式),不抛错', () => {
    const storage = memoryStorage()
    storage.set(ORDERS_KEY, '{not-json')
    const board = new OrderBoardStore(new Rng(3), { storage, key: ORDERS_KEY })
    expect(ORDER_TEMPLATES).toContainEqual(board.current())
  })

  it('快照逐字段降级:目录外鱼种 / 表外门槛 / 数量越界 → 整单丢弃,重出首单', () => {
    for (const bad of [
      { current: { fishId: 'meiguiyu', minQuality: 'normal', count: 3 } },
      { current: { fishId: 'xiaobaitiao', minQuality: 'diamond', count: 3 } },
      { current: { fishId: 'xiaobaitiao', minQuality: 'normal', count: 99 } },
      { current: 42 },
      {},
    ]) {
      const storage = memoryStorage()
      storage.set(ORDERS_KEY, JSON.stringify(bad))
      const board = new OrderBoardStore(new Rng(3), { storage, key: ORDERS_KEY })
      expect(ORDER_TEMPLATES).toContainEqual(board.current())
    }
  })

  it('快照合法订单原样恢复(不重抽):跨会话同一单', () => {
    const storage = memoryStorage()
    const saved: OrderDef = { fishId: 'wenzhongji', minQuality: 'silver', count: 2 }
    storage.set(ORDERS_KEY, JSON.stringify({ current: saved }))
    const board = new OrderBoardStore(sessionOrderRng(11), { storage, key: ORDERS_KEY })
    expect(board.current()).toEqual(saved)
  })

  it('未注入持久化 = 纯内存(不落盘不抛错),行为与注入档一致', () => {
    const board = new OrderBoardStore(new Rng(5))
    const before = board.current()
    expect(board.complete()).not.toEqual(before)
  })
})
