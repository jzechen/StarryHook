# Subagent workflow(实现者 → merger)

本仓库的多代理实现流程:每张实现票由一个**实现者**子代理在自己的 worktree 完成,
由一个 **merger** 子代理串行并入整合分支。主检出是 merger 的专属操作域。

## 主检出纪律

主检出(`/Users/jzechen/work/ts/StarryHook` 的工作目录)归 merger。实现者:

1. 在自己的 worktree 工作(harness 分配的,或自建 `StarryHook-worktree-<票号>`);
2. 开工第一步 = 自检两命令:`pwd` 确认在自己的 worktree、
   `git rev-parse --abbrev-ref HEAD` 确认在自己的票分支;
3. 在自己的 worktree 里完成全部编码、提交与收尾合并
   (`git merge <整合分支> --no-edit`);
4. 进入主检出之前先停:那是 merger 的操作域——把发现写进报告,由主代理处置。

merger:

1. 串行执行:同一时刻主检出只进一个 merger;
2. 进场先 `git checkout <整合分支> && git status --short` 确认干净;
   发现外来未跟踪/未提交文件 → 原样保留并在报告里指出,不吞不删;
3. 合并后复跑 `pnpm test && pnpm typecheck && pnpm build` 再报告;
4. 报告合并结果前先 `git branch --merged <整合分支>` 核实各票分支状态,
   不凭记忆断言「某分支未并入」。

## 实现者简报模板

每张实现票的简报必含以下七项,缺一即按本文件补齐:

1. 工单号与 `gh issue view <n> --json title,body` 读取指令;
2. 上下文指针(整合缝笔记路径 + 本票相关回写节);
3. worktree 自检两命令(见上);
4. `pnpm install --frozen-lockfile`;
5. 调用 TDD skill;
6. 收尾 `git merge <整合分支> --no-edit`;
7. 纪律:commit 署名 `Co-Authored-By: Claude Code <noreply@anthropic.com>`、
   不 push、不动其它票内容、冲突最小侵入。

## 整合分支与共享笔记

- 整合分支按 effort 命名(如 `world-v2`、`ui-polish-2`),基于当时主线开出;
  全部票合并并 review 修复后,由人决定推 origin / 合回主线。
- 跨票事实写仓库外的共享笔记(当前:
  `/Users/jzechen/work/ts/StarryHook-spec-notes/01-integration-seams.md`);
  实现完成后回写「实施结果回写」节——下一张简报只给指针,不抄内容。
