# DOM 主题九宫格素材与风格令牌(票 #47 选型定案)

> **署名已归并(spec #12)**:正式署名登记处见发行根 [`THIRD-PARTY-NOTICES.md`](../../THIRD-PARTY-NOTICES.md)。
> 本文件保存素材用途、border-image 切片契约、下载留痕与 **#47 选型决策的风格令牌草案**。
> 选型结论(2026-11-27,用户拍板):**B 载体 = CC0 九宫格素材为主路**(Kenney UI Pack: RPG
> Expansion 木板风格,最贴星露谷厚木框观感;接受面板几何微调与 toast 形制让位的代价)。

## 文件清单(全部原样入库,零改动)

| 文件 | 尺寸 | 用途(样张实证) |
| --- | --- | --- |
| `panel_brown.png` | 100×100 | 面板外框(不取 fill,内里衬纯色面);亦可作标题木条 fill 件 |
| `panel_beige.png` | 100×100 | 备用面板框(米棕) |
| `panel_beigeLight.png` | 100×100 | toast 圆角牌(fill) |
| `panelInset_brown.png` | 93×94 | 面板标题条木牌(fill,平入件) |
| `panelInset_beige.png` | 93×94 | 行/条目面(fill,平入件) |
| `buttonLong_brown.png` | 190×49 | 主按钮 / 顶栏 pill |
| `buttonLong_brown_pressed.png` | 190×45 | 主按钮按下态(hover/active 换源) |
| `buttonLong_beige.png` | 190×49 | 行内小钮 / 木牌上的关闭钮 |
| `buttonLong_beige_pressed.png` | 190×45 | 行内小钮按下态 |

## border-image 切片契约

素材为矢量渲染图(非像素画),border-image 放大平滑无损。切片值以样张实测为准:

- **面板/牌类**(100×100 与 93×94 两档):`slice 8`——外圈 8px 含 2px 深描边
  (#886644)+ 4px 亮斜面(#b7916a)+ 钉眼缺口;
  边厚画进 **2x**(`border-image-width: 16px` 级),或平入件压到 12px/14px;
  需要内里透出纯色时**不写 `fill`** + `background: var(--ui-surface)`,
  需要整件素材面(标题牌/行面/toast 牌)时写 `fill`。
- **按钮类**(190×49):`slice 12`(圆角约 10px + 斜面 + 底缘暗线);
  边厚压缩画进 8px(pill)/ 5–6px(行内小钮)以保住紧凑控件高度,
  按下态 = 整条 `border-image-source` 换 `*_pressed.png`。
- `border-image` 不吃 `border-radius`:素材件圆角一律由素材自带(令牌 radius 对素材件置 0)。

## 下载留痕(2026-11-27,票 #47)

- 来源:**Kenney「UI Pack: RPG Expansion」** <https://kenney.nl/assets/ui-pack-rpg-expansion>,
  作者 Kenney Vleugels(Kenney.nl),许可 **CC0 1.0**(随包 License.txt 声明)。
- 下载走 Kenney 签名直链,**cookie 法**(先 GET 资产页取会话 cookie,再带 cookie + Referer +
  XHR 头请求 `https://kenney.nl/download-link/<hex("assets/ui-pack-rpg-expansion")>` →
  签名 URL;头组合见 `public/sfx/README.md` 批三节)。
  下载件 `kenney_ui-pack-rpg-expansion.zip`(214 KB,PNG/Vector/Spritesheet)。
- 另取 `kenney_ui-pack.zip`(1.2 MB,基础 UI Pack)甄别后**弃用**:全组为纯色扁平件,
  无木纹质感,不合暖木纸感方向(留痕备查)。
- 原始下载件不随仓库分发(CC0 无保留义务,来源已在本文件与 NOTICES 登记可回溯)。

## 风格令牌草案(#48 全铺时替换 index.html `:root` 的 `--ui-*` 值)

按「素材件 / 纯色件」两类标注:素材件的值 = 素材引用(旧令牌在 border-image 下失效或转语义),
纯色件 = 平色/渐变兜底。布局壳(定位/宽度/滚动)不属本草案。

```css
:root {
  /* ── 纯色件:画布上方裸文本(得分/纪录/徽章/hint/seed,浮在场景上)──
     暖字 #4a3423 在深绿画布上不可读,画布面一律暖米白 + 暖金数字 + 轻投影(样张共同决策) */
  --ui-canvas-text: #f2e7cf;          /* 【新增】画布上裸文字 */
  --ui-canvas-accent: #ffd77a;        /* 【新增】画布上数字强调(得分/金币/倒计时) */
  --ui-canvas-text-shadow: 0 1px 3px rgba(0, 0, 0, .55); /* 【新增】 */
  /* ── 纯色件:面板内文字与强调 ── */
  --ui-text: #4a3423;                 /* 面板内暖字(深棕) */
  --ui-text-dim: #7a6647;             /* 次级/锁定 */
  --ui-accent: #8a5a10;               /* 面板内强调(toast 字/当前项描边) */
  /* ── 素材件:面板面 = 木框(不取 fill)+ 纯色内里 ── */
  --ui-slice-panel: url('/ui/kenney-rpg/panel_brown.png') 8; /* border-image: var(--ui-slice-panel) stretch;内里用 --ui-surface */
  --ui-surface: #ece3ce;              /* 面板内里纯色(米纸) */
  --ui-slice-titlebar: url('/ui/kenney-rpg/panelInset_brown.png') 8 fill; /* 标题条木牌(fill) */
  --ui-slice-row: url('/ui/kenney-rpg/panelInset_beige.png') 8 fill;      /* 行/条目面(fill) */
  --ui-slice-toast: url('/ui/kenney-rpg/panel_beigeLight.png') 8 fill;    /* toast 圆角牌(fill) */
  --ui-slice-button: url('/ui/kenney-rpg/buttonLong_brown.png') 12;       /* 主按钮/pill,pressed 换源 */
  --ui-slice-button-pressed: url('/ui/kenney-rpg/buttonLong_brown_pressed.png') 12;
  --ui-slice-button-soft: url('/ui/kenney-rpg/buttonLong_beige.png') 12;  /* 行内小钮,pressed 换源 */
  --ui-slice-button-soft-pressed: url('/ui/kenney-rpg/buttonLong_beige_pressed.png') 12;
  /* ── 纯色件:边框/焦点/禁用(素材件的描边兜底与统一态保留)── */
  --ui-border: #886644;
  --ui-border-soft: rgba(136, 102, 68, .6);
  --ui-border-accent: #886644;
  --ui-border-accent-strong: #6d543a;
  --ui-focus: #a5650d;                /* 焦点环(素材件上仍用 outline) */
  --ui-disabled-opacity: .45;
  /* ── 纯色件:阴影(素材件上仍生效)── */
  --ui-shadow-panel: 0 8px 18px rgba(30, 20, 10, .45);
  --ui-shadow-pill: 0 2px 5px rgba(30, 20, 10, .35);
  /* ── 素材件:以下旧令牌在九宫格载体下置零/失效,#48 收编时按此处理 ── */
  --ui-radius-panel: 0px;             /* 圆角由素材自带 */
  --ui-radius-row: 0px;
  --ui-radius-pill: 0px;              /* 胶囊 999px 让位素材圆角牌(toast 同) */
  --ui-text-shadow: none;             /* 面板内浅底不投影;画布面用 --ui-canvas-text-shadow */
  /* 退役:--ui-surface-pill / --ui-surface-toast / --ui-titlebar / --ui-row /
     --ui-row-raised / --ui-row-hover / --ui-surface-hover(行悬停在素材件下无平色面,
     悬停反馈 = border-image-source 换 pressed 素材) */
}
```

## 给 #48 的接缝(样张实测的几何与形制影响)

- **面板几何**:同一段商店内容下,276px → **336px**(+36,九宫格边厚 32px 吃内容宽),
  面板整体 **+约 100px 高**(每行 +14px 边厚;行框压到 7px/3px 内边距后实测);
  其余四面板等比加宽,`max-height` 面板(背包/储物箱)滚动区要重验。
- **标题条**:通栏负外边距色带 → **内嵌木牌**(`panelInset_brown` fill 件,
  面板 padding-top 收窄);面板壳分组选择器与 `.panel-head` 的负外边距规则要改写。
- **toast**:胶囊 999px → **圆角牌**(`panel_beigeLight` fill,slice 8,边厚 14px);
  `.toast` 的 padding/边厚同步改,`toast--new-entry` 无专属样式即同族。
- **按钮**:pill 与 `.shop-buy` 全部素材化(边厚 8px / 5px,`min-height` 28 / 20px,
  `white-space: nowrap` 防标签折行);行悬停 = 换 pressed 源,不再有平色 hover。
- **行面**:`--ui-row` 半透明平色 → `panelInset_beige` fill 件;
  空区占位(`#shop-catch-empty` 等选择器组)同族换装。
- **画布面**:顶栏裸文本/hint/seed 改 `--ui-canvas-text` + `--ui-canvas-text-shadow`,
  `#topbar b`/`#coins`/`#countdown` 改 `--ui-canvas-accent`(index.html 现把这三处直接绑
  `--ui-accent`,全铺时随令牌换值即可)。
- **样张对照**:选型依据的样张与截图在仓库外
  `/tmp/starryhook-47-ui-samples/`(生成器 `build-samples.mjs`,DOM 与 index.html 逐字同构),
  决策记录见票 #47 评论区与整合缝笔记「#47 实施结果回写」节。
