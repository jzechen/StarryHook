# StarryHook

类星露谷的独立钓鱼小游戏(浏览器,TypeScript + PixiJS)。

## 开发

```bash
pnpm install
pnpm dev      # http://localhost:5173
pnpm test     # 核心逻辑单测(vitest)
pnpm build    # 类型检查 + 生产构建
```

- 调参:手感参数集中在 `src/config.ts`,Vite 热更即时生效
- 复现:`http://localhost:5173/?seed=123` 可复现一整局随机序列
- 术语:见 `GLOSSARY.md`;技术决策:见 `docs/adr/`

## 素材与字体署名

全部第三方素材/字体的统一登记处是 **[`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md)**
(名称/作者/来源链接/许可逐项列出);许可全文随包存放于 `public/licenses/`(构建时拷入 dist)。
分许可约定:只收录 CC0 / OFL / MIT 等可再分发素材,禁再分发的不进仓库。

| 类别 | 内容 | 来源 | 许可 |
| --- | --- | --- | --- |
| 字体 | Fusion Pixel 12px Proportional SC(npm 自托管,全部 DOM 文本,字号取 12 的整数倍) | TakWolf,<https://github.com/TakWolf/fusion-pixel-font> | OFL-1.1(`public/licenses/Fusion-Pixel-12px-OFL.txt`) |
| 音效 | 6 个事件音效:`public/sfx/`(咬钩/抛竿入水/捕获/脱钩/升级/新收录) | Kenney「Interface Sounds」「Music Jingles」;OGA「Fisheefects」(You're Perfect Studio) | CC0 1.0 |
| 场景 | 流水/岸线波纹/草地/行走角色/摊位农夫:`public/sprites/`(16x16 基线) | OGA:InThePixel / Zabin / Syrsly / Flixberry Entertainment;Kenney:Tiny Town / Tiny Dungeon / Tiny Farm(逐项链接见 NOTICES) | CC0 1.0 |

- 派生规则与素材管线:`public/sprites/README.md`(场景)、`public/sfx/README.md`(音效甄别留痕)
- 场景切片唯一入口:`src/render/textures.ts`;音效映射:`src/ui/sfxMapping.ts`
- Fisheefects 为多许可素材(CC-BY 4.0 / OGA-BY 3.0 / CC0),本项目按 CC0 使用,无署名义务,
  仍按项目惯例在 NOTICES 中署名;鱼精灵等 AI 生成素材不含第三方版权

