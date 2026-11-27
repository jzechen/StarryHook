import { describe, expect, it } from 'vitest'
import { WORLD_MAPS } from './maps'
import { parseWorldMap } from './worldMap'
import { warpHintAt, WARP_HINT_REACH_PX } from './warpHint'

/** 合成最小图(60×26 = 960×416,与三图同尺寸;走廊几何独立于地形)与出口物件 */
function syntheticMap(objects: unknown[]): Record<string, unknown> {
  const water = new Array(60 * 26).fill(0)
  water[13 * 60 + 30] = 1
  return {
    width: 60,
    height: 26,
    tilewidth: 16,
    tileheight: 16,
    orientation: 'orthogonal',
    renderorder: 'right-down',
    type: 'map',
    layers: [
      { type: 'tilelayer', name: 'ground', data: new Array(60 * 26).fill(1) },
      { type: 'tilelayer', name: 'water', data: water },
      { type: 'tilelayer', name: 'deco', data: new Array(60 * 26).fill(0) },
      { type: 'objectgroup', name: 'objects', objects },
    ],
    tilesets: [
      {
        name: 'tiny-town',
        image: 'tiny-town.png',
        imagewidth: 192,
        imageheight: 176,
        tilewidth: 16,
        tileheight: 16,
        columns: 12,
        tilecount: 132,
        firstgid: 1,
      },
    ],
  }
}

function warpObject(overrides: Record<string, unknown> = {}, props: Record<string, unknown>[] = []): Record<string, unknown> {
  return {
    point: true,
    name: '东 · 河谷',
    type: 'warp',
    x: 912,
    y: 208,
    properties: props.length > 0 ? props : [
      { name: 'target', type: 'string', value: 'river' },
      { name: 'tx', type: 'float', value: 88 },
      { name: 'ty', type: 'float', value: 208 },
      { name: 'w', type: 'int', value: 32 },
      { name: 'h', type: 'int', value: 32 },
    ],
    ...overrides,
  }
}

/**
 * 出口接近浮签(票 #46,spec 术语「出口」:场景边缘有视觉开口与路径指引):
 * 走近出口区域出现被动浮签「东 · 河谷 →」——**无键帽、非交互点**(不新增
 * InteractionKind、不进动作键意图裁决,与交互浮签链并行供给)。本模块只负责
 * 「数据 → 文案与锚点」:方向与箭头由触发区**最近图边**推导(左/右 = 西/东,
 * 上/下 = 北/南;与 exitCorridorOf 同款最小值序),场景名取 SCENE_NAMES,
 * 接近判定 = 脚部点到触发区矩形的欧氏距离(与交互点半径同款)。
 */

describe('warpHintAt(接缝:地图 + 脚部点 → 被动浮签 | null)', () => {
  it('村舍东出口:「东 · 河谷 →」,锚点向图内让位一格半(防箭头被画面边缘裁切)', () => {
    const hint = warpHintAt(WORLD_MAPS.village, 880, 208)
    expect(hint).not.toBeNull()
    expect(hint!.label).toBe('东 · 河谷 →')
    expect(hint!.x).toBe(912 - 24)
    expect(hint!.y).toBe(208)
  })

  it('河谷双出口与湖畔西出口:方向 · 场景名 · 箭头(西 ← / 东 →)', () => {
    expect(warpHintAt(WORLD_MAPS.river, 48, 208)!.label).toBe('西 · 村舍池塘 ←')
    expect(warpHintAt(WORLD_MAPS.river, 912, 208)!.label).toBe('东 · 湖畔 →')
    expect(warpHintAt(WORLD_MAPS.lake, 48, 208)!.label).toBe('西 · 河谷 ←')
  })

  it('北边出口(合成图,三张实图无北出口):「北 · 河谷 ↑」,锚点沿纵轴向图内让位', () => {
    // 北缘出口物件 (480,48) → 触发区 [464,496)×[32,64),toTop = 32 = 最近边
    const map = parseWorldMap(syntheticMap([
      { name: '出生点', type: 'spawn', x: 72, y: 72, point: true },
      warpObject({ name: '北 · 河谷', x: 480, y: 48 }),
    ]))
    const hint = warpHintAt(map, 480, 96)
    expect(hint).not.toBeNull()
    expect(hint!.label).toBe('北 · 河谷 ↑')
    expect(hint!.x).toBe(480)
    expect(hint!.y).toBe(48 + 24)
  })

  it('接近判定:距触发区恰 3 tile(48px)仍出签,再远即隐', () => {
    expect(WARP_HINT_REACH_PX).toBe(48)
    expect(warpHintAt(WORLD_MAPS.village, 896 - WARP_HINT_REACH_PX, 208)).not.toBeNull()
    expect(warpHintAt(WORLD_MAPS.village, 896 - WARP_HINT_REACH_PX - 1, 208)).toBeNull()
    expect(warpHintAt(WORLD_MAPS.village, 912, 224 + WARP_HINT_REACH_PX)).not.toBeNull()
    expect(warpHintAt(WORLD_MAPS.village, 912, 224 + WARP_HINT_REACH_PX + 1)).toBeNull()
  })

  it('对角 48.08px 不出签(欧氏距离,非切比雪夫/曼哈顿)', () => {
    // 距触发区角点 (896,224) 欧氏 √(34² + 34²) ≈ 48.08 > 48
    expect(warpHintAt(WORLD_MAPS.village, 896 - 34, 224 + 34)).toBeNull()
  })

  it('双出口接近圈重叠时取更近的一条(最近距离纪律,与交互点「重叠取最近」同款)', () => {
    // 合成图:东缘两条相邻出口(区行段 [144,176) 与 [224,256)),接近圈重叠;
    // 点 (884,180) 距北 12.6px、距南 45.6px,都在半径内 → 取更近的北条(河谡)
    const map = parseWorldMap(syntheticMap([
      { name: '出生点', type: 'spawn', x: 72, y: 72, point: true },
      warpObject({ name: '东 · 河谷', x: 912, y: 160 }),
      warpObject({ name: '东 · 湖畔', x: 912, y: 240 }, [
        { name: 'target', type: 'string', value: 'lake' },
        { name: 'tx', type: 'float', value: 88 },
        { name: 'ty', type: 'float', value: 208 },
      ]),
    ]))
    const hint = warpHintAt(map, 884, 180)
    expect(hint!.label).toBe('东 · 河谷 →')
  })

  it('图中央远离出口:无签', () => {
    expect(warpHintAt(WORLD_MAPS.river, 400, 208)).toBeNull()
    expect(warpHintAt(WORLD_MAPS.lake, 900, 100)).toBeNull()
  })
})
