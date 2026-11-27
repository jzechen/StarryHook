---
name: run-game
description: 启动 StarryHook dev 服务并用无头 Chrome 实机截图验收;当用户要求实机跑、看观感、验收 UI/指引/面板,或需要游戏内截图时使用
---

# run-game:实机运行与截图验收

启动 dev 服务,用 puppeteer-core 驱动系统 Chrome 跑真实游戏,按动作序列截图。

## 步骤

1. **清残留端口**:`lsof -i :5173` 有监听则 `kill <pid>`(vite 残留进程会服务旧 transform,是头号干扰源)。
2. **启动服务**(仓库目录,后台):`pnpm dev`,确认日志出现 `Local:` 且 `curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/` 返回 200。
3. **驱动环境**(一次性,仓库外):`mkdir -p /tmp/starryhook-run && cd /tmp/starryhook-run && npm init -y && npm i puppeteer-core`;Chrome 固定路径 `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`。
4. **写场景脚本**:import 本技能目录的 `cdp-shot.mjs`,传动作序列(JSON 数组,按序执行):
   `[{shot:"01-boot"}, {hold:{key:"ArrowRight",ms:4800}}, {shot:"02-near-exit"}, {tap:"KeyE"}, {click:"#backpack-entry"}]`
   常用 flag:`--seed "river:496:206:right"`(开局预置玩家位置,见下)、`--out <dir>`、`--port`。
5. **看图**:逐张 Read 截图,人眼核对(空白帧 = 启动失败);把「before/after」对照写进验收结论。

## 预置玩家位置(seed)

存档键 `starryhook:player-position`,形状 `{mapId, x, y, facing}`(世界像素,脚部点)。
用 `--seed` 让脚本经 `evaluateOnNewDocument` 在**新文档任何脚本前**下种——
直接 `localStorage.setItem` 再 reload 会被旧页面的位置自动落盘(0.25s 节流)竞态覆盖。

可行走点判定:水层 gid=0 = 陆地、非零 = 水;tileset `collision` 属性的 deco 同样阻挡——
查点脚本见 `scripts/character-sprite.test.mjs` 同款 JSON 解析,或直接读 `src/world/*.json`。

## 已知坑

- 残留 vite:见步骤 1;build 失败先查端口再查代码。
- headless rAF 节流:launch 参数必须含 `--disable-background-timer-throttling --disable-renderer-backgrounding`(脚本已内置);纯 `--screenshot` 时机不可控,一律走 CDP。
- 底部帮助行与场景横幅曾重叠(#45 实机验收发现)——新增底部居中的 UI 时截图核对这一带。
- localStorage 位置快照跨 run 残留:换场景前先 `localStorage.clear()` 或显式 seed。
- 小游戏实时伺服不可行:CDP 回路仅 ~4–6Hz,罩不住 0.08 轨宽的同步窗(人类 60Hz 无此
  瓶颈)——此类实时判定语义走测试层验收(真实 CoreLoop 集成),截图只验视觉存在性。
