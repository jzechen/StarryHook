import { describe, expect, it } from 'vitest'
import { BackpackStore } from './backpack'
import { FISH } from './fishCatalog'
import type { KvStorage } from './kvSnapshot'

const ids = FISH.map(f => f.id)

/** 内存 kv 替身(与 main.ts localStorage 适配器同接口;可取出原始串喂坏数据) */
function memoryKv(): KvStorage & { raw(key: string): string | null } {
  const map = new Map<string, string>()
  return {
    get: key => map.get(key) ?? null,
    set: (key, value) => {
      map.set(key, value)
    },
    raw: key => map.get(key) ?? null,
  }
}

describe('背包 store(接缝:BackpackStore,渔获按(鱼种 × 品质)堆叠,票 #39 spec §4.1–4.2)', () => {
  it('捕获入包:同(鱼种,品质)堆叠累加,不同品质分堆', () => {
    const bp = new BackpackStore(ids)
    bp.addFish('xiaobaitiao', 'normal')
    bp.addFish('xiaobaitiao', 'normal')
    bp.addFish('xiaobaitiao', 'silver')
    expect(bp.count('xiaobaitiao', 'normal')).toBe(2)
    expect(bp.count('xiaobaitiao', 'silver')).toBe(1)
    expect(bp.count('xiaobaitiao', 'gold')).toBe(0)
  })

  it('目录外鱼种忽略(与图鉴同款纪律),空包 entries 为空', () => {
    const bp = new BackpackStore(ids)
    bp.addFish('幽灵鱼', 'normal')
    expect(bp.count('幽灵鱼', 'normal')).toBe(0)
    expect(bp.entries()).toEqual([])
  })

  it('entries 堆叠列表按目录序 × 品质序,只含有货堆叠(不出现 0 条目)', () => {
    const bp = new BackpackStore(ids)
    bp.addFish('shandiansuo', 'gold')
    bp.addFish('xiaobaitiao', 'normal')
    bp.addFish('shandiansuo', 'normal')
    expect(bp.entries().map(e => `${e.fishId}:${e.quality}×${e.count}`)).toEqual([
      'xiaobaitiao:normal×1',
      'shandiansuo:normal×1',
      'shandiansuo:gold×1',
    ])
  })

  it('取出(售卖):取 n 条扣 n;余量不足取到空;空堆叠不留 0 条目', () => {
    const bp = new BackpackStore(ids)
    for (let i = 0; i < 3; i++) bp.addFish('wenzhongji', 'silver')
    expect(bp.take('wenzhongji', 'silver', 2)).toBe(2)
    expect(bp.count('wenzhongji', 'silver')).toBe(1)
    expect(bp.take('wenzhongji', 'silver', 5)).toBe(1)
    expect(bp.count('wenzhongji', 'silver')).toBe(0)
    expect(bp.entries()).toEqual([])
    expect(bp.take('wenzhongji', 'silver', 1)).toBe(0)
  })

  it('非法数量(0/负/非整数)取出 0 条,状态原样不动', () => {
    const bp = new BackpackStore(ids)
    bp.addFish('xiaobaitiao', 'normal')
    expect(bp.take('xiaobaitiao', 'normal', 0)).toBe(0)
    expect(bp.take('xiaobaitiao', 'normal', -1)).toBe(0)
    expect(bp.take('xiaobaitiao', 'normal', 1.5)).toBe(0)
    expect(bp.count('xiaobaitiao', 'normal')).toBe(1)
  })
})

describe('背包收藏品区(票 #40 spec §4.4:收藏品是背包第二分区,堆叠无上限)', () => {
  it('收藏品入包按 id 堆叠累加;未拥有恒 0', () => {
    const bp = new BackpackStore(ids, ['luozi', 'yuzhigou'])
    bp.addCollectible('luozi')
    bp.addCollectible('luozi', 2)
    bp.addCollectible('yuzhigou')
    expect(bp.countCollectible('luozi')).toBe(3)
    expect(bp.countCollectible('yuzhigou')).toBe(1)
    expect(bp.countCollectible('没有的')).toBe(0)
  })

  it('目录外收藏品忽略(与渔获/图鉴同款纪律)', () => {
    const bp = new BackpackStore(ids, ['luozi'])
    bp.addCollectible('幽灵收藏品')
    expect(bp.collectibleEntries()).toEqual([])
  })

  it('收藏品列表按目录序,只含有货堆叠', () => {
    const bp = new BackpackStore(ids, ['luozi', 'yuzhigou'])
    bp.addCollectible('yuzhigou')
    bp.addCollectible('luozi')
    expect(bp.collectibleEntries()).toEqual([
      { id: 'luozi', count: 1 },
      { id: 'yuzhigou', count: 1 },
    ])
  })

  it('收藏品取出:取 n 扣 n;余量不足取到空;空堆叠不留 0 条目;非法数量取 0', () => {
    const bp = new BackpackStore(ids, ['luozi'])
    bp.addCollectible('luozi', 3)
    expect(bp.takeCollectible('luozi', 2)).toBe(2)
    expect(bp.countCollectible('luozi')).toBe(1)
    expect(bp.takeCollectible('luozi', 5)).toBe(1)
    expect(bp.collectibleEntries()).toEqual([])
    expect(bp.takeCollectible('luozi', 1)).toBe(0)
    expect(bp.takeCollectible('luozi', 0)).toBe(0)
    expect(bp.takeCollectible('luozi', 1.5)).toBe(0)
  })

  it('收藏品与渔获互不串位:两分区各自堆叠、各自列表', () => {
    const bp = new BackpackStore(ids, ['luozi'])
    bp.addFish('xiaobaitiao', 'normal')
    bp.addCollectible('luozi')
    expect(bp.entries()).toEqual([{ fishId: 'xiaobaitiao', quality: 'normal', count: 1 }])
    expect(bp.collectibleEntries()).toEqual([{ id: 'luozi', count: 1 }])
  })
})

describe('背包 kv 持久化(票 #40 spec §4.6:readKvSnapshot 校验降级,损坏回默认)', () => {
  it('快照跨实例还原:渔获堆叠与收藏品原样回来', () => {
    const kv = memoryKv()
    const first = new BackpackStore(ids, ['luozi'], { storage: kv, key: 'starryhook:backpack' })
    first.addFish('wenzhongji', 'silver', 2)
    first.addFish('shandiansuo', 'gold')
    first.addCollectible('luozi', 2)

    const second = new BackpackStore(ids, ['luozi'], { storage: kv, key: 'starryhook:backpack' })
    expect(second.entries()).toEqual([
      { fishId: 'wenzhongji', quality: 'silver', count: 2 },
      { fishId: 'shandiansuo', quality: 'gold', count: 1 },
    ])
    expect(second.collectibleEntries()).toEqual([{ id: 'luozi', count: 2 }])
  })

  it('储物箱独立键:同 kv 下两口 store 互不串档', () => {
    const kv = memoryKv()
    const backpack = new BackpackStore(ids, [], { storage: kv, key: 'starryhook:backpack' })
    const box = new BackpackStore(ids, [], { storage: kv, key: 'starryhook:storage' })
    backpack.addFish('xiaobaitiao', 'normal')
    box.addFish('wenzhongji', 'gold')
    expect(backpack.entries()).toEqual([{ fishId: 'xiaobaitiao', quality: 'normal', count: 1 }])
    expect(box.entries()).toEqual([{ fishId: 'wenzhongji', quality: 'gold', count: 1 }])
  })

  it('损坏快照(JSON 坏)按无档处理,回默认空包且不抛', () => {
    const kv = memoryKv()
    kv.set('starryhook:backpack', '{这不是JSON')
    const bp = new BackpackStore(ids, ['luozi'], { storage: kv, key: 'starryhook:backpack' })
    expect(bp.entries()).toEqual([])
    expect(bp.collectibleEntries()).toEqual([])
  })

  it('损坏快照(结构坏)逐字段降级:目录外/坏品质/非法数量丢弃,合法条目保留', () => {
    const kv = memoryKv()
    kv.set(
      'starryhook:backpack',
      JSON.stringify({
        fish: [
          { fishId: 'xiaobaitiao', quality: 'normal', count: 2 }, // 合法
          { fishId: '幽灵鱼', quality: 'normal', count: 9 }, // 目录外鱼种
          { fishId: 'wenzhongji', quality: '钻石', count: 1 }, // 品质不在表内
          { fishId: 'shandiansuo', quality: 'gold', count: -3 }, // 负数
          { fishId: 'shandiansuo', quality: 'gold', count: 1.5 }, // 非整数
          { fishId: 'qianzhuinian', quality: 'silver' }, // 缺数量
        ],
        collectibles: [{ id: 'luozi', count: 1 }, { id: '幽灵收藏品', count: 4 }],
      }),
    )
    const bp = new BackpackStore(ids, ['luozi'], { storage: kv, key: 'starryhook:backpack' })
    expect(bp.entries()).toEqual([{ fishId: 'xiaobaitiao', quality: 'normal', count: 2 }])
    expect(bp.collectibleEntries()).toEqual([{ id: 'luozi', count: 1 }])
  })

  it('非数组 fish/collectibles 字段按空处理,不抛', () => {
    const kv = memoryKv()
    kv.set('starryhook:backpack', JSON.stringify({ fish: 'full', collectibles: 42 }))
    const bp = new BackpackStore(ids, ['luozi'], { storage: kv, key: 'starryhook:backpack' })
    expect(bp.entries()).toEqual([])
    expect(bp.collectibleEntries()).toEqual([])
  })

  it('每次变动即落盘:入包/取出/存取收藏品后 kv 同步', () => {
    const kv = memoryKv()
    const bp = new BackpackStore(ids, ['luozi'], { storage: kv, key: 'starryhook:backpack' })
    bp.addFish('xiaobaitiao', 'normal')
    const afterAdd = JSON.parse(kv.raw('starryhook:backpack')!)
    expect(afterAdd.fish).toEqual([{ fishId: 'xiaobaitiao', quality: 'normal', count: 1 }])
    bp.take('xiaobaitiao', 'normal', 1)
    bp.addCollectible('luozi')
    const afterTake = JSON.parse(kv.raw('starryhook:backpack')!)
    expect(afterTake.fish).toEqual([])
    expect(afterTake.collectibles).toEqual([{ id: 'luozi', count: 1 }])
  })

  it('未注入持久化 = 纯内存(票 #39 行为逐位不动)', () => {
    const bp = new BackpackStore(ids)
    bp.addFish('xiaobaitiao', 'normal')
    expect(bp.count('xiaobaitiao', 'normal')).toBe(1)
  })
})
