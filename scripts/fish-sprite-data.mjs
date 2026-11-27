/**
 * 鱼精灵手绘像素数据(票 #11 起步,票 #53 扩容)。
 *
 * 五种鱼形 × 2 帧,每帧 16 行 × 16 列字符画;'.' 透明,X 描边,g 眼高光,
 * 其余字母查鱼形基palette(W 高光 / b 主体 / s 暗部 / p 腹部浅色)。
 * 风格基线:深描边 + 平涂 + 少量高光,与 OGA 场景素材、自绘浮标一致;
 * 主体占满 16×16 但不顶格(最外圈留空)。帧 0 = 常态,帧 1 = 游动(尾鳍/身体摆一档)。
 *
 * 票 #53:图集行序契约从「鱼形」改为「鱼种」——SPECIES 按鱼目录序声明 18 行,
 * 每行 = { id, shape, body }:像素矩阵沿用其鱼形的手绘矩阵,配色按「重锚」派生
 * (见 derivePalette):以目录 color 为新主体色,同形鱼种获得可辨的色相变体,
 * 描边(X)与眼高光(g)不随种变,风格连贯。既有 5 种的 body = 各自鱼形基palette
 * 的主体色 → 重锚为恒等变换,行像素与扩容前逐位一致(零回归)。
 *
 * 消费方:generate-fish-atlas.mjs;行序须与 src/core/fishCatalog.ts 的 FISH 一致
 * (契约测试 scripts/fish-atlas.test.mjs 钉死)。
 */

/** 公共描边(#2a2226,与 scene-atlas 浮标同源)与眼高光 */
export const OUTLINE = [42, 34, 38, 255]
export const GLINT = [244, 248, 250, 255]

/** 每种鱼形基palette(主体色 = 既有 5 种目录 color;变体种在此之上重锚) */
export const SHAPE_PALETTES = {
  slim: { W: [238, 243, 246, 255], b: [184, 196, 206, 255], s: [139, 152, 165, 255] },
  round: { W: [156, 220, 195, 255], b: [95, 174, 143, 255], s: [62, 122, 100, 255], p: [217, 239, 226, 255] },
  heavy: { W: [154, 144, 160, 255], b: [111, 102, 120, 255], s: [78, 71, 88, 255], p: [141, 132, 150, 255] },
  puff: { W: [247, 188, 208, 255], b: [232, 143, 176, 255], s: [192, 95, 134, 255], p: [249, 217, 228, 255] },
  bolt: { W: [255, 224, 138, 255], b: [242, 201, 76, 255], s: [199, 154, 42, 255], p: [253, 240, 192, 255] },
}

/**
 * 小白条(slim):细长银白,体长 10px(叉尾 3 + 身 7)身高 4px,背脊一点小鳍,
 * 上侧高光带读出银白光泽;吻端由上下边各收 1px 读出尖头(用户复看微调:压短去「棍」感)。
 * 帧 1 尾鳍整体下摆 1px(尾柄下压),身形不动,轻快摆尾。
 */
export const SLIM = [
  [
    '................',
    '................',
    '................',
    '................',
    '................',
    '.......XXX......',
    '..XXXXXXXXX.....',
    '..XssXWWgXbX....',
    '..XssXbbbbsX....',
    '..XXXXXXXXX.....',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
  ],
  [
    '................',
    '................',
    '................',
    '................',
    '................',
    '.......XXX......',
    '.....XXXXXX.....',
    '..XXXXWWgXbX....',
    '..XssXbbbbsX....',
    '..XssXXXXXX.....',
    '..XXX...........',
    '................',
    '................',
    '................',
    '................',
    '................',
  ],
]

/**
 * 稳重鲫(round):圆润椭圆胖身(11×9),背部高光、腹部浅色、鳃部一道弧线,
 * 大眼带高光点,憨厚。帧 1 尾鳍上摆 1px,身体沉稳不动(符合「稳重」)。
 */
export const ROUND = [
  [
    '................',
    '................',
    '................',
    '.......XXX......',
    '......XXXXXX....',
    '.....XWWWbbbX...',
    '....XbbbbsbgXX..',
    '.XXXbbbbbsbXXX..',
    '.XsXbbbbbsbssX..',
    '.Xs.XbpppppssX..',
    '.XX..XpppppsX...',
    '......XppppX....',
    '.......XXXX.....',
    '................',
    '................',
    '................',
  ],
  [
    '................',
    '................',
    '................',
    '.......XXX......',
    '......XXXXXX....',
    '.....XWWWbbbX...',
    '.Xs.XbbbbsbgXX..',
    '..sXbbbbbsbXXX..',
    '..sXbbbbbsbssX..',
    '.XX.XbpppppssX..',
    '....XpppppsX....',
    '......XppppX....',
    '.......XXXX.....',
    '................',
    '................',
    '................',
  ],
]

/**
 * 铅坠鲶(heavy):厚重宽头(头部几乎占半身),背深腹浅、头顶一道灰白光泽,
 * 下颌两根 2px 下垂短须(斜向双像素,用户复看微调:1px 须不可读)。
 * 帧 1 尾鳍下摆 1px、整须右移 1px(须尖颤动),读作迟缓摆动。
 */
export const HEAVY = [
  [
    '................',
    '................',
    '................',
    '..........XXXX..',
    '.........XXXXXX.',
    '........XsWWbbX.',
    '....XsssbbgXbbX.',
    '.XXXssbbbbbbbbX.',
    '.XsXssbbbbbbbbX.',
    '.XsXsbbbbbpppbX.',
    '.XXXbppppppsssX.',
    '....XppppssssX..',
    '......XXXXXX....',
    '.........X.X....',
    '..........X.X...',
    '................',
  ],
  [
    '................',
    '................',
    '................',
    '..........XXXX..',
    '.........XXXXXX.',
    '........XsWWbbX.',
    '....XsssbbgXbbX.',
    '.XXXssbbbbbbbbX.',
    '.XXXssbbbbbbbbX.',
    '..sXsbbbbbpppbX.',
    '..sXbppppppsssX.',
    '.XX.XppppssssX..',
    '......XXXXXX....',
    '..........X.X...',
    '...........X.X..',
    '................',
  ],
]

/**
 * 气球河豚(puff):圆胖带刺,球体 11×11 + 密短刺(顶/底/四角,另加上下弧各两根
 * 弧中刺,共 10 向),左侧小尾,大眼、下腹浅色。行为 = floater:帧 1 整体上浮 1px
 * (球体与刺同步),读作漂浮起伏。
 */
export const PUFF = [
  [
    '................',
    '................',
    '........X.......',
    '......XXXXX.....',
    '....XXXXXXXXX...',
    '....XWWWWbbsX...',
    '....XsbbbbgXX...',
    '.X.XsbbbbbXXsX..',
    '.XXXsbbbbbbbsX..',
    '.X.XsbbppppssX..',
    '....XppppppsX...',
    '....XpppppssX...',
    '...XXXXXXXXXX...',
    '......XXXXX.....',
    '........X.......',
    '................',
  ],
  [
    '................',
    '........X.......',
    '......XXXXX.....',
    '....XXXXXXXXX...',
    '....XWWWWbbsX...',
    '....XsbbbbgXX...',
    '.X.XsbbbbbXXsX..',
    '.XXXsbbbbbbbsX..',
    '.X.XsbbppppssX..',
    '....XppppppsX...',
    '....XpppppssX...',
    '...XXXXXXXXXX...',
    '......XXXXX.....',
    '........X.......',
    '................',
    '................',
  ],
]

/**
 * 闪电梭(bolt):细长梭形,体长 12px(叉尾 2 + 身 10),尖吻(上下边各收 1px
 * 前探)、背腹小鳍、叉尾,背部暗色压边(斜切一步,读作流线脊背)。
 * 帧 1 叉尾下摆 1px 且尾叉张开(蓄力冲刺姿态)。
 */
export const BOLT = [
  [
    '................',
    '................',
    '................',
    '................',
    '................',
    '......XXX.......',
    '..XXXXXXXXXXX...',
    '...XXssssbgXbX..',
    '...XXsssbbbbbpX.',
    '..XXXXXXXXXXX...',
    '......XX........',
    '................',
    '................',
    '................',
    '................',
    '................',
  ],
  [
    '................',
    '................',
    '................',
    '................',
    '................',
    '......XXX.......',
    '....XXXXXXXXX...',
    '..XXXssssbgXbX..',
    '..XsXsssbbbbbpX.',
    '...sXXXXXXXXX...',
    '..XX..XX........',
    '................',
    '................',
    '................',
    '................',
    '................',
  ],
]

/** 鱼形 → 帧矩阵(色相变体共享同一手绘矩阵,只换配色) */
export const SHAPE_FRAMES = {
  slim: SLIM,
  round: ROUND,
  heavy: HEAVY,
  puff: PUFF,
  bolt: BOLT,
}

/** 按种重锚后的体色(RGB):与 src/core/fishCatalog.ts 的 color 字段同源(契约测试钉定) */
export const SPECIES = [
  // —— 既有 5 种(body = 各自鱼形基palette 主体色,重锚恒等,行像素与扩容前一致)——
  { id: 'xiaobaitiao', shape: 'slim', body: [184, 196, 206] },
  { id: 'wenzhongji', shape: 'round', body: [95, 174, 143] },
  { id: 'qianzhuinian', shape: 'heavy', body: [111, 102, 120] },
  { id: 'qiqiuHetun', shape: 'puff', body: [232, 143, 176] },
  { id: 'shandiansuo', shape: 'bolt', body: [242, 201, 76] },
  // —— 票 #53 名册 13 条(村舍 4 / 河谷 5 / 湖畔 4)——
  { id: 'niquQiu', shape: 'slim', body: [138, 106, 69] }, // 泥趣鳅:泥棕
  { id: 'denglongNian', shape: 'heavy', body: [217, 130, 69] }, // 灯笼鲇:灯笼橙
  { id: 'cuilinTaiyangyu', shape: 'round', body: [85, 200, 90] }, // 翠鳞太阳鱼:翠绿
  { id: 'tongxuJi', shape: 'round', body: [176, 106, 53] }, // 铜须鲫:铜棕
  { id: 'yuyingZun', shape: 'slim', body: [111, 143, 184] }, // 雨影鳟:钢蓝
  { id: 'tiejiaLing', shape: 'heavy', body: [111, 143, 160] }, // 铁甲鲮:铁青
  { id: 'jiliuHongzun', shape: 'bolt', body: [212, 112, 160] }, // 急流虹鳟:虹鳟品红
  { id: 'yexingzheNian', shape: 'heavy', body: [74, 79, 110] }, // 夜行者鲶:夜行靛
  { id: 'woliuShen', shape: 'round', body: [74, 143, 181] }, // 涡流鲹:涡流青
  { id: 'yueyingMan', shape: 'slim', body: [176, 168, 212] }, // 月影鳗:月光淡紫
  { id: 'jinlinLi', shape: 'round', body: [224, 181, 74] }, // 金鳞鲤:金鳞亮黄
  { id: 'wuyingLu', shape: 'round', body: [154, 146, 176] }, // 雾影鲈:雾影灰紫
  { id: 'shuangqiangGouyu', shape: 'bolt', body: [134, 217, 222] }, // 霜枪狗鱼:霜冰青
]

/**
 * 变体配色派生:以目录体色为新主体色「重锚」同形基palette——每个字母色
 * 保持与基主体色的逐通道偏移(明暗结构不变,色相整体平移),越界钳制。
 * 既有 5 种 body = 基主体色 → 恒等变换,行像素逐位一致(整数运算无舍入)。
 */
export function derivePalette(shape, body) {
  const base = SHAPE_PALETTES[shape]
  if (!base) throw new Error(`未知鱼形 ${shape}`)
  const anchor = base.b
  const clamp = v => Math.max(0, Math.min(255, v))
  const shifted = {}
  for (const [letter, [r, g, b, a]] of Object.entries(base)) {
    shifted[letter] = [clamp(r + body[0] - anchor[0]), clamp(g + body[1] - anchor[1]), clamp(b + body[2] - anchor[2]), a]
  }
  return shifted
}

/** 图集行序(= src/core/fishCatalog.ts 的 FISH 目录序):行 = 鱼种,列 = 帧 */
export const FISH_SPRITES = SPECIES.map(({ id, shape }) => ({
  id,
  shape,
  frames: SHAPE_FRAMES[shape],
  palette: derivePalette(shape, SPECIES.find(s => s.id === id).body),
}))
