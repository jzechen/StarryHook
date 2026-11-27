# Capacitor 安卓管线调研(票 #61)

> 调研票产出,供「任务:Capacitor 安卓脚手架」实现票直接取用。
> 调研日期:**2026-11-27**。分支 `research/capacitor-android`,基于 main(2758860)。
> 渲染与视口约束见 `docs/adr/0001`(PixiJS)、`docs/adr/0002`(固定逻辑分辨率信箱缩放);
> 票面背景见导航图 #58(移动壳 = Capacitor,安卓先行,iOS 随后)。
> 版本号一律「npm 实查 2026-11-27」标注;其余论断括注一手来源。

## TL;DR(三条结论)

1. **衔接成本极低,现有 vite 构建一寸不动**:Capacitor 只消费构建产物——`webDir: 'dist'` 指向 Vite 默认产物目录即可,`index.html`(在仓库根,vite build 会原样带进 dist)满足官方「webDir 内含带 `<head>` 的 index.html」要求;`cap init` 只新增 `capacitor.config.ts`,`cap add android` 只新增 `android/` 目录,不改 `src/` 与现有构建脚本 (capacitorjs.com/docs/getting-started;vite.dev/guide/cli)。
2. **两回路都官方支持,dev 回路的 cleartext 是唯一暗礁**:发布回路 = `pnpm build` → `npx cap sync`(copy + update);开发回路 = `vite --host` + `npx cap run android -l --port 5173`——CLI 会临时改写平台侧 config 且退出自动还原,cleartext 亦由 `cap run -l` 自动临时打开(CLI 源码 run.ts/livereload.ts/cordova.ts @ 8.6.3 逐行核实)。注意:**`--external` 是 Ionic CLI 的 flag,Capacitor 自家 CLI 8.x 没有**,它的 `-l` 已默认自动取本机局域网 IP。
3. **人类操作是硬边界,共 6 项**:Android Studio 安装、真机开发者选项 + USB 调试(手机上点 Build number ×7)、首连 USB 的 RSA 指纹授权、AVD 创建、release keystore 生成与保管、(远期)iOS Xcode + 签名 team——全部无法由 agent 代办,清单见文末附录;其中只有 keystore 是长期资产,丢了无法找回 (developer.android.com/studio/publish)。

---

## 一、cap init 与现有 vite 构建的衔接

### 1.1 本仓库现状(衔接面盘点)

- 纯浏览器 SPA:Vite ^7.1.0、TS ~5.9、PixiJS ^8.6.6;`index.html` 在仓库根,入口 `/src/main.ts`;
- **无 `vite.config.ts`**,Vite 全默认 → 产物目录 `dist`(vite.dev/guide/cli:`--outDir <dir>` "Output directory (default: `dist`)");
- `build` 脚本 = `tsc --noEmit && vite build`;包管理 pnpm 10、Node 24;
- 画布已就绪移动端:`touch-action: none` + `-webkit-user-select: none`(index.html),viewport meta 已有;
- 无任何 capacitor/cordova 依赖(全仓 grep 为空)。

Capacitor 对既有 web 项目的硬性要求只有三条:有 `package.json`、有构建产物目录(如 `dist` 或 `www`)、产物目录根部有**带 `<head>` 标签的 `index.html`**(插件注入需要)(capacitorjs.com/docs/getting-started)。本仓库三项全满足——`pnpm build` 后 `dist/index.html` 由 vite 从根 index.html 生成,含 `<head>`。

### 1.2 安装与 init(具体命令,pnpm 口径)

官方给的是 npm 形式,换算 pnpm(包名与语义不变):

```bash
pnpm add @capacitor/core
pnpm add -D @capacitor/cli
pnpm add @capacitor/android
pnpm exec cap init          # 生成 capacitor.config.ts
pnpm build                  # 先有 dist/
pnpm exec cap add android   # 生成 android/ 工程
```

- `@capacitor/core` = 运行时(WebView 桥);`@capacitor/cli` = 命令行工具;`@capacitor/android` = 安卓原生运行时模块,peerDep `@capacitor/core: ^8.6.0`(npm 实查 2026-11-27)。
- `cap init` 交互问三件事:app 名称、appId(反域名格式,如 `com.starryhook.game`)、**webDir**。CLI 会「尝试探测你 web 项目的默认目录」,但官方明确建议首跑 sync 找不到目录时回来核对 webDir——对本仓库需显式 `webDir: 'dist'` (capacitorjs.com/docs/getting-started)。CLI 8.6.3 源码中 init 的命令签名 `init [appName] [appId]` 带 `webDir` 选项,可一行非交互完成:`pnpm exec cap init "StarryHook" "com.starryhook.game" --web-dir dist`(cli/src/index.ts @ tag 8.6.3)。

生成的 `capacitor.config.ts`(发布回路形态,含 dev 回路切换注释):

```ts
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.starryhook.game',
  appName: 'StarryHook',
  webDir: 'dist',                    // ← vite 默认产物目录;必须含 build 后的 index.html
  // ── dev 回路才加,发布必须删除(官方警告勿提交进版本库)──
  // server: {
  //   url: 'http://192.168.x.x:5173', // vite dev server 的局域网地址(设备须同 Wi-Fi)
  //   cleartext: true,               // API 28+ 默认禁明文 http;live-reload 专用
  // },
};
export default config;
```

`server.*` 选项均为官方 config 引用页文档字段:`url`(加载外部 URL,**不用于生产**)、`cleartext`(默认 false;Android 自 API 28 起默认禁明文流量,live-reload 专用)、`allowNavigation`、`androidScheme`(默认 `'https'`,勿改)、`android.webContentsDebuggingEnabled`(dev 构建自动开启)(capacitorjs.com/docs/config)。

### 1.3 构建产物回路(发布形态)

每次 web 代码变更后,官方工作流就是固定三拍 (capacitorjs.com/docs/basics/workflow):

1. `pnpm build` —— 产出 `dist/`;
2. `npx cap sync` —— **copy + update 的合体**:copy 把 `webDir` 的构建产物拷进原生工程,update 按 `package.json` 更新原生插件与依赖;找不到 web assets 目录报错的修复就是把 webDir 改对;
3. `npx cap run android`(真机/模拟器)或 `npx cap open android`(进 Android Studio)。

子命令拆分(CLI 8.6.3 源码 `cli/src/index.ts`):`copy` = "copies the web app build into the native app";`update` = "updates the native plugins and dependencies based on package.json";`sync` 描述字面就是 `copy` + `update`。`open` 打开原生 IDE;`build` = "builds the release version of the selected platform"(终端/CI 出签名包)。

### 1.4 dev 服务器回路(live-reload,两种用法)

**A. CLI 托管式(推荐,改配置零手工)**:

```bash
pnpm dev -- --host        # vite: host 默认 'localhost';--host 监听所有地址含局域网 (vite.dev/config/server-options)
pnpm exec cap run android -l --port 5173
```

CLI 8.6.3 源码行为(一手核实):

- `-l, --live-reload`:"Set live-reload URL via CLI (uses defaults, overrides server.url config)";配套 `--host`、`--port`(**缺省 3000,对 vite 必须传 --port 5173**)、`--https`;host 缺省自动取本机局域网 IP,取不到才落 `localhost`(cli/src/tasks/run.ts:45);
- run 时自动把 `server.url` 写进 `android/app/src/main/assets/capacitor.config.json`,Ctrl+C 退出时自动还原(`CapLiveReloadHelper.edit/revertCapConfigForLiveReload`,livereload.ts);
- **明文 http 自动放行**:`run -l` 路径调用 `writeCordovaAndroidManifest(..., cleartext=true)`,由 CLI 在合并清单里写 `android:usesCleartextTraffic="true"`,退出时还原为 false(cli/src/tasks/run.ts:100/109 + cli/src/cordova.ts:869-877 @ 8.6.3)——即「cleartext 限制」在这条路上已被 CLI 处理,不用手改 manifest;
- 可加 `--forwardPorts <port:port>`:官方描述 "Automatically run 'adb reverse' for better live-reloading support"(cli/src/index.ts)。

**B. 手写 config 式(官方 live-reload 指南)**:在 capacitor.config 里写 `server.url = http://<LAN-IP>:8100` + `cleartext: true`,改完跑 `npx cap copy`,然后 IDE 里点 Run;官方警告「勿把 server 配置提交进版本库」(capacitorjs.com/docs/guides/live-reload)。对 vite 补一句:dev server 必须 `--host` 起在局域网可及地址,设备与本机同 Wi-Fi;模拟器里宿主机是 `10.0.2.2`(此条为 Android 模拟器通行约定,本指南未述,实现时按需用)。

**与预期不符的一个点**:`ionic cap run android -l --external` 里的 `--external` 是 **Ionic CLI** 的 flag(官方 live-reload 指南也用它);Capacitor 自家 CLI 8.6.3 的 run 命令没有 `--external`(flag 定义表里无此项,cli/src/index.ts)——脚手架票不要照抄 `--external`。

### 1.5 对「无 vite.config.ts」的影响

零影响:Capacitor 不读 vite 配置,只读它自己的 config + 产物目录。唯一动作是把 `webDir` 写成 `'dist'`(见 1.2)。若日后 vite 改了 outDir,只需同步改 capacitor.config 的 webDir 一处。

---

## 二、图标 / 启动屏 / 横竖屏

### 2.1 图标与启动屏素材:`@capacitor/assets`

- 安装 `pnpm add -D @capacitor/assets`(latest **4.0.0,2026-10-30**,engines node ≥ 20.9,npm 实查;官方指南注:旧版在 npm 12 下被 install-script 拦截,用 4.0.0+——capacitorjs.com/docs/guides/splash-screens-and-icons)。
- 源图放仓库根 `assets/` 目录,两种模式 (README github.com/ionic-team/capacitor-assets):
  - **Easy**:一张 `assets/logo.png`(SVG 亦可)+ 可选 `logo-dark.png`;
  - **Custom**:`icon-only.png`、`icon-foreground.png`、`icon-background.png`、`splash.png`、`splash-dark.png`;
  - 尺寸硬要求:icon 类 ≥ **1024×1024**,splash 类 ≥ **2732×2732**(jpg/png 皆可);
- 生成:`npx capacitor-assets generate --android`(平台互斥 flag);常用 flags:`--iconBackgroundColor`(默认 #ffffff)、`--iconBackgroundColorDark`(#111111)、`--splashBackgroundColor` / `--splashBackgroundColorDark`、`--logoSplashScale`(默认 0.2)、`--assetPath`、`--androidProject`(默认 `android`)。
- 落点:Android 侧写入 `android/app/src/main/res/` 的 `mipmap-*`(启动器图标,模板 manifest 引用 `@mipmap/ic_launcher` / `ic_launcher_round`,android-template @ 8.6.3)与 splash drawable(默认资源名 `splash`,由启动主题 `@drawable/splash` 引用,capacitor-plugins/splash-screen README)。README 未逐条列输出路径,实现票以生成器实际输出为准。
- 对本项目的取材建议:横屏像素游戏,icon 用现有鱼钩/鱼元素重绘 1024²;splash 建议纯色背景 + 居中小 logo(见 2.2 的 Android 12 限制)。

### 2.2 启动屏插件:`@capacitor/splash-screen`

- latest **8.0.2(2026-07-15)**,peerDep `@capacitor/core >=8.0.0`(npm 实查);安装后跑一次 `npx cap sync`。
- 默认行为:启动 splash 500ms 自动隐藏;config 可调:`launchShowDuration`(默认 500)、`launchAutoHide`、`launchFadeOutDuration`(默认 200)、`backgroundColor`、`androidScaleType`(默认 `FIT_XY`)、`splashFullScreen` / `splashImmersive` 等 (capacitor-plugins/splash-screen README)。
- **Android 12+ 硬限制**:系统接管启动 splash——全屏图变成「居中小图标 + 背景色」,且「Android 12 Splash Screen API 无法禁用,属 OS 行为」;背景色/scaleType/spinner 等多数选项在启动 splash 上不生效;项目对 Android 11- 用 androidx `core-splashscreen` 兼容库(Cap 8 模板 variables.gradle 里 `coreSplashScreenVersion = '1.2.0'`,GitHub 8.6.3 实查)(README + splash-screens-and-icons guide)。

### 2.3 横竖屏:锁横屏

- Capacitor config **没有**方向配置项——方向是纯 Android 声明:在 `android/app/src/main/AndroidManifest.xml` 的 `<activity>` 上加 `android:screenOrientation`(capacitorjs.com/docs/android/configuration 只述 manifest 位置,不涉 orientation)。
- 值语义 (developer.android.com/guide/topics/manifest/activity-element):
  - `"landscape"`:横屏,**固定**横放,忽略传感器;
  - `"sensorLandscape"`:横屏,但随传感器在正/反横屏间翻转,**且无视用户系统的旋转锁**;
  - 二者都会让 Google Play 只向支持横屏的设备分发(官方明示的过滤行为)。
- 对本项目(480×270 信箱缩放、ADR-0002)建议:**`android:screenOrientation="landscape"`**——像素游戏信箱在两个横握方向都要好看的话,`sensorLandscape` 才有意义;若不 care 倒持方向,`landscape` 行为最可预测。模板 MainActivity 本就带 `android:configChanges="orientation|...|screenSize|..."`,旋转/布局变化不重建 Activity(android-template @ 8.6.3),对 WebView 内容无冲击。
- 运行时另有官方插件 `@capacitor/screen-orientation`(8.0.2,npm 实查)可编程改方向,本票用不到,备查。

---

## 三、APK 构建与真机部署(完整步骤)

### 3.1 依赖链

| 组件 | 要求 | 来源 |
| --- | --- | --- |
| Node | ≥ 22(本机 24 ✓) | `@capacitor/cli` engines `node>=22`(npm 实查);官方 "NodeJS 22 or higher" (environment-setup) |
| Android Studio | **Capacitor 8 最低 2025.2.1** | capacitorjs.com/docs/getting-started/environment-setup |
| JDK | **21**(capacitor 模块 `sourceCompatibility JavaVersion.VERSION_21`,android/capacitor/build.gradle @ 8.6.3);Android Studio 会自动装合适的 JDK | 官方 environment-setup + 源码实查 |
| Android SDK | SDK Platform **API 24+**(最新稳定 Android 16 = API 36),经 SDK Manager 装;模板 compileSdk/targetSdk = **36**、minSdk = **24** | environment-setup + android-template/variables.gradle @ 8.6.3 |
| adb | 在 SDK `platform-tools/` | developer.android.com/tools/adb |
| Gradle | 模板自带 wrapper(`android/gradlew`),无需自装 | android-template 目录清单 @ 8.6.3 |

### 3.2 构建与部署逐步

**【人类操作】** 环节用前缀标出;其余步骤 agent 可直接执行。

1. **【人类操作】安装 Android Studio**(≥ 2025.2.1),首次启动随导向装齐 JDK 与 Android SDK(SDK Manager 勾 platform API 24+,实际选 36);若走纯命令行不用 AS,则需 cmdline-tools + `sdkmanager` 装 `platform-tools`、`platforms;android-36` 并设 ANDROID_HOME(developer.android.com/tools/adb、environment-setup)。
2. 仓库侧:`pnpm install` → `pnpm build` → `pnpm exec cap sync`(脚手架票一次性:`cap init` + `cap add android`,见 §一)。
3. **构建 debug APK(可不开 Android Studio)**:`cd android && ./gradlew assembleDebug`——产物 `android/app/build/outputs/apk/debug/app-debug.apk`,**已自动用 debug key 签名 + zipalign,可直接装机**;`./gradlew installDebug` 直接装到已连设备/模拟器 (developer.android.com/studio/build/building-cmdline)。
4. **【人类操作】真机准备(在手机上)**:
   - 设置 → 关于手机 → 连点 **Build number 7 次**("You are now a developer!")开启开发者选项(Pixel 路径;各家路径表见官方页);
   - 开发者选项里打开 **USB 调试**(Android 9+ 路径:Settings > System > Advanced > Developer Options > USB debugging);
   - USB 连接电脑后,设备弹出 **RSA 指纹授权对话框**(Android 4.2.2+ 机制),必须人手解锁并点允许 (developer.android.com/tools/adb)。
5. 验证与部署:`adb devices` 看到 device 即通;然后 `pnpm exec cap run android`(交互选目标,可用 `--list` 列出、`--target <id>` 指定)或 `adb -d install android/app/build/outputs/apk/debug/app-debug.apk` (building-cmdline;CLI 源码)。
6. **模拟器(无真机时)**:**【人类操作】在 Android Studio Device Manager(Welcome 屏 More Actions > Virtual Device Manager)创建 AVD**——选机型 → 选系统镜像(须 **API 24+**,官方明示模拟器镜像要求)→ Finish;之后命令行可复用:`emulator -list-avds` / `emulator -avd <name>` 启动,再走第 3、5 步 (developer.android.com/studio/run/managing-avds、building-cmdline)。
7. **无线调试(免插线)**:Android 11+ 支持——设备端 开发者选项 → Wireless debugging → Pair using pairing code,电脑端 `adb pair <ip:port>` 输入配对码,一次配对长期有效;新进展:Android 17 + adb 37.0.0 引入 adb Wi-Fi 2.0,设备回到可信网络自动重连 (developer.android.com/tools/adb)。
8. **Release 签名与发布包**:
   - **【人类操作】生成并保管 keystore**:`keytool -genkey -v -keystore my-release-key.jks -keyalg RSA -keysize 2048 -validity 10000 -alias my-alias`——私钥必须由人生成保管,丢了不能更新同应用 (developer.android.com/build/building-cmdline);
   - 签名三选一:Gradle `signingConfigs`(storeFile/storePassword/keyAlias/keyPassword → release buildType 挂 `signingConfig`);或手动 `zipalign` + `apksigner sign --ks ...`;AAB 只能 `jarsigner`(apksigner 不能签 AAB)(building-cmdline);
   - 或走 Capacitor CLI:`npx cap build android`(终端/CI 出签名 AAB/APK),签名参数放 config 的 `android.buildOptions`(keystore 路径/密码/alias,`releaseType: 'AAB' | 'APK'`,`signingType: 'apksigner' | 'jarsigner'`)(workflow docs + config reference);
   - debug 包用 debug key,不可上架 Play;release 包必须自有私钥(building-cmdline)。

---

## 四、iOS 侧现状盘点(只盘点,不建工程)

- **平台前提**:需一台 Mac + **Xcode 26.0+**(Capacitor 8 最低)(environment-setup)。
- **平台包**:`@capacitor/ios` 8.6.3(npm 实查),`pnpm exec cap add ios` 生成 `ios/` 工程;`npx cap open ios` 进 Xcode。
- **依赖管理**:CocoaPods 是 Capacitor 7(含)前的默认;**自 Capacitor 8 起 SPM 为默认**,仍可用 `npx cap add ios --packagemanager CocoaPods` 退回(environment-setup)。
- **系统下限**:iOS **15+** 支持;渲染用 WKWebView(/docs/ios)。
- **签名/账号**:模拟器运行无需付费开发者账号;真机需在 Xcode 的签名面板选 team——此条为业界通行口径,Apple 官方文档页当前 JS 渲染、无法直引原文,留作实现时的**待人工确认项**,不在本票展开。
- **一句话结论**:iOS 不在本票范围——安卓脚手架落地、真机跑通后,iOS 仅是「装 Xcode + `cap add ios` + 素材复用」的平移工作,时机与口径以图 #58「iOS 适配细化(安卓落地后)」为准。

---

## 五、Capacitor 主版本现状与 WebView 要求

### 5.1 版本现状(npm 实查 2026-11-27)

| 包 | latest | 发布日期 | 备注 |
| --- | --- | --- | --- |
| `@capacitor/core` | **8.6.3** | 2026-11-25 | 当前稳定主版本 = **8.x** |
| `@capacitor/cli` | 8.6.3 | 2026-11-25 | engines `node >=22` |
| `@capacitor/android` | 8.6.3 | 2026-11-25 | peerDep core ^8.6.0 |
| `@capacitor/ios` | 8.6.3 | 2026-11-25 | 同上 |
| `@capacitor/splash-screen` | 8.0.2 | 2026-07-15 | peerDep core >=8 |
| `@capacitor/screen-orientation` | 8.0.2 | 2026-10-02 | 运行时锁向备用 |
| `@capacitor/assets` | **4.0.0** | 2026-10-30 | 独立版本线,engines node ≥ 20.9 |

- 大版本节奏:7.0.0 发布于 **2025-01-20**,8.0.0 发布于 **2025-12-08**(npm time 实查;GitHub release 8.0.0 published_at 同日)≈ **年度一个大版本**;维护线补丁照发(dist-tags 仍有 latest-6/latest-7/latest-8.3/latest-8.4)。
- **v9 已在路上但未稳定**:`next` dist-tag = `9.0.0-rc.1`(android/ios),core 9.0.0-alpha.1(2026-05-08)、9.0.0-nightly(2026-11-26)——脚手架票锁 8.x 稳态,不追 next。
- 升级策略:官方口径 = 同步升 core/ios/android + CLI,保持四包同版(workflow docs);CLI 自带 `migrate` 命令("npx cap migrate",cli/src/index.ts)处理跨主版本迁移。

### 5.2 运行环境要求(Capacitor 8)

- **Android**:API **24+**(Android 7 或更高);**WebView 要求 Chrome 60+**(Android 7-9 由 Chrome 供 WebView,Android 10+ 用 Android System WebView);模拟器须 API 24+ 系统镜像;config 里 `android.minWebViewVersion` 默认 60(地板 55)(capacitorjs.com/docs/android + docs/config)。
- **iOS**:15+(见 §四)。
- **Node**:≥ 22(本机 24 ✓)。
- **SDK 线**:模板 minSdk **24** / compileSdk **36** / targetSdk **36**(android-template/variables.gradle @ 8.6.3 实查)。
- **与 Vite 的耦合**:无——Capacitor 只认 webDir 产物目录,不感知打包器与版本;vite 侧对应默认 `outDir: 'dist'`(vite.dev/guide/cli)。本仓库 Vite 7 + TS ESNext bundler 解析均可原样跑,唯一衔接点是 1.2 节的 `webDir: 'dist'`。

---

## 附:管线清单(端到端)

> [命令] = agent/终端可执行;[人类] = 必须人手完成。

0. [人类] 安装 Android Studio ≥ 2025.2.1(含 JDK 21 + SDK Platform API 24+ / 36)。
1. [命令] `pnpm add @capacitor/core && pnpm add -D @capacitor/cli && pnpm add @capacitor/android`。
2. [命令] `pnpm exec cap init "StarryHook" "com.starryhook.game" --web-dir dist`(appId 待实现票定)→ 生成 `capacitor.config.ts`。
3. [命令] `pnpm exec cap add android` → 生成 `android/` 工程(gradle wrapper 自带;建议随即把 `android/` 的构建产物 ignore 规则过目一遍)。
4. [命令] `npx capacitor-assets generate --android`(源图放 `assets/`,icon ≥1024²,splash ≥2732²)→ 图标/启动屏落 `android/app/src/main/res/`。
5. [命令] 改 `android/app/src/main/AndroidManifest.xml`:MainActivity 加 `android:screenOrientation="landscape"`(锁横屏)。
6. [命令] `pnpm build && pnpm exec cap sync`。
7. [命令] `pnpm exec cap run android --list` → `pnpm exec cap run android`([人类] 设备侧已完成第 9 步)。
8. [命令] 发布包:`cd android && ./gradlew assembleDebug`(免 AS)或 `npx cap build android`(release,AAB/APK);release 需先完成第 10 步。
9. **[人类] 真机一次性准备**:关于手机 → 连点 Build number ×7 → 开发者选项 → 开 USB 调试;USB 首连点「允许」完成 RSA 授权(或走无线:Wireless debugging 配对码 + `adb pair`)。
10. **[人类] 签名资产**:`keytool` 生成 release keystore 并离线保管;`android/app/build.gradle` 加 signingConfigs(密码不入库,走本地环境变量/gradle.properties 局部覆盖)。
11. **[人类] 模拟器(可选)**:Android Studio Device Manager 创建 API 24+ 镜像的 AVD;之后 [命令] `emulator -avd <name>` 启动即可复用。
12. (iOS,不建工程)仅盘点:需 macOS + Xcode 26+、`cap add ios`(SPM 默认),落地时机待图 #58 决策。

## 附:人类操作清单

- [ ] 安装 Android Studio(≥ 2025.2.1)并在 SDK Manager 里确认 Android SDK Platform(API 24+,建议直接 36)已装;
- [ ] 真机:设置里连点 Build number 7 次开启开发者选项;
- [ ] 真机:在开发者选项中启用 USB 调试;
- [ ] 真机首连:解锁手机并在 RSA 指纹弹窗上点「允许」(或配置 Wireless debugging 配对码完成 `adb pair`);
- [ ] 首次真机连接后跑一次 `adb devices` 由人类确认授权生效(agent 可发起,弹窗确认必须人点);
- [ ] (可选,免插线)设备端开启 Wireless debugging 并提供配对码给 `adb pair`;
- [ ] (可选,无真机)在 Android Studio Device Manager 创建 AVD(API 24+ 镜像);
- [ ] release keystore 的生成(keytool)与离线保管——私钥长期资产,agent 不应经手密码;
- [ ] (iOS,仅未来)安装 Xcode 26+、选择签名 team——本票不做;
- [ ] (iOS,仅未来)真机调试的 Apple ID / team 签名确认。

## 参考链接

- Capacitor 官方文档(v8):
  - 安装(现有项目):<https://capacitorjs.com/docs/getting-started>
  - 工作流(copy/update/sync):<https://capacitorjs.com/docs/basics/workflow>
  - Config 引用(server.*、android.*):<https://capacitorjs.com/docs/config>
  - 环境要求(AS 2025.2.1 / Xcode 26 / Node 22 / SPM 默认):<https://capacitorjs.com/docs/getting-started/environment-setup>
  - Android 平台(API 24+、WebView Chrome 60+):<https://capacitorjs.com/docs/android>
  - iOS 平台(iOS 15+):<https://capacitorjs.com/docs/ios>
  - 图标/启动屏指南(尺寸、Android 12 限制):<https://capacitorjs.com/docs/guides/splash-screens-and-icons>
  - Live reload 指南(server.url/cleartext、ionic -l --external):<https://capacitorjs.com/docs/guides/live-reload>
  - Android 工程配置(manifest 路径、applicationId):<https://capacitorjs.com/docs/android/configuration>
- Capacitor 源码与模板(tag 8.6.3,一手核实):
  - CLI run/live-reload flags:<https://github.com/ionic-team/capacitor/blob/8.6.3/cli/src/index.ts>(run 定义)/ <https://github.com/ionic-team/capacitor/blob/8.6.3/cli/src/tasks/run.ts>(cleartext 临时开启:100/109)/ <https://github.com/ionic-team/capacitor/blob/8.6.3/cli/src/util/livereload.ts>(server.url 自动写入与还原)/ <https://github.com/ionic-team/capacitor/blob/8.6.3/cli/src/cordova.ts>(usesCleartextTraffic 写入,869-877 行)
  - 安卓模板 SDK 线:<https://github.com/ionic-team/capacitor/blob/8.6.3/android-template/variables.gradle>(min 24 / compile+target 36 / core-splashscreen 1.2.0);JDK 21:<https://github.com/ionic-team/capacitor/blob/8.6.3/android/capacitor/build.gradle>
  - release:tag 8.0.0,published 2025-12-08(<https://github.com/ionic-team/capacitor/releases>)
- npm registry 实查(2026-11-27):`https://registry.npmjs.org/@capacitor/core|cli|android|ios|splash-screen|assets|screen-orientation`(dist-tags latest 与 time 字段)
- @capacitor/assets README:<https://github.com/ionic-team/capacitor-assets>(源图规格、flags)
- @capacitor/splash-screen README:<https://github.com/ionic-team/capacitor-plugins/blob/main/splash-screen/README.md>(config 项、Android 12 Splash API)
- Android 官方:
  - 命令行构建/签名(gradlew、zipalign、apksigner、keytool):<https://developer.android.com/studio/build/building-cmdline>
  - adb(USB 调试、RSA 授权、无线配对):<https://developer.android.com/tools/adb>
  - 开发者选项开启步骤:<https://developer.android.com/studio/debug/dev-options>
  - AVD / Device Manager:<https://developer.android.com/studio/run/managing-avds>
  - screenOrientation 取值与 Play 过滤:<https://developer.android.com/guide/topics/manifest/activity-element>
- Vite:CLI(outDir 默认 dist)<https://vite.dev/guide/cli>;server 选项(port 5173、host: true 监听局域网)<https://vite.dev/config/server-options>
