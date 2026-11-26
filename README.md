# StarryHook

类星露谷的独立钓鱼小游戏(浏览器,TypeScript + PixiJS)。

## 开发

```bash
pnpm install
pnpm dev      # http://localhost:5173
```

- 调参:手感参数集中在 `src/config.ts`,Vite 热更即时生效
- 复现:`http://localhost:5173/?seed=123` 可复现一整局随机序列
- 术语:见 `GLOSSARY.md`;技术决策:见 `docs/adr/`
