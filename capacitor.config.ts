import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.starryhook.game',
  appName: 'StarryHook',
  // Vite 默认产物目录;必须先 pnpm build 再 cap sync(票 #65 / 调研 #61)
  webDir: 'dist',
  // ── dev 回路(live-reload)才加,发布必须删除,勿提交激活态 ──
  //   pnpm dev -- --host
  //   pnpm exec cap run android -l --port 5173
  // (CLI 会临时写 server.url + cleartext 并在退出时还原;-l 自动取本机局域网 IP;
  //  注意 Capacitor CLI 8.x 没有 --external flag,那是 Ionic CLI 的)
  // server: {
  //   url: 'http://192.168.x.x:5173', // 设备与本机须同 Wi-Fi;模拟器宿主机为 10.0.2.2
  //   cleartext: true,                // API 28+ 默认禁明文 http,live-reload 专用
  // },
};

export default config;
