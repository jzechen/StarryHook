# 音效素材:来源、甄别与映射

事件音效(6 个),统一 Ogg Vorbis 格式,文件名 = 事件标识(`src/ui/sfxMapping.ts` 的映射表按键寻址)。
本文件是**下载与甄别过程留痕**;正式署名以发行根的 `THIRD-PARTY-NOTICES.md` 为准(spec #12 已归并)。
全部素材 **CC0**;Fisheefects 页面为多许可(CC-BY 4.0 / OGA-BY 3.0 / CC0),按票面取 CC0。

## 入库清单(文件 → 原始文件 → 事件)

| 文件 | 时长 | 原始文件 | 来源 | 事件(触发点) |
| --- | --- | --- | --- | --- |
| `bite.ogg` | 0.56s | Fisheefects `bloop.wav` | OGA <https://opengameart.org/content/fisheefects> | 咬钩(进入 bite 相位边沿) |
| `cast-splash.ogg` | 2.24s | Fisheefects `splash.wav` | 同上 | 抛竿入水(进入 waiting 相位边沿) |
| `catch.ogg` | 1.68s | Fisheefects `point_special.wav` | 同上 | 捕获(进入 caught 相位边沿) |
| `escape.ogg` | 2.24s | Fisheefects `uhoh.wav` | 同上 | 脱钩(进入 escaped 相位边沿) |
| `level-up.ogg` | 1.75s | Kenney Music Jingles `Audio/8-Bit jingles/jingles_NES00.ogg` | Kenney <https://kenney.nl/assets/music-jingles> | 升级(组合根升级决策处) |
| `new-entry.ogg` | 0.53s | Kenney Interface Sounds `Audio/confirmation_002.ogg` | Kenney <https://kenney.nl/assets/interface-sounds> | 新收录(组合根图鉴决策处) |

## 下载过程(2026-11-26)

- Kenney 两包:站点下载需会话 + Referer/XHR 头换签名直链
  (`https://kenney.nl/download-link/<hex("assets/<slug>")>` → 签名 URL);
  下载件 `kenney_interface-sounds.zip`(834 KB,100 个 ogg)、`kenney_music-jingles.zip`(1.2 MB,5 组 jingles)。
  随包 `License.txt` 均声明 CC0 1.0。
- Fisheefects:OGA 页面直链 `FisheefectsComplete.zip`(9 个 wav,2018-08 上传,You're Perfect Studio)。

## 甄别标准(无法试听环境下的客观替代 + 留痕)

1. **时长契合事件节奏**:咬钩要短(反应窗口内能听完)、结算/庆祝可稍长。
2. **频谱质心轮廓**(ffmpeg `aspectralstats` 按时长三等分):上行 = 明亮化收尾,正反馈感;
   下行 = 暗淡收尾,失败感。用于把 jingle 分成胜利感/败北感两组。
3. **声源家族错开**:升级(8-bit chiptune)与新收录(UI 确认音)不同族,同时触发也可辨。

实测数据(质心 Hz,按时长三等分):

- 候选 jingle 中,Pizzicato / Steel 两组全部呈下行轮廓(845→550 之类),判为败北感,**弃用**;
  8-Bit 组呈上行/平直轮廓,NES00 最长(1.75s)且明亮度恒定 → 升级。
- `confirmation_002`(1708→3106→4051,上行,0.53s)→ 新收录;与 chiptune 家族错开。
- Fisheefects 的 `bloop`(0.56s,水泡音)最贴咬钩的瞬时感;`splash` 天然对抛竿入水;
  `point_special`(1.68s)比 `point_normal`(2.24s)短且「得分特别感」更强 → 捕获;
  `uhoh` 语义直给 → 脱钩;`reel.wav`(8.97s)过长,弃用;`cursor_*` 为 UI 语音,无关弃用。

## 响度核对(ffmpeg volumedetect)

峰值(max_volume):bite -6.2 dB / cast-splash -6.1 dB / catch -6.2 dB / escape -8.1 dB /
level-up -4.9 dB / new-entry -1.0 dB —— 各文件峰值已在 -1~-8 dB 同档,未做归一化,
统一由播放器主音量(volume 0.6)兜底。

## 格式决策

- Kenney 原件即 .ogg(vorbis)→ **原样入库,零转码**;
- Fisheefects 原件为 wav(44.1 kHz)→ ffmpeg libvorbis q5 转码(内容零改动,仅容器/编码);
- 统一 .ogg 的代价:Safari 旧版不支持 Vorbis,该浏览器下音效静默缺失(`Audio.play()` 拒绝被
  静默吞掉,游戏不受影响)。如后续需要全浏览器覆盖,再统一转 AAC 并在此登记。
- 原始下载件不随仓库分发(CC0 无保留义务,来源已在上表与 NOTICES 登记可回溯)。

## 映射

事件 → 音效由纯函数 `sfxForEvent`(`src/ui/sfxMapping.ts`)表驱动,
测试 `src/ui/sfxMapping.test.ts` 用独立字面量钉死每一行,并与本目录文件清单互核。
批三将增「池塘大满贯 / 倒计时」两个事件,沿用同一表(未配音效的事件返回 null,播放器空操作)。
