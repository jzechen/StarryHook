# 信令与配对方案调研(WebRTC 本地双人)(票 #59)

> 调研票产出,供「双人模式与移动端」导航图(票 #58)的 spec 联机章节取用。
> 调研日期:2026-11-27。分支 `research/multiplayer-signaling`,基于 main(2758860)。
> 术语见仓库 `GLOSSARY.md`;前置决策:传输层已定为 WebRTC DataChannel、房主权威模拟、无互联网服务器、Capacitor 安卓先行(票 #58 Destination)。
> 方法:两条腿——(1)一手来源核查(npm registry JSON、GitHub API、官方文档/规范/源码、MDN、webkit.org、chromestatus);(2)本机实测(headless Chrome 158 + WKWebView Swift 测试工具,含 SDP 字节数、QR 版本、非安全源行为)。标注 UNCERTAIN 的为未能落到一手来源的项。

## TL;DR(三条结论)

1. **推荐方案:裸 `RTCPeerConnection` + 手工带外交换 SDP,不引入任何信令库。**
   `iceServers: []`(同 LAN 只需 host/mDNS 候选)+ 非 trickle(等 `icegatheringstate === 'complete'`,超时上限 1 s)+ `localDescription` 序列化后经二维码/复制粘贴交换,约 100–200 行 TS、零运行时依赖。
   **Trystero、PeerJS 一票否决**:两者默认都连公共互联网中继(Trystero 默认 Nostr 30 个公共 relay;PeerJS 无条件连云 PeerServer `0.peerjs.com:443`),且**都没有 `signal()` 类手工注入入口,架构上锁死在中继范式**——「公共信令」明确违反「无互联网服务器」约束,LAN 自建(ws-relay / peerjs-server)也仍是「跑一台服务器」,否。simple-peer 不含信令、不违反约束,但 2022-02 后无发版,且对 2 peer 一次性 DataChannel 无增益,不引入。
2. **配对体验推荐「双向 QR」4 步主流程 + 复制粘贴兜底。**
   SDP 实测:**纯 DataChannel、无 STUN、 gathering 完成后 offer 587 B / answer 586 B**(单 mDNS 候选;多网卡桌面约 1.2–1.5 KB),而 QR V40-L 容量 2 953 B——**单码必装,无需分块/压缩**;压缩(fflate)只作可选优化(省约 30% 模块数)。4 步:房主展示 offer QR → 客人扫 → 客人自动展示 answer QR → 房主扫;两端需相机。桌面无相机/http 源场景回退复制粘贴(约 5–6 步);**纯浏览器下浏览器不能监听端口,NFC/音频/蓝牙全部不可用,双 QR 就是步数下限**。
3. **双环境可行性成立,但有两个必须写进 spec 的平台硬约束。**
   (a) **网页玩家必须以 https 或 localhost 打开游戏**:Chrome 158 实测在 `http://<LAN-IP>` 下 `RTCPeerConnection` 能构造但 **ICE 收集为空(静默失败)**;Capacitor 默认 `androidScheme: https` + `hostname: localhost` 天然 secure context,DataChannel 开箱可用(iOS WKWebView 实测 DataChannel 全流程可用;`getUserMedia` iOS 14.3 起进 WKWebView)。
   (b) **mDNS 混淆使「手动填 IP」在浏览器不可行**:主流浏览器 2026 现状全部默认把 host 候选换成 `.local` 主机名(实测 SDP/候选中无真实 IP),同网段 mDNS 组播通即直连;AP 隔离/访客 Wi-Fi 禁组播是主要物理风险,需配对失败诊断提示。iOS 需声明 `NSLocalNetworkUsageDescription`。

---

## 一、约束读法与基线事实

- 「无互联网服务器」的准确含义:**不依赖任何互联网端点**(公共中继、自建公网服务、STUN/TURN 全部排除)。这不等于「无信令」——WebRTC 规范上总需要一条**带外信道**交换 SDP:「Unfortunately, WebRTC can't create connections without some sort of server in the middle. We call this the signal channel or signaling service.」(MDN, https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Connectivity)。**QR 扫码/人肉搬运就是这条带外信道,不违反约束**。
- 同 LAN 下不需要 STUN/TURN:host 候选即直连。Trystero/PeerJS 默认仍配 Google STUN(Trystero 可用 `rtcConfig:{iceServers:[]}` 覆盖;PeerJS 默认连 Google STUN + PeerJS 自营 TURN,https://github.com/peers/peerjs/blob/master/lib/util.ts)。注意:MDN 未明文写「同 LAN 可免 STUN」,此为业界通行行为 + 实测成立(本调研两端 SDP 交换后 DataChannel `open`),标 UNCERTAIN。
- 传输层已定(票 #58),本文只解信令/配对;但 DataChannel-only 带来一个重要简化:**全程不碰 `getUserMedia` 媒体流**,免除安卓 CAMERA/RECORD_AUDIO 运行时权限与 iOS 麦克风权限(扫码才需要相机)。

## 二、免信令库评估(票面第 3 项:公共信令是否违反约束——**是**)

| | Trystero 0.27.0(2026-11-11) | PeerJS 1.5.5(2025-06-07) | simple-peer 9.11.1(2022-02-17) | 裸 RTCPeerConnection |
| --- | --- | --- | --- | --- |
| 默认信令 | nostr(默认)连 30 个公共 Nostr relay,redundancy 5;mqtt 4 个公共 broker;torrent 5 个公共 WebTorrent tracker(源码硬编码,`packages/{nostr,mqtt,torrent}/src/index.ts`,https://github.com/dmotz/trystero) | **无条件**开 WebSocket 连云 PeerServer(默认 `0.peerjs.com:443`,lib/peer.ts) | 无(信令完全交给应用,README 自带手工复制粘贴示例) | 无,带外交换自选 |
| 能否绕开服务器 | 否:无 `signal()` 入口,API 即 `joinRoom()` 中继匹配;唯一零第三方路径 `@trystero-p2p/ws-relay` 是**自建 Node≥22 WebSocket 中继**(文档提可跑 local LAN——仍是一台服务器) | 否:无 `signal()` 方法,手工 SDP 交换架构上不可能;LAN 只能自建 peerjs-server(Node/Docker) | 能:信令无关 | 能 |
| 违反「无互联网服务器」? | **是**(开箱即连公共中继) | **是**(架构性) | 否(但与裸 API 等价) | 否 |
| 维护风险 | 低:MIT、ESM、TS、meta 包 ~17 KB,月下载 14.5 万,2 876 星,极活跃 | 中:月下载 57 万但 ~17 个月无发版,unpacked ~2.0 MB(三者最重) | 高:2022-02 后无发版,最后 push 2024-06,issue 无人理 | 无(浏览器标准 API,bus factor 无关) |
| 结论 | **否决**:质量好但范式不符(中继匹配,非免信令) | **否决** | 不引入(停滞;裸 API 足够) | **推荐** |

- Trystero 各策略默认服务器与自托管说明见其 `docs/signaling.md`;全仓库无 offline/air-gapped 模式,「offline」仅指断网时挂起 relay 重连(`setRelayConnectivity('offline')`)。
- 2025–2026 扫描:npm/GitHub 上**没有**成熟维护的「LAN-only/离线配对」通用库。最接近的 CORVAX(2026-11-12 建,宣称 "With no network service at all, link two peers by hand")0 star、无 license、单作者,仅列观察名单。

## 三、带外信道选型(QR 为主)

| 信道 | 可行性 | 结论 |
| --- | --- | --- |
| **双向 QR** | 双端都需相机;offer/answer 各一码;实测单码容量充裕 | **推荐主流程**(见第四节) |
| **复制粘贴文本** | 零依赖;桌面 http 源下 `navigator.clipboard.readText()` 不可用,需 textarea 手动复制 | **必做回退**(无相机桌面 / QR 扫码失败) |
| **单向 QR + LAN HTTP 回传** | 主机 App 内开本地 HTTP 服务器,客人扫码取 offer 后 POST 回 answer:Capacitor 内可行(`@cantoo/capacitor-http-server` 1.0.8,Android NanoHTTPD 前台服务 + iOS GCDWebServer,`start()` 返回 LAN 地址供 QR 编码) | **否决为主路径**:插件 2026-04 才建、0 star、无 WebSocket、iOS 退后台即停,还需 Android networkSecurityConfig / iOS `NSAllowsLocalNetworking` 明文豁免 + iOS 本地网络权限弹窗;**纯浏览器主机不可能监听端口**(Web 平台无监听 API;唯一例外 Direct Sockets 仅限签名安装的 Chrome Isolated Web Apps)。留作「App 房主 + 网页客人」场景的未来选项 |
| **手动 IP** | **浏览器不可行**:mDNS 混淆后 JS 拿不到本机真实 IP(实测候选/SDP 中无 IP,`RTCIceCandidate.address` 为 null);接收方虽接受手写 IP 候选(实测不抛错),但发送方无 IP 可填。Capacitor 原生侧可读(上述插件返回 `addresses`),归入 LAN 服务器路线 | **否决**(浏览器侧) |
| **Web NFC** | 仅 Chrome Android(MDN BCD:`chrome_android: 89`,桌面/iOS/Firefox 全 false);点对点还需对方为 NDEF 端点(iOS 不能模拟) | 否决:无 iOS、无桌面 |
| **音频传输(ggwave)** | 8–16 B/s → 586 B 需 37–73 s 单向,需麦克风权限、怕噪声(https://github.com/ggerganov/ggwave) | 否决 |
| **Web Bluetooth** | iOS Safari 不支持;配对 UX 重于扫码 | 否决 |

## 四、SDP 体积、QR 容量与压缩(实测)

实测环境:headless Chrome 158,`new RTCPeerConnection({iceServers: []})` + 单 DataChannel + 等 `iceGatheringState === 'complete'`(非 trickle);两端 SDP 交换后 DataChannel 到达 `open`。

- **基线尺寸:offer 587 B / answer 586 B(18 行)**。单条 mDNS 候选 127 B(UUID 36 字符 + `.local`),`a=fingerprint` 154 B。**每多一条候选 ≈ +127 B**;多网卡桌面(虚拟网卡/VPN/Docker)常见 2–8 条 → 实际范围 ~590 B – 1.5 KB。
- QR 容量(ISO/IEC 18004,表源 https://www.thonky.com/qr-code-tutorial/character-capacities):V40 byte 模式 L=2 953 / M=2 331 / Q=1 663。SDP 含小写 → 只能 byte 模式;**实测 584 B 在 EC=M 下仅需 v18(89×89 模块),6 候选(1 214 B)v28**——单码必装。**直接放原始 SDP 文本**:base64 包 URL 反而更大(584→803 字符)。
- 压缩(可选优化,实测 fflate 0.8.3 `gzipSync`):584 B → 309 B(1.89×),但 base64 膨胀后净收益 0.62–1.01×,**换 QR 版本 v18→v15、v28→v17(约省 30% 模块数,提升扫码速度/距离)**。结论:**基线不压缩;若现场扫码体验不佳再加 fflate(0.8.3,MIT,0 依赖,8 kB)可选开关**。lz-string(URI 编码反而膨胀)与 base45(RFC 9285,无实测收益)否决。
- 采集等待:等 `icegatheringstate === 'complete'`,**超时上限 1 s**(Qivex/webrtc-via-qr 默认 `gatheringTimeout: 1000`,同款实践;Firefox 非 trickle 有 5 s 宽限期,需主动截断)。超时后用已有候选直接编码。
- 候选过滤:只保留 `typ host`、去 loopback/teredo,控制多网卡桌面的尺寸膨胀。

## 五、推荐配对流程(供 spec 联机章节)

**角色**:房主(权威模拟侧)「创建世界 → 邀请」;客人「加入」。

**主流程(双向 QR,4 步用户操作 + 首次各 1 次相机授权):**

1. 房主:自动 gather(≤1 s)→ 全屏展示 **offer QR** + 「复制文本」按钮;
2. 客人(Capacitor App):「加入」→ 原生扫码(1 次相机授权)→ `setRemoteDescription` → 自动生成 answer;
3. 客人:自动展示 **answer QR** + 「复制文本」;
4. 房主:「扫描应答」→ 扫客人 answer QR(桌面无相机则粘贴文本)→ DataChannel `open`,进房。

**回退链:**
- 桌面无相机/浏览器 http 源(无 `getUserMedia`):复制粘贴(拷 offer → 贴入客人 → 拷 answer → 贴回房主,约 5–6 步)。桌面**只能展示** QR 的限制必须支持(展示不依赖 secure context 之外的任何权限)。
- 混合流(桌面有摄像头,如 MacBook):桌面展示 → 手机扫;手机展示 → 桌面摄像头扫。4 步。

**失败诊断(必须内建):**ICE `connectionState: failed` 或超时(建议 8–10 s)→ 提示「确认两台设备连接同一 Wi-Fi;路由器 AP 隔离/访客网络会阻断直连」。这是同 LAN 方案唯一系统性故障模式(mDNS 组播被禁)。

**生命周期与安全注记:**
- 一次性协商:DC 断开后重新走一遍配对(ICE restart 可留待后续票);单人模式 = 无信令路径,零影响。
- QR/人肉信道中间人风险在面对面场景可忽略;SDP 含 DTLS 指纹,如需增强可参考 QWBP 的可选 4 位 SAS 校验(https://github.com/magarcia/qwbp),非必需。
- 先例参考:Qivex/webrtc-via-qr(4 步双 QR,定位本地游戏,https://github.com/Qivex/webrtc-via-qr)、TomasHubelbauer/webrtc-qr-signaling-channel、QWBP(对称双扫 + 指纹定角色)。无大型已发售游戏采用,属 demo 级成熟度的模式——需现场实测扫码距离(QR v20+ 建议 25–40 cm,UNCERTAIN 待实测)。

## 六、双环境平台矩阵(2026-11 实测 + 一手来源)

| 能力 | 桌面 Chrome 158(实测) | Android WebView(Chromium) | iOS WKWebView(实测) |
| --- | --- | --- | --- |
| RTCPeerConnection/DataChannel | ✅ https/localhost;❌ `http://<LAN-IP>` 构造成功但 **ICE 收集为空(静默失败)** | ✅(BCD `webview_android: "mirror"`,Chrome 56+;确切首版 UNCERTAIN);**DataChannel 无需运行时权限** | ✅ 实测全流程可用(https 与自定义 scheme 均为 secure context);「15.4 起才完整支持」无一手出处(UNCERTAIN),2026 现状可用即够 |
| getUserMedia(扫码用) | ✅ 仅安全源(Chrome 47 起封锁 http) | ✅ 需 CAMERA/RECORD_AUDIO 运行时权限;**Capacitor 已内置转发**(BridgeWebChromeClient 处理 `VIDEO_CAPTURE→CAMERA`) | ✅ iOS 14.3 起进 WKWebView(https://webkit.org/blog/11353/);已知 WebKit bug 259304(capacitor:// 下 gUM aborted,仅影响扫码,不影响 DataChannel) |
| mDNS 混淆(候选 `.local` 化) | ✅ 默认(Chrome 74 起,2019-04;官方原帖已不可达,行为实测证实) | ✅(镜像 Chromium) | ✅(Safari TP 104 起,https://webkit.org/blog/10264/);Firefox 桌面默认开、**Firefox Android 默认关**(gecko-dev all.js) |

**Capacitor 侧关键配置(一手来源):**
- `server.androidScheme` 默认 **https**(Capacitor 5 起)、`server.hostname` 默认 localhost——官方文档明说这「allows the use of Web APIs that would otherwise require a secure context」(https://capacitorjs.com/docs/config)。**App 内 DataChannel 开箱可用,无需额外配置**。
- iOS 需在 Info.plist 声明 `NSLocalNetworkUsageDescription`(iOS 14+ 本地网络弹窗),否则 mDNS 解析/连 LAN 均被系统拒绝——**配对功能必需**。
- 仅当采用 LAN HTTP 服务器备选时才需:Android networkSecurityConfig(API 38 起 `usesCleartextTraffic` 已废弃)+ iOS `NSAllowsLocalNetworking`。

## 七、依赖清单与风险

| 依赖 | 版本(2026-11-27 实查) | 用途 | 风险评估 |
| --- | --- | --- | --- |
| (无)RTCPeerConnection | 浏览器标准 | 连接 + DataChannel | 平台行为差异已实测(mDNS/secure context);Chrome 142 起本地网络请求需权限弹窗、LNA for WebRTC 处于 Proposed(chromestatus)——浏览器侧 LAN WebRTC 未来可能被权限门控,**Capacitor 壳不受影响** |
| `uqr` | 0.1.3(2026-04,MIT,0 依赖) | QR 生成 | 低;备选 `qrcode` 1.5.4(2024-08,事实标准) |
| `@capacitor/barcode-scanner` | 3.1.4(2026-11-19,MIT,ionic-team,极活跃) | App 原生扫码 | 低;备选 `@capacitor-mlkit/barcode-scanning` 8.2.2(Apache-2.0,离线 ML Kit)——注意 capawesome 正把它迁向付费 Insiders 版,**有收费转向风险,不选** |
| `barcode-detector` polyfill | 3.2.5(2026-11,MIT) | 桌面浏览器扫码(有摄像头时) | 低;`jsQR` 1.4.0 实质停更(2021),功能稳定但仅作最后回退 |
| `fflate`(可选) | 0.8.3(2026-05,MIT,0 依赖) | QR 模块数优化 | 低;默认不启用 |

## 八、UNCERTAIN 清单(未落一手来源,写 spec 时留意)

1. 同 LAN 免 STUN 的规范明文(MDN 无直接表述;实测成立)。
2. mDNS 组播被禁时的浏览器回退行为(Chrome 官方原帖/chromestatus 条目已不可达)。
3. Android WebView 首个支持 RTCPeerConnection 的确切版本(BCD 为 Chrome 镜像值)。
4. WKWebView DataChannel 的确切可用起点(「iOS 15.4」说法无一手出处;2026 现状实测可用)。
5. QR v20+ 的实际扫码距离/成功率(需现场实测)。
6. 桌面 Safari 在 `http://<LAN-IP>` 下的 RTCPeerConnection 行为(无 headless 可测;预期同样要求 secure context)。

## 来源索引(全部 2026-11-27 核查)

- 库与元数据:https://github.com/dmotz/trystero (+ `docs/signaling.md`、`packages/*/src/index.ts`)、https://github.com/peers/peerjs (`lib/peer.ts`、`lib/util.ts`)、https://github.com/peers/peerjs-server、https://github.com/feross/simple-peer、https://registry.npmjs.org/{trystero,peerjs,simple-peer,uqr,qrcode,fflate,barcode-detector}/latest、https://api.npmjs.org/downloads/
- WebRTC 平台:https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Connectivity、https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection、https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia、https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts、https://w3c.github.io/mediacapture-main/(`[SecureContext]`)、https://w3c.github.io/webrtc-pc/(IDL 无 SecureContext)、https://datatracker.ietf.org/doc/draft-ietf-rtcweb-mdns-ice-candidates/、https://webkit.org/blog/10264/release-notes-for-safari-technology-preview-104/、https://webkit.org/blog/11353/new-webkit-features-in-safari-14-1/、https://github.com/mozilla/gecko-dev/blob/master/modules/libpref/init/all.js、https://chromestatus.com/features.json(LNA / Direct Sockets 条目)
- 移动壳:https://capacitorjs.com/docs/config、https://capacitorjs.com/docs/updating/5-0、https://developer.android.com/reference/android/webkit/WebChromeClient、https://developer.android.com/guide/topics/manifest/application-element、https://developer.apple.com/documentation/security/preventing-insecure-network-connections、https://github.com/ionic-team/capacitor(BridgeWebChromeClient)、https://bugs.webkit.org/show_bug.cgi?id=259304
- QR/实测参照:https://www.thonky.com/qr-code-tutorial/character-capacities、https://github.com/Qivex/webrtc-via-qr、https://github.com/TomasHubelbauer/webrtc-qr-signaling-channel、https://github.com/magarcia/qwbp、https://github.com/cozmo/jsQR、https://github.com/ggerganov/ggwave、https://caniuse.com/webnfc、https://github.com/cantoo-scribe/capacitor-http-server
- 本调研实测产物:headless Chrome 158(puppeteer-core)SDP/QR/压缩测量;macOS WKWebView Swift CLI(https / 自定义 scheme / http 三模式加载,DataChannel 全流程 + mDNS 候选 + secure context 判定)
