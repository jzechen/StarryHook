# 移动端 WebRTC 与性能现状调研(iOS Safari / 安卓 WebView)(票 #60)

> 调研票产出,供「双人模式与移动端」导航图(票 #58)的 **spec 移动端章节**直接取用。
> 调研日期:2026-11-27。分支 `research/mobile-webrtc-perf`,基于 main(2758860)。
> 姊妹调研(不重复其结论,只交叉引用):`research/multiplayer-signaling.md`(票 #59,信令/配对/QR)、`research/capacitor-android.md`(票 #61,脚手架与管线,含 Capacitor 版本地板)。
> 术语见仓库 `GLOSSARY.md`。前置决策(票 #58 Destination):WebRTC DataChannel、房主权威模拟、无互联网服务器、Capacitor 安卓先行。
> 方法:一手来源核查——MDN browser-compat-data 8.1.11(直接拉 data.json 验证)、caniuse 原始 JSON、WebKit 博客/Bugzilla/源码、chromestatus API JSON、Apple 开发者文档 JSON(TN3179 原文)、developer.android.com、Capacitor 官方文档/源码/issue 库。本篇为**纯案头调研**,无真机实测;#59 已含 headless Chrome 158 + iOS WKWebView 实测,凡其覆盖处直接引用实测结论。标注 **UNCERTAIN** 的为未能落到一手来源的项。

## TL;DR(三条结论)

1. **DataChannel 在四个目标环境(iOS Safari、iOS WKWebView、安卓 Chrome、安卓 System WebView)全部可用,且版本地板远低于项目地板;真正的限制不在「支不支持」,而在两条 2026 年的局域网围栏。** DataChannel-only(全程不碰 `getUserMedia`)免除全部媒体运行时权限,iOS Safari 11+/Chrome 24+ 即有(DataChannel 比 getUserMedia 早进 WKWebView 三个大版本);Capacitor 8 的地板(Android WebView Chrome 60、iOS 15,#61 §5.2)全覆盖。围栏一:**mDNS 候选混淆 2019 年起在两大引擎默认开启**,「手动填 IP」在浏览器侧不可行,直连的前提是两端在同一 mDNS 广播域(AP 隔离/访客 Wi-Fi/VPN 是主要物理失败模式,#59 §三已实测「候选中无真实 IP」);围栏二:**安卓 17(API 37)起 LAN 访问要 `ACCESS_LOCAL_NETWORK` 运行时权限(WebView 流量继承宿主 app 权限态),Chrome 142 起 web 内容访问局域网要 LNA 弹窗且仅限 secure context**——Capacitor 壳当前(targetSdk 36 / WebView)两者都暂不受影响,web 页面玩家则已经撞墙(#59 实测 `http://<LAN-IP>` 下 ICE 收集为空)。
2. **音频与渲染各有一条必须写进 spec 的硬约束。** iOS:Web Audio 必须在用户手势内解锁(`resume()` 进手势处理器),且 **Ring/Silent 静音开关会静音 Web Audio 输出,WebKit 明示「by design」,2026 年仍然如此**——Capacitor 壳必须用原生代码把 `AVAudioSession` 设为 `.playback`(Capacitor 核心不碰 AVAudioSession,需插件或自写);前后台切换后 `resume()` 还有已知不彻底的 WebKit 缺陷,需重解锁兜底。渲染:**PixiJS v8 官方口径 WebGL 是生产推荐、WebGPU 是 experimental**;WebGPU 在安卓 System WebView 无任何一手支持证据(chromestatus `webview: null`),iOS 要 Safari 26(2025-09)——**低端安卓的渲染基线只能按 WebGL 规划**,配合 resolution 封顶 + `antialias: false` + 批处理纪律;PixiJS 官方无低端安卓基准数字,性能预算锁定前必须真机 profile(UNCERTAIN,见 §六)。
3. **权限模型(2026-11 现状)对 Capacitor 壳有利、对纯 web 有墙,spec 按「壳为主、web 为受限通道」写。** 安卓:cleartext 政策(API 28 起默认禁)只辖 HTTP 族平台组件,WebView 对 targetAPI 26+ 生效;**WebRTC DataChannel 是 DTLS over UDP,不在 cleartext 政策辖域**(依据 Socket API 豁免条款推得,UNCERTAIN 需真机验证一次);安卓 17 起 LAN 访问(含 mDNS、NsdManager、UDP/TCP 到局域网地址)统一收进 `ACCESS_LOCAL_NETWORK`,UDP 失败码 `EPERM`、TCP 超时。iOS:TN3179 明文「**Traffic originating from WKWebView, SFSafariViewController, and Safari doesn't require local network access**」——Capacitor 的 web 内容不触发本地网络弹窗;但只要 native 侧做 mDNS 发现,就要 `NSLocalNetworkUsageDescription`(+ `NSBonjourServices`、多播 entitlement)。

---

## 一、兼容矩阵(WebRTC DataChannel,2026-11)

| 能力 | iOS Safari | iOS WKWebView(Capacitor 壳) | 安卓 Chrome | 安卓 System WebView |
| --- | --- | --- | --- | --- |
| RTCPeerConnection | 11+(2017) | 11+(2017) | 56(无前缀;webkit 前缀 23) | 56(webkit 前缀 4.4) |
| RTCDataChannel(SCTP) | 11+ | **11+**(早于 getUserMedia 进 WKWebView) | 24(Chrome Android 25) | 4.4(后续跟随 Chrome) |
| mDNS(`.local`)host 候选默认开启 | WebKit ToT 2019-01-14 起(bug 193358;首发版本 UNCERTAIN,推断 12.1/12.2) | 同 WebKit | Chrome 76 起全量(2019-08) | 跟随 Chrome(同引擎) |
| RTCSctpTransport / `maxMessageSize` | 15.4+ | 15.4+ | 76+ | 76+ |
| `maxRetransmits`(不可靠) | 11 | 11 | 30 | 4.4 |
| `maxPacketLifeTime`(限期) | 11 | 11 | 56 | 56 |
| `negotiated: true`(带外建通道) | 11 | 11 | 30 | 4.4 |
| `send()` 单条上限 | 256 KB(对端 SDP 无 `max-message-size` 时回退 64 KB) | 同左 | 256 KB(同回退规则) | 同 Chrome |
| 发送队列上限 | 16 MiB(`OperationError`) | 同左 | 16 MiB(`OperationError`) | 同左 |
| getUserMedia(**本项目不需要**,扫码走原生) | 11+,secure context | 14.3+(`capacitor://` 非 HTTP 源 14.5+) | 53+,secure context | 需宿主 `onPermissionRequest` 放行 |

- 版本数据源:MDN browser-compat-data **8.1.11**(本调研直接拉取 `data.json` 复核:`RTCPeerConnection` chrome 56 / webkit 前缀 23、`RTCDataChannel` chrome 24 / chrome_android 25 / safari_ios 11 / webview_ios 11、`maxRetransmits` 30、`maxPacketLifeTime` 56、`RTCSctpTransport` 76 / 15.4;https://github.com/mdn/browser-compat-data,取数 2026-11-27)。caniuse「WebRTC Peer-to-peer connections」最新列(iOS Safari 27.2 / Chrome 161)均为 "y"(https://raw.githubusercontent.com/Fyrd/caniuse/main/features-json/rtcpeerconnection.json,取数 2026-11-27;注意 caniuse 已不再给 Chrome Android 逐版本列,安卓逐版本以 BCD 为准)。
- **BCD 与 caniuse 有一处冲突要记录**:BCD 把 WKWebView 的 `MediaDevices` 标为 11,而 caniuse stream 注记 #3 明说 14.3 前 WKWebView 拿不到摄像头——BCD 标的是 API 暴露,不是功能可用。对本项目无影响(DataChannel 路径不碰 MediaDevices)。

## 二、WKWebView 与「iOS 14.3」的正确读法

- **RTCPeerConnection + RTCDataChannel 自 iOS 11 起就在任意 WebKit web view 里**,不依赖 14.3:WebKit 官方博客原文「For developers that use WebKit in their apps, RTCPeerConnection and RTCDataChannel are available in any web view」、同时期「access to the camera and microphone is currently limited to Safari」(WebKit blog 7763 "A Closer Look Into WebRTC", 2017-07-03, https://webkit.org/blog/7763/a-closer-look-into-webrtc/)。
- **iOS 14.3 改的只是 getUserMedia**:caniuse stream 注记「Before iOS 14.3 getUserMedia returned no video input devices in UIWebView or WKWebView」(https://github.com/Fyrd/caniuse/main features-json/stream.json 注记 #3,取数 2026-11-27);WebKit commit bug 216872 "WKWebViewConfiguration mediaCaptureEnabled"(2020-09-25,https://github.com/WebKit/WebKit/commit/9f7d3dfa0)。对 `capacitor://` 这类非 HTTP(S) 源,14.5 才放开(bug 220184,2021-01-07,https://github.com/WebKit/WebKit/commit/ff60f0a9b)。Apple 官方 iOS 14.3 release notes 里并无 WebKit/getUserMedia 章节——「14.3」属引用充分的二手归因(UNCERTAIN 级别低)。
- 历史坑(iOS 11/12 时代):未授权 getUserMedia 时 host 候选完全不暴露,LAN DataChannel 直连失败(bug 189503,2018 年建档;随 mDNS 默认化失效)——佐证「别把旧 iOS 行为当现状」。
- WKWebView 与 Safari 的 WebRTC 差异集中在**采集**(bug 259304:`capacitor://localhost:8080` 带端口后缀 gUM 失败;241480 退后台丢麦)——DataChannel 无已知 WKWebView 专属缺陷(bugs.webkit.org 检索,2026-11-27);mDNS 处理在 WebKit 核心,Safari/WKWebView 同源。**#59 实测:WKWebView 里 DataChannel 全流程可用**(同仓库一手证据)。
- 近两年 Safari 侧 DataChannel 修复(说明仍在动,spec 别依赖边缘行为):Safari 26.4 修「PC close 时 DC close 事件不发」+ `RTCDataChannelInit` 加 `[EnforceRange]`(https://webkit.org/blog/17862/,2026-03-24);Safari 27 beta 修「DC 未同步检查 SCTP buffered amount」(https://webkit.org/blog/17967/,2026-06-08)。

## 三、DataChannel 实务限制(两端引擎同源,数字可统一)

- **两端都捆绑同一份 libwebrtc**:SCTP 发送缓冲 `kSctpSendBufferSize = 256 * 1024`,offer 带 `a=max-message-size:262144`,应答取 `min(本地, 远端)`;**对端 SDP 缺该属性时按 64 KB 兜底**(`session_description.h` 注释引 draft-ietf-mmusic-sdp-sctp-23);超限抛 `TypeError`,发送队列超 16 MiB 报 `OperationError`(Chromium `third_party/webrtc/api/sctp_transport_interface.h`、`pc/media_session.cc`、`rtc_data_channel.cc`;WebKit 镜像同值:`Source/ThirdParty/libwebrtc/Source/webrtc/...`,均取 2026-11-27)。MDN 口径一致:「most modern browsers support sending messages of at least 256 kilobytes… default value of 64 kilobytes is assumed」(https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Using_data_channels,取数 2026-11-27)。
- **实务规则:游戏消息按 ≤ 64 KB 设计**;运行时读 `RTCSctpTransport.maxMessageSize`(两环境 15.4/76+ 都有)做上限。房主权威模拟的帧状态(几十~几百字节/条,20–30 Hz)距上限 2 个数量级,不构成风险(推论)。
- 可靠性:`maxRetransmits` 与 `maxPacketLifeTime` 全环境可用(BCD 8.1.11);两者同设抛 `TypeError`(spec + Chromium `rtc_peer_connection.cc`);`ordered` 全环境;`priority` 仅 Safari 15+(本项目用不上)。
- 通道数:Chromium `kMaxSctpStreams = 65535`(`sctp_transport_interface.h`);「1024 条上限」系讹传,源码未见(UNCERTAIN——反正双人对局开 1–3 条,无影响)。
- 组播/协商模式推荐:**用 `negotiated: true` + 固定 id 建通道**(带外约定,两端代码简单),或沿用 #59 的默认带内协商亦可。

## 四、WebView 与系统浏览器的行为差异

- **安卓 System WebView = Chromium,经 Play 商店自动更新**,与 Chrome Android 同引擎同特性(上述 BCD `webview_android` 值与 chrome 同步即为佐证);差异点只有两处对本项目相关:
  1. **getUserMedia 需要宿主 app 实现 `WebChromeClient.onPermissionRequest` 放行**(developer.android.com WebSettings/WebChromeClient 文档;https://developer.android.com/reference/android/webkit/WebChromeClient)——本项目 DataChannel-only,不触发;扫码用原生条码 API,不走 WebView 相机。
  2. **WebView 不在 Chrome 的 LNA(局域网访问弹窗)范围内**:chromestatus「Local network access restrictions」`webview_first: null`(https://chromestatus.com/feature/5152728072060928,API 取数 2026-11-27)——见 §7.3。
- **iOS WKWebView = 系统 WebKit,随 iOS 发布**(独立升级无门):WebRTC 核心与 Safari 同源(§二),采集差异见上;Capacitor 无从选择内核版本,iOS 行为完全由用户 iOS 版本决定。
- **Capacitor 两个默认 scheme 都是 secure context**:安卓默认 `server.androidScheme: 'https'` → `https://localhost`(Capacitor 6 起,https://capacitorjs.com/docs/config);iOS 固定 `capacitor://localhost`(`iosScheme` 不许改 http/https)。`capacitor://localhost` 被当 trustworthy 的依据:WebKit `SecurityOrigin.cpp` `shouldTreatAsPotentiallyTrustworthy` 对 localhost/loopback 主机与自定义 scheme handler 均返回 true(https://github.com/WebKit/WebKit main `Source/WebCore/page/SecurityOrigin.cpp`,取数 2026-11-27),与 Capacitor config 文档「hostname 保持 localhost 以获得需 secure context 的 Web API」口径一致。
- **RTCPeerConnection / RTCDataChannel 不要求 secure context**(W3C webrtc-pc WebIDL 无 `[SecureContext]`,https://github.com/w3c/webrtc-pc;BCD 两接口无 secure_context_required),getUserMedia 才要求(Chrome 47/53 起,caniuse stream)。**但 2026 年实况是:纯 web 页在 `http://<LAN-IP>` 下 Chrome 158 实测 ICE 收集为空(#59 §结论 3a)**——机制未见一手归因(UNCERTAIN),结论不变:**web 玩家入口必须 https 或 localhost;Capacitor 壳天然满足**。
- Capacitor 侧没有官方 WebRTC 指南(docs 全站无 WebRTC/RTCPeerConnection 条目,ionic-team/capacitor-docs 检索,2026-11-27);相关 issue:`#8176`(WKWebView WebRTC 音频毛刺,open)、`#8613`(Capacitor 9 + Android 17 `ACCESS_LOCAL_NETWORK`:LAN 连接在授权前静默失败,2026-10 关闭)(https://github.com/ionic-team/capacitor/issues;注意 capacitor-issues 独立仓库不存在,tracker 就是主仓库)。

## 五、Web Audio 解锁(iOS 是硬约束,安卓是软约束)

- **手势要求**:AudioContext 建议在用户手势内 create/resume;WHATWG 定义「activation triggering input event」= `keydown`(非 Esc)、`mousedown`、`pointerdown`(仅鼠标)、`pointerup`(仅非鼠标)、`touchend`——注意 `click` 不在清单里,浏览器从真实输入事件合成激活(https://html.spec.whatwg.org/multipage/interaction.html,living standard,取数 2026-11-27);MDN 指引「Create or resume context from inside a user gesture」(https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices,2026-08-27 版)。Apple 官方文档**没有**任何 Web Audio 手势要求页面——需求只能从 WebKit bug 侧看清(文档缺口,UNCERTAIN 级别中)。
- **iOS 实操:`resume()` 要放进手势处理器同步调用**;证据:WebKit bug 240646(Construct 团队,2022 建档,still NEW/InRadar)里可用的 workaround 即「starting it in a touch handler, matching the user gesture requirements in the Safari browser」(https://bugs.webkit.org/show_bug.cgi?id=240646)。
- **已知 iOS/WKWebView 缺陷(全部仍 open,spec 要写兜底)**:`resume()` 在退后台后不 resolve(bug 281566,240646 之 see-also);回前台后 AudioContext 不总是恢复(bug 263627);`touchend` 解锁在部分版本失效(bug 248265);**状态说谎**——`state === 'running'` 但无声(240646)。**兜底:前后台切换(`visibilitychange`)与每次入房都重跑一次手势内 `resume()`,并以「实际出声」为准做 UI 提示(如首次击键/点击时再触发一次短促测试音)。**
- **Ring/Silent 静音开关会静音 Web Audio——2026 年仍成立,WebKit 工程师原话「actually by design」**(bug 262781,2023 建档、2025-08 仍活跃、InRadar;`<audio>` 元素不受影响,Web Audio 受影响,https://bugs.webkit.org/show_bug.cgi?id=262781;2026-09 仍有同类 bug 323022 活跃)。依据:web 内容拿到的等效 `AVAudioSession` 是 `.ambient`——Apple 文档:「the Silent switch … silence your audio」(https://developer.apple.com/documentation/avfaudio/avaudiosession/category-swift.struct/ambient);要穿透静音开关需 `.playback`(https://developer.apple.com/documentation/avfaudio/avaudiosession/category-swift.struct/playback)。
- **Capacitor 核心不碰 AVAudioSession**(ios/Sources/Capacitor 无 AVAudioSession 引用,https://github.com/ionic-team/capacitor main,取数 2026-11-27);社区 `@capacitor-community/native-audio` 把 category **硬编码为 playback**(#22,2021 起 open,https://github.com/capacitor-community/native-audio/issues/22)。**spec 决策点:游戏音效走 Web Audio + 自写 3 行原生插件(或复用 native-audio)把 session 设为 `.playback`;若产品上「跟随静音开关」是期望行为,则什么都不做即可——必须显式二选一。**
- **安卓**:Chrome 自动播放政策——有声自动播放需用户与域交互或 PWA 安装;MEI 仅桌面生效(https://developer.chrome.com/blog/autoplay,取数 2026-11-27);Web Audio 在手势上下文外发起同样受 autoplay 政策管(https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay,2026-09-10)。WebView 默认 `setMediaPlaybackRequiresUserGesture(true)`(API 17+),**Capacitor `Bridge.java` 已改为 `false`**(line 541,https://github.com/ionic-team/capacitor main)——该开关管媒体元素;`AudioContext` 在 WebView 内无手势能否 running,无一手文档(UNCERTAIN;游戏本来就有 tap-to-start,实际无害)。
- 版本底:`AudioContext` Safari 6(webkit 前缀)/ 14.1(无前缀)(MDN BCD `api.AudioContext`,取数 2026-11-27)——地板无压力。

## 六、PixiJS 渲染性能(低端安卓)

- **v8 现状(2026-11 官方文档口径):WebGL 是生产推荐,WebGPU 是 experimental。** 渲染器表:WebGLRenderer「Default renderer… Stable and widely supported. (Recommended)」;WebGPURenderer「Faster in many cases, still maturing. (Experimental)」;「Use the WebGL renderer for production applications」;`autoDetectRenderer` 的 `preference` 默认 **webgl**(https://pixijs.com/8.x/guides/components/renderers、/application,取数 2026-11-27)。**spec 直接锁 WebGL,不赌 WebGPU。**
- **WebGPU 可得性(为何不能依赖)**:Chrome Android **121** 起(Android 12+,Qualcomm/ARM GPU;https://chromestatus.com/feature/5119617865613312 + https://developer.chrome.com/docs/web-platform/webgpu/overview,取数 2026-11-27);**Android System WebView 无一手支持证据**——chromestatus 记录 `webview_first: null`,Google 的 WebGPU overview 全文未提 WebView(BCD 的 `webview_android: mirror` 与之冲突,按 chromestatus 判)**UNCERTAIN:按「WebView 无 WebGPU」规划,运行时 `navigator.gpu` 特性探测**;iOS Safari **26.0**(2025-09)起支持(https://webkit.org/blog/16993/ WWDC25 + Apple Safari 26 release notes「Added support for WebGPU」+ https://caniuse.com/webgpu,取数 2026-11-27;桌面 26.0 仅 macOS 26+,caniuse 注记 #7);**WebGPU 的最低 iPhone 机型无线索**(WebKit/caniuse 均不写,UNCERTAIN)。Firefox Android 无。
- **低端安卓实务(全部出自 PixiJS 官方 performance-tips,https://pixijs.com/8.x/guides/concepts/performance-tips,取数 2026-11-27):**
  - 「Some older mobile devices run things a little slower… `backgroundAlpha: 1` 和 `antialias: false` 可以提速」——**canvas 建 renderer 时锁 `antialias: false`**;
  - **`resolution` 默认 1,高 DPI 要手动设 `devicePixelRatio`;官方没有给封顶指引**——低端安卓按 1.5–2 封顶是社区惯例而非官方口径(UNCERTAIN,须真机 profile 定标),配合 `autoDensity: true`;
  - 批处理纪律:相邻同类型对象才合批(类型切换断批)、每批最多 16 张纹理(依硬件)、不同 blendMode 断批、Graphics ≤100 点才合批且别每帧改;
  - 纹理:精灵表合并、旧设备用 `@0.5x` 低清表、销毁要分帧错峰(每帧 ≤5 个);culling 默认关,GPU-bound 时开、CPU-bound 时反而降;
  - 手机 GPU 全是 tile-based(官方明言「**every phone GPU**」)——MSAA 相关行为特殊;Safari 27.x 的 transient MSAA 缺陷 PixiJS 已绕(PR #12348,2026-10-30)。
- **基准数字:PixiJS 官方不存在低端安卓基准**(仅定性指引 + 个案 issue:#6577 2020 年 Chrome@Android 慢、#11850 2026-01 v8.10 多边形回归、#11092 Cordova 打包卡顿,https://github.com/pixijs/pixijs/issues)。第三方 FPS 数字一律视作二手。**行动项:实现票在选定低端真机上跑一次 profile(满场景精灵数/绘制调用/DPR),把「可接受的最差机型」写进 spec;本调研不提供数字。**
- 视口侧本仓库已就绪:`touch-action: none`、`-webkit-user-select: none`、viewport meta(index.html)+ ADR 0002 固定逻辑分辨率信箱缩放(与 resolution 封顶正交)。

## 七、局域网权限模型(2026-11 现状)

### 7.1 安卓:cleartext 政策只辖 HTTP 族,DataChannel 不在其列

- **API 28(Android 9)起 cleartext 默认禁**(`<base-config cleartextTrafficPermitted="false">`);cleartext 定义为「unencrypted HTTP protocol」(https://developer.android.com/privacy-and-security/security-config,取数 2026-11-27)。
- 管辖面:`android:usesCleartextTraffic=false` 时「platform components, for example, HTTP and FTP stacks, DownloadManager, and MediaPlayer, refuse…」且「**there's no expectation that the Socket API honors this flag**」「**WebView honors this attribute for applications targeting API level 26 and higher**」;有 NSC 时 API 24+ 忽略该属性(https://developer.android.com/guide/topics/manifest/application-element,取数 2026-11-27)。
- **对本项目:DataChannel(DTLS over UDP)不受 cleartext 政策影响**——它是加密传输、非 HTTP 族,且政策明文不期待 Socket API 遵守(此为自一手定义推出的结论,**UNCERTAIN:无 Google 文档明说「WebRTC DTLS 豁免」,上真机验一次**);受影响的是 WebView 内 `http://192.168.x.x` 的 fetch/XHR/WebSocket。NSC 按 domain 匹配,**数字 IP/网段字面量匹配无一手文档**(UNCERTAIN)。
- Capacitor:`server.cleartext` 默认 `false`,官方定位「live-reload 专用,不用于生产」(https://capacitorjs.com/docs/config)——**发布壳不开 cleartext,dev 回路用法见 #61 §1.4**。

### 7.2 安卓 17(API 37):局域网访问统一要 `ACCESS_LOCAL_NETWORK`(前瞻性硬风险)

- 「**Starting in Android 17 (API level 37), local network protections are enforced for apps targeting Android 17 or higher**」;到局域网地址的 **TCP 连接、UDP 单播/多播/广播(收发都算)、`.local` 解析、NsdManager** 全部要求该运行时权限;「**Traffic originating from Android Webviews that require local network access will inherit permission state from the host app**」;失败症状:UDP `EPERM`、TCP 超时(https://developer.android.com/privacy-and-security/local-network-permission,取数 2026-11-27,本节全部引语同源)。
- **分档**:targetSdk ≤ 36 的 app 靠 `INTERNET` 隐式获得,**不要**声明/请求该权限;targetSdk 37 起必须声明 + 运行时请求(属于 `NEARBY_DEVICES` 组,组内已授权过 Bluetooth 等则不再弹)。Capacitor 8 模板 targetSdk **36**(#61 §5.2)→ **当前无感;升级 targetSdk 37 那天必须跟一票**。
- 2025 年下半年的 Android 16「NEARBY_WIFI_DEVICES + RESTRICT_LOCAL_NETWORK opt-in」方案已废弃,别引用旧文。
- mDNS/NSD:native 侧发现用 `NsdManager`(DNS-SD over mDNS,官方明举例「a game can find other players on the same local network」,https://developer.android.com/reference/android/net/nsd/NsdManager);自收组播(不走 NsdManager)需 `MulticastLock` + `CHANGE_WIFI_MULTICAST_STATE` 权限,且官方警告耗电(https://developer.android.com/reference/android/net/wifi/WifiManager.MulticastLock);API 37 起 NsdManager 有免权限的 `FLAG_SHOW_PICKER` 系统选单路径。**纯浏览器页面没有任何 mDNS/扫描 API——发现只能靠 QR 带外(#59 已定)。**
- Chrome(引擎)侧的 mDNS:2019-08 起默认把 host 候选换成 `xxx.local`(Chrome 76 全量;有采集权限才回退明文 IP;Chrome 团队自测「2% (relative) reduction in connection rate」并要求两端「in the same mDNS broadcast domain」,https://groups.google.com/g/discuss-webrtc/c/6stQXi72BEU,2019-08-13)。Chromium 对解析不了的 `.local` 候选**直接丢弃、无回退**(没有 STUN/TURN 就没有路径):`p2p/base/p2p_transport_channel.cc` 解析失败即丢弃(https://chromium.googlesource.com/chromium/src/+/refs/heads/main/third_party/webrtc/p2p/base/p2p_transport_channel.cc,取数 2026-11-27);IETF 草案同口径:「When mDNS fails, ICE will attempt to fall back to either NAT hairpin, if supported, or TURN relay if not」(draft-ietf-mmusic-mdns-ice-candidates-03 §5.1,已过期但为唯一成文来源)。

### 7.3 iOS:本地网络隐私弹窗——WKWebView 明文豁免

- 主源:TN3179 "Understanding local network privacy"(https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy;2024-10-31 成文,最近修订 2026-10-06;Apple 文档 JSON 取数 2026-11-27,引语同源):
  - 触发表:** outgoing TCP / 发 UDP 单播/多播/广播 = 要;收 UDP 单播 = 不要**;解析 `.local` 本地名 = 要;全部 Bonjour 操作 = 要(iOS 多播另需 `com.apple.developer.networking.multicast` entitlement,macOS 不要);检查在「deep in the networking stack」,管所有网络 API。
  - **豁免条款(本调研最关键一句):「Traffic originating from WKWebView, SFSafariViewController, and Safari doesn't require local network access.」** → Capacitor 壳里 web 内容发出的 WebRTC DTLS/WebSocket 到局域网,**不触发 iOS 本地网络弹窗**(UNCERTAIN:条款按 TCP/UDP 通则表述,未点名 WebRTC,上真机验一次)。
  - 无查询权限的 API(FB8711182);后台且权限未定时**静默拒绝不弹窗**;想主动触发弹窗:「connect a UDP socket to a local network address」;探测拒绝:`NWPath.UnsatisfiedReason.localNetworkDenied` / Bonjour error -65570。
  - Info.plist:`NSLocalNetworkUsageDescription`——「Any app that uses the local network, directly or indirectly, should include this description」(https://developer.apple.com/documentation/bundleresources/information-property-list/nslocalnetworkusagedescription);native 侧 Bonjour 加 `NSBonjourServices`。
  - iOS 18 唯一成文变化 = 权限状态内存/持久态失步 bug,**iOS 18.6 修复**(FB14321888);「iOS 18 重做了弹窗 UX」的说法无 Apple 一手佐证,不采信。
- Capacitor 不提供这些键的文档/模板(https://capacitorjs.com/docs/ios/configuration 无 local network 字样;模板 Info.plist 无相关键)——**iOS 实现票要手工加 `NSLocalNetworkUsageDescription`;只要 native 侧不做 mDNS,就到此为止**。

### 7.4 Chrome 142 起:web 玩家的局域网访问要 LNA 弹窗(且仅限 secure context)

- 「**Chrome 142 restricted the ability to make requests to the user's local network, gated behind a permission prompt** … This permission is restricted to secure contexts」——分阶段 145/146/147(桌面)与 156 继续放量;**WebView 无里程碑(`webview_first: null`),Capacitor 壳不受影响**(https://chromestatus.com/feature/5152728072060928,API 取数 2026-11-27)。
- WebRTC 专项收口「Local Network Access Restrictions for WebRTC」(gated behind a permission prompt)2025-05-01 建档、2025-09-03 更新,仅到 intent-to-prototype、**无 ship 里程碑**(https://chromestatus.com/feature/5065884686876672,取数 2026-11-27)——**未来 Chrome 收紧 WebRTC 局域网直连是明牌趋势,web 玩家通道要按「可能随时要弹权限」设计,Capacitor 壳是规避通道**。
- 与 #59 实测互相印证的注记:`http://<LAN-IP>`(不安全源 + 局域网地址)在 Chrome 158 下 ICE 收集为空——机制没有一手归因(**UNCERTAIN**;LNA 仅限 secure context + WebRTC 专项限制在建,两条线索都指向同方向),但结论与 #59 一致且更硬:**web 玩家必须 https 或 localhost 打开**。

## 八、风险清单(按严重度排序)

| # | 风险 | 等级 | 触发面 | 缓解 |
| --- | --- | --- | --- | --- |
| R1 | **mDNS 广播域不通(AP 隔离/访客 Wi-Fi/企业网/VPN)→ P2P 完全无法直连**(Chromium 对解析失败的 `.local` 候选无回退) | 高(唯一系统性失败模式) | 全环境 | 配对失败诊断内建(ICE failed 8–10 s → 「同一 Wi-Fi/关 AP 隔离」提示,#59 §五);QR 配对不受影响(带外) |
| R2 | **iOS Ring/Silent 静音 Web Audio(by design)** | 高 | iOS 壳 | 原生 `AVAudioSession` 设 `.playback`(插件或 3 行自写);或产品决策「跟随静音开关」显式化 |
| R3 | iOS Web Audio `resume()` 缺陷族(后台→前台不恢复/状态说谎/touchend 失效,均 open) | 中高 | iOS 壳 | 手势内同步 `resume()` + `visibilitychange` 重解锁 + 以「实际出声」校验的 UI 兜底 |
| R4 | **安卓 17(API 37)`ACCESS_LOCAL_NETWORK`**:targetSdk 升 37 后 WebView LAN 流量被禁(UDP `EPERM`/TCP 超时),WebView 继承宿主权限态 | 中(当前 targetSdk 36 无感;升级必踩) | 安卓壳(未来) | 升 targetSdk 37 的同票加权限声明 + 运行时请求 + 拒绝态诊断 |
| R5 | Chrome 142 起 LNA(仅 secure context)+ WebRTC 专项限制在建 → web 玩家直连越来越窄 | 中(趋势) | 纯 web 玩家 | web 入口限 https/localhost;主推 Capacitor 壳(WebView 无 LNA) |
| R6 | `http://<LAN-IP>` 打开 = ICE 静默空集(#59 实测;机制 UNCERTAIN) | 中 | 纯 web 玩家 | 同 R5;文档写死入口要求 |
| R7 | **WebGPU 不可依赖**(WebView 无一手证据;iOS 需 Safari 26;最低机型无线索) | 中 | 全环境 | PixiJS `preference: 'webgl'` 锁死;`navigator.gpu` 特性探测留门 |
| R8 | 低端安卓渲染预算无数据(官方零基准) | 中 | 安卓壳 | 实现票真机 profile;`resolution` 封顶 + `antialias: false` 起步 |
| R9 | Safari DataChannel 边缘行为仍在修(26.4/27 各有修复) | 低 | iOS | 不依赖 buffered amount 同步语义等边缘行为;升级基线 iOS 时复测 |
| R10 | WebView 内 http 明文加载被 cleartext 政策拦(若未来做 LAN HTTP 资产/信令) | 低 | 安卓壳 | 生产不开 `server.cleartext`;DataChannel 不受影响(UNCERTAIN,真机验一次) |

## 九、硬约束结论(供 spec 移动端章节直接引用)

- **HC1(传输面)**:DataChannel-only 贯穿移动端——不碰 `getUserMedia`,安卓零运行时权限、iOS 零媒体权限;消息 ≤ 64 KB;可靠性模式全环境可用。**四个目标环境(iOS Safari / iOS WKWebView / 安卓 Chrome / 安卓 System WebView)在 Capacitor 8 地板上全部原生支持,无 polyfill、无降级路径需求。**
- **HC2(音频)**:iOS 必须做「手势内解锁 + 静音开关决策 + 前后台重解锁」三件套;安卓侧 tap-to-start 已覆盖。spec 必须含一段「音频解锁与 iOS 静音开关」小节,并点名需要原生侧 `AVAudioSession` 配置。
- **HC3(渲染)**:渲染器锁 PixiJS v8 WebGL(WebGPU 仅作特性探测的加速路径);低端安卓预算以真机 profile 定标后才写进 spec 的性能节;起步配置 `antialias: false` + `resolution` 封顶(数值待 profile)。
- **HC4(配对/直连)**:发现与配对 = 带外(QR 主、复制粘贴兜底,#59);浏览器侧不存在「手填 IP」路径(mDNS 混淆);直连前提 = 同一 mDNS 广播域,失败诊断是必选项不是加分项。
- **HC5(权限面)**:安卓 targetSdk 36(现状)只需 `INTERNET`;升 37 加 `ACCESS_LOCAL_NETWORK`。iOS 加 `NSLocalNetworkUsageDescription`(native 侧不做 mDNS 就到此为止)。生产壳不开 cleartext。web 玩家入口必须 https 或 localhost。
- **HC6(壳 vs 浏览器)**:Capacitor 壳是权限与 LNA 的当前豁免方,也是唯一可控的发布面;spec 按「壳为一级平台、web 浏览器为受限二等通道」行文,与票 #58 Destination「web 全程可测」不冲突——**可测性靠桌面浏览器,发布体验靠壳**。

## 参考链接

- MDN browser-compat-data 8.1.11(`RTCPeerConnection` / `RTCDataChannel` / `RTCSctpTransport` / `AudioContext`):https://github.com/mdn/browser-compat-data(本调研直接拉取 `data.json` 复核,2026-11-27)
- caniuse:peerconnection / stream / webgpu:https://raw.githubusercontent.com/Fyrd/caniuse/main/features-json/ 、https://caniuse.com/webgpu(2026-11-27)
- WebKit blog 7763 "A Closer Look Into WebRTC":https://webkit.org/blog/7763/a-closer-look-into-webrtc/(2017-07-03)
- WebKit bugs:193358(mDNS 默认开)、189503(旧 iOS DC 失败)、227741(无 plist 可关)、240646/281566/263627/248265(iOS AudioContext)、262781(静音开关 by design)、323022(2026 活跃):https://bugs.webkit.org/show_bug.cgi?id=<n>
- WebKit commits:9f7d3dfa0(bug 216872)、ff60f0a9b(bug 220184);SecurityOrigin.cpp(secure origin 规则):https://github.com/WebKit/WebKit
- WebKit Safari 26.4 / 27 beta / Safari 26.0(WebGPU)博客:https://webkit.org/blog/17862/、https://webkit.org/blog/17967/、https://webkit.org/blog/16993/(WWDC25)
- Apple:Safari 26 release notes、iOS 14.3 release notes、`AVAudioSession` category(ambient/playback)、TN3179、`NSLocalNetworkUsageDescription`、`NSBonjourServices`:https://developer.apple.com/documentation/(TN3179 JSON 取数 2026-11-27)
- W3C webrtc-pc(WebIDL 无 `[SecureContext]`):https://github.com/w3c/webrtc-pc;WHATWG HTML 激活事件:https://html.spec.whatwg.org/multipage/interaction.html
- IETF draft-ietf-mmusic-mdns-ice-candidates-03 §5.1:https://www.ietf.org/archive/id/draft-ietf-mmusic-mdns-ice-candidates-03.txt
- Chromium 源码:`third_party/webrtc/api/sctp_transport_interface.h`、`pc/media_session.cc`、`p2p/base/p2p_transport_channel.cc`;blink `kWebRtcHideLocalIpsWithMdns`:https://chromium.googlesource.com/chromium/src/
- Chrome WebRTC 团队 PSA(mDNS 全量 2019-08,连接率 -2%):https://groups.google.com/g/discuss-webrtc/c/6stQXi72BEU
- Chrome 平台状态:「Local network access restrictions」(ship 142,WebView null)https://chromestatus.com/feature/5152728072060928;「Local Network Access Restrictions for WebRTC」(proposed)https://chromestatus.com/feature/5065884686876672;「WebGPU on Android」(121)https://chromestatus.com/feature/5119617865613312(API JSON 取数 2026-11-27)
- Google WebGPU overview(Android 121 / Android 12+ / Qualcomm & ARM):https://developer.chrome.com/docs/web-platform/webgpu/overview;Chrome 自动播放政策:https://developer.chrome.com/blog/autoplay;MDN autoplay:https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay
- Android:security-config、application-element(`usesCleartextTraffic` 全文)、`NetworkSecurityPolicy`、**local-network-permission(Android 17 / `ACCESS_LOCAL_NETWORK`)**、`NsdManager`、`MulticastLock`、wifi-permissions(`NEARBY_WIFI_DEVICES`):https://developer.android.com/(均取数 2026-11-27)
- PixiJS:renderers / application / performance-tips(8.x 官方指南)、v8.0.0 release(2024-03-05)、PR #12348、issues #6577 / #11850 / #11092:https://pixijs.com/8.x/guides/ 、https://github.com/pixijs/pixijs
- Capacitor:config(`server.cleartext`/`androidScheme`/`hostname`)、android(WebView 60+ 要求)、support-policy(8.x 活跃)、Bridge.java(`setMediaPlaybackRequiresUserGesture(false)`)、ios/configuration、issue #8176 / #8613、`@capacitor-community/native-audio` issue #22:https://capacitorjs.com/docs/ 、https://github.com/ionic-team/capacitor
- 仓库内姊妹调研(实测一手):`research/multiplayer-signaling.md`(票 #59:Chrome 158 http-LAN ICE 空集、WKWebView DC 全流程可用、mDNS 候选无真实 IP、SDP 字节/QR 容量)、`research/capacitor-android.md`(票 #61:Capacitor 8 地板/SDK 线/管线)、`docs/adr/0001`、`docs/adr/0002`
