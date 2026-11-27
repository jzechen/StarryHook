# 音效素材:来源、甄别与映射

事件音效(6 个)与环境声循环(1 个)+ 步频/倒计时/大满贯(批三新增 3 个)共 10 个,统一 Ogg Vorbis 格式,文件名 = 事件标识(`src/ui/sfxMapping.ts` 的映射表按键寻址)。
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
| `grand-slam.ogg` | 0.96s | Kenney Music Jingles `Audio/Hit jingles/jingles_HIT11.ogg` | Kenney <https://kenney.nl/assets/music-jingles> | 大满贯(票 #44:与 main.ts 捕获沿 grandSlam.start() 同帧起播) |
| `countdown.ogg` | 0.02s | Kenney Interface Sounds `Audio/tick_001.ogg` | Kenney <https://kenney.nl/assets/interface-sounds> | 倒计时(票 #44:限时局最后 10 秒整秒边沿,归零帧不响) |
| `footstep.ogg` | 0.22s | Kenney RPG Audio `Audio/footstep09.ogg` | Kenney <https://kenney.nl/assets/rpg-audio> | 脚步(票 #44:移动中按 0.28s 步频触发,停止即停) |
| `ambient-water.ogg` | 1.88s | OGA「30 CC0 SFX loops」`water_flowing.ogg` | OGA <https://opengameart.org/content/30-cc0-sfx-loops> | 近水水声(票 #44:循环播放,音量随最近水域距离淡入淡出) |

## 下载过程(2026-11-26)

- Kenney 两包:站点下载需会话 + Referer/XHR 头换签名直链
  (`https://kenney.nl/download-link/<hex("assets/<slug>")>` → 签名 URL);
  下载件 `kenney_interface-sounds.zip`(834 KB,100 个 ogg)、`kenney_music-jingles.zip`(1.2 MB,5 组 jingles)。
  随包 `License.txt` 均声明 CC0 1.0。
- Fisheefects:OGA 页面直链 `FisheefectsComplete.zip`(9 个 wav,2018-08 上传,You're Perfect Studio)。

## 下载过程(2026-11-27,批三/票 #44)

- Kenney 三包:沿签名直链技巧;**匿名请求 403(偶发,与 #26 记录一致)——先 GET 资产页取
  会话 cookie,再带 cookie + Referer + XHR 头请求直链端点即通**;
  下载件 `kenney_music-jingles.zip`(1.2 MB)、`kenney_interface-sounds.zip`(834 KB)、
  `kenney_rpg-audio.zip`(965 KB,51 个 ogg)。
- OGA「30 CC0 SFX loops」(rubberduck,2018-07 上传,整页标注 CC0):直链 `sfx_loops.zip`(3.5 MB,30 个 ogg)。
  取 `water_flowing.ogg`(1.88s 循环)。候选「Running Water / stream-sounds / Nature Sounds Pack」
  均为 CC-BY / GPL,按「只收录 CC0」纪律弃用;「Park ambiences」river 段为 99 MB 野录(鸟蛙混录,非纯水声)弃用。

## 甄别标准(无法试听环境下的客观替代 + 留痕)

1. **时长契合事件节奏**:咬钩要短(反应窗口内能听完)、结算/庆祝可稍长。
2. **频谱质心轮廓**(ffmpeg `aspectralstats` 按时长三等分):上行 = 明亮化收尾,正反馈感;
   下行 = 暗淡收尾,失败感。用于把 jingle 分成胜利感/败北感两组。
3. **声源家族错开**:升级(8-bit chiptune)与新收录(UI 确认音)不同族,同时触发也可辨。
4. **循环素材批三追加一项——循环无缝度**:首/中/尾三段 RMS 接近(首尾差 < 1 dB)且轮廓平直,
   循环拼接处不出现周期性「呼吸」。

实测数据(质心 Hz,按时长三等分):

- 候选 jingle 中,Pizzicato / Steel 两组全部呈下行轮廓(845→550 之类),判为败北感,**弃用**;
  8-Bit 组呈上行/平直轮廓,NES00 最长(1.75s)且明亮度恒定 → 升级。
- `confirmation_002`(1708→3106→4051,上行,0.53s)→ 新收录;与 chiptune 家族错开。
- Fisheefects 的 `bloop`(0.56s,水泡音)最贴咬钩的瞬时感;`splash` 天然对抛竿入水;
  `point_special`(1.68s)比 `point_normal`(2.24s)短且「得分特别感」更强 → 捕获;
  `uhoh` 语义直给 → 脱钩;`reel.wav`(8.97s)过长,弃用;`cursor_*` 为 UI 语音,无关弃用。

批三实测(2026-11-27):

- 大满贯:五组 jingle 全量测轮廓(此前三组未测)。Hit / Sax 组各有过半上行件;
  胜利组候选按「上行 + 与升级(8-Bit)家族错开 + 庆祝可稍长」取
  `jingles_HIT11`(0.96s,1842→1950→2407 单调上行,-4.0 dB);
  8-Bit 组的上行件(NES03/08/12/13)与升级同族——大满贯与升级可同帧触发(捕获既结算经验),
  同族会糊成一片,故弃 8-Bit;Sax 组峰值普遍 -10 dB 上下,偏暗,弃用。
- 倒计时:`tick_001`(0.02s,11162→5911,极短极亮)——每秒一响不叠音、金属 tick 语义直给;
  click_002/003/005(0.01s 单击)过干,switch_*(0.5-0.6s)太长,弃用。
- 脚步:RPG Audio `footstep00-09` 全测,取 `footstep09`(0.22s,1991→1227 下行衰减,峰值 -6.1 dB
  为全组最柔)——脚步是最高频事件音,取最轻一档防聒噪;上行轮廓的 03/05/06/07(蹭地/拖步感)弃用。
- 近水水声:`water_flowing`(1.88s,5345/5430/5459 轮廓平直;首/中/尾 RMS -37.0/-36.5/-37.0 dB,
  首尾差 0.05 dB)→ 无缝循环;`water_boiling`(气泡,4.49s)语义不符弃用。

## 响度核对(ffmpeg volumedetect)

峰值(max_volume):bite -6.2 dB / cast-splash -6.1 dB / catch -6.2 dB / escape -8.1 dB /
level-up -4.9 dB / new-entry -1.0 dB / grand-slam -4.0 dB / countdown -0.8 dB / footstep -6.1 dB /
ambient-water -14.0 dB —— 事件音峰值在 -1~-8 dB 同档,未做归一化,统一由播放器主音量(volume 0.6)兜底;
ambient-water 原件峰值 -23.9 dB(环境底噪档,原件见上),入库时转码 +10 dB 增益(见格式决策),
峰值 -14.0 dB ≈ 比最轻事件音再低 6 dB——水声是环境层,不抢事件音。

## 格式决策

- Kenney 原件即 .ogg(vorbis)→ **原样入库,零转码**;
- Fisheefects 原件为 wav(44.1 kHz)→ ffmpeg libvorbis q5 转码(内容零改动,仅容器/编码);
- OGA `water_flowing.ogg` 原件即 vorbis(48 kHz)→ 仅 ffmpeg `volume=10dB` 增益后 q5 重编码
  (内容零改动,仅响度与编码率;理由见响度核对节);
- 统一 .ogg 的代价:Safari 旧版不支持 Vorbis,该浏览器下音效静默缺失(`Audio.play()` 拒绝被
  静默吞掉,游戏不受影响)。如后续需要全浏览器覆盖,再统一转 AAC 并在此登记。
- 原始下载件不随仓库分发(CC0 无保留义务,来源已在上表与 NOTICES 登记可回溯)。

## 映射

事件 → 音效由纯函数 `sfxForEvent`(`src/ui/sfxMapping.ts`)表驱动,
测试 `src/ui/sfxMapping.test.ts` 用独立字面量钉死每一行,并与本目录文件清单互核。
未配音效的事件返回 null,播放器空操作。

批三(票 #44)四个新事件已落表,播放分两通道:
- 一次性事件音(grand-slam / countdown / footstep)走 `SfxPlayer.play`(与既有六个事件同路);
- 常驻循环(ambient-water)走 `AmbientLoopPlayer.setAmbient`(音量档 = `ambientWaterLevel`
  纯函数,距离 = `waterDistancePx` 世界层纯函数),静音门 `MuteAwareSfxPlayer.setAmbient`
  对循环是「显式停」而非「放任音量 0 空转」——两通道都被静音开关覆盖。
