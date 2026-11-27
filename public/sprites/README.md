# 场景素材与署名

> **署名已归并(spec #12)**:正式署名登记处移至发行根的 [`THIRD-PARTY-NOTICES.md`](../../THIRD-PARTY-NOTICES.md),
> 根 README 增有「素材与字体署名」速览段。本文件保留派生规则与素材管线细节(下方内容仍准确),
> 许可以 NOTICES 为准。

池塘场景像素素材,16x16 基线(480×270 = 30×17 tile)。全部素材许可为 **CC0 / 自绘**,
切片统一经 `src/render/textures.ts`(唯一入口)。

## 文件清单

| 文件 | 来源 | 许可 | 说明 |
| --- | --- | --- | --- |
| `water-flow.png` | OGA「Animated flowing water 2d 16x16」,作者 InThePixel,<https://opengameart.org/content/animated-flowing-water-2d-16x16> | CC0 | 13 帧流水条,原样入库未改动 |
| `tiny-town.png` | Kenney「Tiny Town」v1.0 的 `Tilemap/tilemap_packed.png`,<https://kenney.nl/assets/tiny-town> | CC0 | 世界地图 packed 表(192×176,12 列 × 11 行,无间隔),原样入库未改动;tile 编号行优先 `tile_N = packed (N÷12, N%12)`(调研留痕:票 #26),地图 JSON(src/world/village.json)以单 tileset 引用,切片经 textures.ts |
| `tiny-dungeon.png` | Kenney「Tiny Dungeon」v1.0 的 `Tilemap/tilemap_packed.png`,<https://kenney.nl/assets/tiny-dungeon> | CC0 | 宝箱素材(票 #41):同规格 packed 表(192×176,12 列 × 11 行)原样入库未改动,与 tiny-town 同一行优先编号;本票只取宝箱两态帧(tile 89 闭箱 / tile 90 开箱,盖板掀起 = 空箱外观),切片经 textures.ts(`CHEST_TILE_CLOSED/OPEN`) |
| `farmer.png` | 派生自 Kenney「Tiny Farm」v1.0 的 `Tilemap/tilemap_packed.png` tile 0109(原件存 `oga-src/tiny-farm-tilemap_packed.png`),<https://kenney.nl/assets/tiny-farm> | CC0 | 摊位农夫立绘(票 #49,#36 暖色 tint 替身退役):见下方派生规则;生成器 `scripts/generate-farmer-sprite.mjs` 留档可复现 |
| `shoreline-waves.png` | 派生自 OGA「16x16 Shoreline Wave Animation Tiles」,作者 Zabin,<https://opengameart.org/content/16x16-shoreline-wave-animation-tiles> | CC0 | 见下方派生规则 |
| `grass.png` | 派生自 OGA「16x16 tileset: water, grass and sand」,作者 Syrsly,<https://opengameart.org/content/16x16-tileset-water-grass-and-sand> | CC0 | 见下方派生规则 |
| `character.png` | 派生自 OGA「Character sprite + walk animation」,作者 Flixberry Entertainment,<https://opengameart.org/content/character-sprite-walk-animation> | CC0 | 见下方派生规则;生成器 `scripts/generate-character-sprite.mjs` 留档可复现 |
| `scene-atlas.png` | 自绘浮标图集 | 无第三方版权(等效 CC0) | 由 `scripts/generate-bobber-atlas.mjs` 生成 |
| `fish-atlas.png` | 自绘鱼精灵图集(5 种鱼 × 2 帧,32×80) | 无第三方版权(等效 CC0) | 由 `scripts/generate-fish-atlas.mjs` 手绘像素矩阵生成;行序契约见 `src/render/fishAtlas.ts` |
| `oga-src/` | 上列 OGA 素材的原始下载件 + Kenney「Tiny Farm」packed 表(2026-11-27 经会话 cookie 下载法取包,管线留痕见 `public/sfx/README.md` 下载过程节) | CC0 | 原样保存,作派生来源与溯源凭据 |

## 派生规则(CC0 允许修改;派生件同样按 CC0 分发)

- **shoreline-waves.png**(128×64 = 8 帧 × 4 边,行序 上/右/下/左)
  取原件 BASE 行 8 帧(y=9..24);品红键色与棕色泥土像素置透明,只保留白色泡沫
  (泥土与草地基底撞色,去掉后由池塘描边负责岸线轮廓);再按 90° 旋转出
  右/下/左三条边的贴图,土侧统一朝外、泡沫朝水内。
- **grass.png**(16×16)取原件 (1,0) 处纯草块,RGB 乘 0.78 压暗
  (原件偏亮的荧光绿全屏平铺过于刺眼,且不利于浅色 HUD 文本可读性;alpha 不动)。
- **character.png**(64×64 = 4 向 × 4 帧,行序 下/上/左/右)
  原件 ch003.png 每帧 32×32,**逐帧独立**按 2×2 众数降采样为 16×16:众数只在
  不透明像素里计(块内全透明才判透明),平局取扫描序先见者——细腿/摆臂在
  2×2 块内是少数派,混入透明像素一起计众数会被投没(旧产物 4 帧全同、行走
  换帧从未生效的根源;票 #49 review 重派生)。帧序与行序沿用原件。
  生成器 `scripts/generate-character-sprite.mjs` 留档可复现;产物契约
  (每向相邻帧像素差 > 0 + 重派生逐像素一致)由 `scripts/character-sprite.test.mjs` 锁定。
- **farmer.png**(16×16,票 #49)取 Tiny Farm packed 表 tile 0109(草帽农夫,朝下)。
  Kenney 角色件在 packed 表内以深梅色实底(rgb 63,38,49)承托、表级透明索引 0 只出现在
  tile 四角——直接切片会带矩形底。派生两步:①实底色与透明索引全部键出,得角色剪影
  (腿间空隙与底色连通,同样键出);②剪影 8 邻接外扩 1px 回填实底色作描边,还原
  Kenney 角色件的描边观感。生成器 `scripts/generate-farmer-sprite.mjs`(调色板 PNG
  手写解码 + png-encode 编码,同像素输入 → 同字节输出)。

## 备选与取舍

- 「Grass&Water 16x16 Tiles」(AntumDeluge,CC0):草/水过渡带红棕色描边,
  与本作水色不合,未采用;如后续需要草水过渡 9-patch 可再评估。
- 波纹原件的 CURVE 拐角件(16×32 双排)未采用:池塘矩形非 tile 对齐
  (高 178.2px ≈ 11.14 tile),直边泡沫 + 描边已足够,拐角件留待需要时再接。
- 宝箱件(票 #41)选 Kenney「Tiny Dungeon」:Tiny Town 全表无宝箱件,
  Tiny Dungeon 的两态宝箱(tile 89 闭箱 / 90 开箱)与 16×16 基线、
  Kenney 色板同族,免派生;OGA 检索到的单件宝箱多为 24×32 或带署名要求,未采用。
  下载走 Kenney 签名直链(管线留痕见 `public/sfx/README.md` 下载过程节,
  2026-11-27 取包,随包 License.txt 声明 CC0);整表入库备用,#42/#43 需要 dungeon
  系贴图时按同一切片契约扩展 textures.ts 即可。
- 农夫件(票 #49)选 Kenney「Tiny Farm」:表内角色件两枚(tile 0108 长发 /
  0109 草帽,均朝下静立),取 **0109**——草帽读作「农夫」的辨识度更高,且与
  玩家(深色短发)同框可辨;0108 留在原表,后续需要第二 NPC 时按同规则派生。
  Tiny Farm 未整包入库(仅 oga-src 留原件作溯源):整表 132 tile 本票只用一件,
  派生件 farmer.png 单独入库即可,避免发布一份只用一格的 packed 表。
  下载走会话 cookie 法(2026-11-27,管线留痕见 `public/sfx/README.md` 下载过程节),
  随包 License.txt 声明 CC0。
