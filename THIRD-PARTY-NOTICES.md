# 第三方素材与字体署名(THIRD-PARTY NOTICES)

本仓库使用的全部第三方素材、字体与运行时依赖的统一署名登记处。
除特别注明外,本仓库对这些素材的改动仅为:格式转码、裁切拼接、调色、降采样等
「派生制作」,均在对应许可允许范围内;派生文件与原始文件的对应关系逐条列在表中。

许可约定(spec #8):公开仓库只收录 **CC0 / OFL / MIT** 等可再分发许可的素材;
禁再分发的素材包不进仓库。

---

## 字体

### Fusion Pixel 12px Proportional SC(缝合像素字体)

- **作者**:TakWolf(<https://takwolf.com>)
- **上游**:<https://github.com/TakWolf/fusion-pixel-font>
- **引入方式**:npm 自托管 `@fontsource/fusion-pixel-12px-proportional-sc`(纯 CSS + woff2/woff,无构建脚本)
- **许可**:**SIL Open Font License 1.1**(含 Reserved Font Name "Fusion Pixel")
- **许可全文**:`public/licenses/Fusion-Pixel-12px-OFL.txt`(Vite 构建时随 `public/` 原样拷入发行包 dist)
- **本仓库用法**:全部游戏内文本(DOM 覆盖层),字号取 12 的整数倍
- 说明:`@fontsource` 打包的 woff2 实为该字体的完整简体中文字集(约 600 KB),
  fontsource 元数据标注的 "latin" 子集名与实际覆盖不符,以实际字形为准。

## 音效

| 仓库文件 | 原始文件 | 来源与作者 | 许可 | 处理 |
| --- | --- | --- | --- | --- |
| `public/sfx/bite.ogg`(咬钩) | `bloop.wav` | OGA「Fisheefects」,You're Perfect Studio,<https://opengameart.org/content/fisheefects> | **CC0 1.0**(该页多许可:CC-BY 4.0 / OGA-BY 3.0 / CC0,取 CC0) | wav → Ogg Vorbis 转码(q5),内容未改 |
| `public/sfx/cast-splash.ogg`(抛竿入水) | `splash.wav` | 同上 | 同上 | 同上 |
| `public/sfx/catch.ogg`(捕获) | `point_special.wav` | 同上 | 同上 | 同上 |
| `public/sfx/escape.ogg`(脱钩) | `uhoh.wav` | 同上 | 同上 | 同上 |
| `public/sfx/level-up.ogg`(升级) | `Audio/8-Bit jingles/jingles_NES00.ogg` | Kenney「Music Jingles」,Kenney Vleugels(Kenney.nl),<https://kenney.nl/assets/music-jingles> | **CC0 1.0** | 原样入库,零改动 |
| `public/sfx/new-entry.ogg`(新收录) | `Audio/confirmation_002.ogg` | Kenney「Interface Sounds」,Kenney Vleugels(Kenney.nl),<https://kenney.nl/assets/interface-sounds> | **CC0 1.0** | 原样入库,零改动 |
| `public/sfx/grand-slam.ogg`(大满贯) | `Audio/Hit jingles/jingles_HIT11.ogg` | Kenney「Music Jingles」,Kenney Vleugels(Kenney.nl),<https://kenney.nl/assets/music-jingles> | **CC0 1.0** | 原样入库,零改动(票 #44) |
| `public/sfx/countdown.ogg`(倒计时) | `Audio/tick_001.ogg` | Kenney「Interface Sounds」,Kenney Vleugels(Kenney.nl),<https://kenney.nl/assets/interface-sounds> | **CC0 1.0** | 原样入库,零改动(票 #44) |
| `public/sfx/footstep.ogg`(脚步) | `Audio/footstep09.ogg` | Kenney「RPG Audio」,Kenney Vleugels(Kenney.nl),<https://kenney.nl/assets/rpg-audio> | **CC0 1.0** | 原样入库,零改动(票 #44) |
| `public/sfx/ambient-water.ogg`(近水水声) | `water_flowing.ogg` | OGA「30 CC0 SFX loops」,rubberduck,<https://opengameart.org/content/30-cc0-sfx-loops> | **CC0 1.0** | ffmpeg `volume=10dB` 增益后 libvorbis q5 重编码(仅响度,内容零改动;票 #44) |

- 甄别与下载过程留痕:`public/sfx/README.md`
- Kenney 三个包(Music Jingles / Interface Sounds / RPG Audio)随包 `License.txt` 均声明 CC0
  (署名非强制,此处按项目惯例仍予署名)
- OGA「30 CC0 SFX loops」页面整体标注 CC0(2018-07 上传)

## 场景精灵(自 #10 归并)

16x16 基线;切片统一经 `src/render/textures.ts`(唯一入口)。派生规则详见 `public/sprites/README.md`。

| 仓库文件 | 原始素材 | 来源与作者 | 许可 | 处理 |
| --- | --- | --- | --- | --- |
| `public/sprites/water-flow.png` | 原样入库 | OGA「Animated flowing water 2d 16x16」,InThePixel,<https://opengameart.org/content/animated-flowing-water-2d-16x16> | **CC0 1.0** | 未改动 |
| `public/sprites/tiny-town.png` | `Tilemap/tilemap_packed.png`(Kenney「Tiny Town」整包,kenney.nl/assets/tiny-town) | Kenney「Tiny Town」,Kenney Vleugels(Kenney.nl),<https://kenney.nl/assets/tiny-town> | **CC0 1.0**(随包 License.txt 声明) | 原样入库,零改动;16×16、12 列 packed 表,地图 JSON 以单 tileset 引用(切片经 textures.ts) |
| `public/sprites/tiny-dungeon.png` | `Tilemap/tilemap_packed.png`(Kenney「Tiny Dungeon」整包,kenney.nl/assets/tiny-dungeon) | Kenney「Tiny Dungeon」,Kenney Vleugels(Kenney.nl),<https://kenney.nl/assets/tiny-dungeon> | **CC0 1.0**(随包 License.txt 声明) | 原样入库,零改动;16×16、12 列 packed 表,宝箱两态帧(tile 89 闭箱 / 90 开箱)经 textures.ts 切片(票 #41) |
| `public/sprites/shoreline-waves.png` | `oga-src/cc0waveanimtiles16x16.png` | OGA「16x16 Shoreline Wave Animation Tiles」,Zabin,<https://opengameart.org/content/16x16-shoreline-wave-animation-tiles> | **CC0 1.0** | 派生:抠透明 + 旋转四边(规则见 sprites README) |
| `public/sprites/grass.png` | `oga-src/voda_pesok_trava_revision_2.png` | OGA「16x16 tileset: water, grass and sand」,Syrsly,<https://opengameart.org/content/16x16-tileset-water-grass-and-sand> | **CC0 1.0** | 派生:取纯草块并压暗(RGB × 0.78) |
| `public/sprites/character.png` | `oga-src/ch003.png` | OGA「Character sprite + walk animation」,Flixberry Entertainment,<https://opengameart.org/content/character-sprite-walk-animation> | **CC0 1.0** | 派生:32×32 → 16×16 众数降采样 |
| `public/sprites/scene-atlas.png` | —(自绘) | `scripts/generate-bobber-atlas.mjs` 生成 | 无第三方版权(等效 CC0) | 脚本生成 |
| `public/sprites/oga-src/` | — | 上列 OGA 素材的原始下载件 | **CC0 1.0** | 原样保存,作派生来源与溯源凭据 |

## UI 素材:DOM 主题九宫格(自 #47 归并)

DOM 面板/顶栏/toast 的 CC0 九宫格件,`border-image` 切片契约与用途见
`public/ui/kenney-rpg/README.md`(票 #47 选型定案)。

| 仓库文件 | 原始素材 | 来源与作者 | 许可 | 处理 |
| --- | --- | --- | --- | --- |
| `public/ui/kenney-rpg/panel_brown.png`、`panel_beige.png`、`panel_beigeLight.png`、`panelInset_brown.png`、`panelInset_beige.png`、`buttonLong_brown.png`、`buttonLong_brown_pressed.png`、`buttonLong_beige.png`、`buttonLong_beige_pressed.png` | `PNG/` 同名件(Kenney「UI Pack: RPG Expansion」整包,kenney.nl/assets/ui-pack-rpg-expansion) | Kenney「UI Pack: RPG Expansion」,Kenney Vleugels(Kenney.nl),<https://kenney.nl/assets/ui-pack-rpg-expansion> | **CC0 1.0**(随包 License.txt 声明) | 原样入库,零改动(2026-11-27 取包,票 #47);基础「UI Pack」一并甄别后弃用(纯色扁平件,无木纹,见 README 留痕) |

## 代码依赖

| 依赖 | 用途 | 来源 | 许可 |
| --- | --- | --- | --- |
| `pixi.js` | 场景渲染(ADR-0001) | <https://github.com/pixijs/pixijs> | MIT |
| `@fontsource/fusion-pixel-12px-proportional-sc` | 字体 npm 分发渠道 | <https://github.com/fontsource/font-files> | 字体文件 OFL-1.1(见上),打包器代码 MIT |

仅开发期工具(vite / typescript / vitest)不随发行包分发,此处不逐项登记。
