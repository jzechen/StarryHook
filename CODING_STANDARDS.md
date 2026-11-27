# Coding Standards

review 代理按本文件执法;实现代理由 review 兜底,不必预读。

## 生成管线必须断言输出差异

任何资产生成/派生脚本(图集切片、精灵派生、贴图转换)在落盘前必须断言输出与
输入或相邻帧存在真实差异(如逐帧像素差 > 0),死帧/空输出拒写盘;并配一条契约
测试钉住该断言。

先例:`scripts/generate-character-sprite.mjs` + `scripts/character-sprite.test.mjs`。
教训:`character.png` 的帧 1–3 曾被历史派生复制成帧 0,行走换帧静默失效,
直到整个世界 spec 实现完成才被发现——有输出差异断言即可在生成当刻拦截。
