# DOM 主题九宫格素材与风格令牌(票 #47 选型定案)

> **署名已归并(spec #12)**:正式署名登记处见发行根 [`THIRD-PARTY-NOTICES.md`](../../THIRD-PARTY-NOTICES.md)。
> 本文件保存素材用途、border-image 切片契约、下载留痕与 **#47 选型决策/#48 落地的风格令牌**。
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

## 风格令牌(票 #48 已落地;单一来源 = index.html `:root`)

#48 全铺已把本节草案落进 index.html `<style>` 顶部 `:root`,并随实现微调了两处命名
(此处不再重复值表,以 index.html 为准;契约测试 `src/ui/themeTokens.test.ts` 钉死存在性):

- 素材引用令牌命名为 `--ui-img-*`(草案的 `--ui-slice-*` 落地时改为**只含 url**、
  切片号写在规则侧)——因为悬停/选中换源走 `border-image-source`,只接受图片,
  不接受「url + 切片」整值;切片契约不变(面板/牌 8、按钮 12)。
- 新增 `--ui-img-row-active`(当前模式行 = `panel_beigeLight` 浅牌面):
  草案期设想用 `panel_beige` 抬起框,实测与 tan 行面(`panelInset_beige`)层级拉不开,
  落地改浅牌面 + 深金「当前」字。
- 画布面三令牌(`--ui-canvas-text/--ui-canvas-accent/--ui-canvas-text-shadow`)、
  面板内纯色件、焦点/禁用、阴影、radius 置 0 与 `--ui-text-shadow: none` 均按草案落地;
  批一深色令牌(含大满贯金带遗留)已全量退役。



## 给 #48 的接缝(样张实测;#48 已按此落地)

- **面板几何**:同一段商店内容下,276px → **336px**(+36,九宫格边厚 32px 吃内容宽),
  面板整体 **+约 100px 高**(每行 +14px 边厚;行框压到 7px/3px 内边距后实测);
  其余四面板按同一**边厚补偿 +60px** 加宽(边厚是常量,内容宽不减即等价于等比;
  落地值:模式 244→304 / 背包 276→336 / 储物箱 420→480 / 图鉴 292→352),
  `max-height` 面板(背包/储物箱)滚动区已实测无恙。
- **标题条**:通栏负外边距色带 → **内嵌木牌**(`panelInset_brown` fill 件);
  面板壳分组选择器与 `.panel-head` 的负外边距规则已改写(border-image 不吃
  border-radius,圆角素材自带)。
- **toast**:胶囊 999px → **圆角牌**(`panel_beigeLight` fill,slice 8,边厚 14px);
  `.toast` 的 padding/边厚同步改,`toast--new-entry` 无专属样式即同族。
- **按钮**:pill 与 `.shop-buy` 全部素材化(边厚 8px / 5px,`min-height` 28 / 20px,
  `white-space: nowrap` 防标签折行,行名 `.shop-name` 同加 nowrap);行悬停 = 换
  pressed 源,不再有平色 hover;交互行(mode/storage)无 pressed 件,悬停 = 轻提亮。
- **行面**:`--ui-row` 半透明平色 → `panelInset_beige` fill 件;
  空区占位(`#shop-catch-empty` 等选择器组)同族换装。
- **画布面**:顶栏裸文本/hint/seed 改 `--ui-canvas-text` + `--ui-canvas-text-shadow`,
  `#topbar b`/`#coins`/`#countdown` 改 `--ui-canvas-accent`;画布浮签与场景横幅
  (Pixi 侧)同步转白底圆角深字,常量在 `render/interactionPrompt.ts` / `render/sceneBanner.ts`。
- **样张对照**:选型依据的样张与截图在仓库外
  `/tmp/starryhook-47-ui-samples/`(生成器 `build-samples.mjs`,DOM 与 index.html 逐字同构),
  决策记录见票 #47 评论区与整合缝笔记「#47 实施结果回写」节。
