# T04 报告：白名单视角、题库适配与 V2 包装

日期：2026-09-20。工作根：`D:\项目`，分支 main。
前置门：T03 已通过（状态机生命周期、schemas、invariants、reducer）。

---

## 1. 目标与实现概述

根据 02 §3、02 §6 与 04 §T04 要求，完成一智千金的服务端白名单视角构建、题库适配与标准 `GameModuleV2` 接口包装：
- `question-bank.zh-CN.ts` 与 `questions.ts`：静态导入首批 10 道符合规范的中文题库（正整数答案、权威来源、年份与口径说明、`reviewed: true`），提供 `selectQuestions` 确定性抽题与校验。
- `views.ts`：实现 `buildPublicView`、`buildPlayerView`、`buildSpectatorView`：
  - 作答期（answering）不向公共视角公开 board（保持为空）和 publicBets（保持为空）；
  - 题目对象仅暴露 `prompt` 与 `unit`，绝不提前暴露答案、来源与解释；
  - 非参赛者调用 `buildPlayerView` 恒返回 `me: null`，绝不抛出私密 State；
  - 观战视角严格无 `me` 键（非 `me: null`）；
  - 下注期前 `reserved: 0`，结算后不再预留；
  - 揭晓与终局阶段投影已公开的 `RoundResult` 与 `FinalResult`。
- `packages/client/src/game/wits-wagers/types.ts`：**补齐 T01 遗留口子**，对 `revealed`、`history`、`result` 实施严格白名单守卫（字段名、数据类型、正整数答案、比赛排名格式等），非法字段直接失败关闭。
- `module.ts` 与 `index.ts`：导出 `witsWagersModule`（实现 `GameModuleV2` 全部接口，包括 `parseConfig`、`parseAction`、`parseState`、`parsePlayerView`、`parseSpectatorView`、`assertInvariants`、`snapshotMigrations: {}`、`registeredRulesets: ['wits_wagers_platform_v1']`）。

---

## 2. 改动路径

**新增**：
- `packages/games/wits-wagers/server/question-bank.zh-CN.ts`
- `packages/games/wits-wagers/server/questions.ts`
- `packages/games/wits-wagers/server/views.ts`
- `packages/games/wits-wagers/server/module.ts`
- `packages/games/wits-wagers/server/index.ts`
- `packages/games/wits-wagers/tests/questions.test.ts`
- `packages/games/wits-wagers/tests/views.test.ts`
- `packages/games/wits-wagers/tests/privacy.test.ts`
- `packages/games/wits-wagers/tests/module.test.ts`

**修改**：
- `packages/client/src/game/wits-wagers/types.ts`（补齐 `revealed`、`history`、`result` 内部结构白名单解析）
- `packages/client/tests/witsWagersView.test.ts`（增加 `revealed`、`history`、`result` 白名单与失败关闭断言）

---

## 3. 命令与测试结果

| 命令 | 退出码 | 结果 |
|---|---|---|
| `npx tsx --test packages/games/wits-wagers/tests/{questions,views,privacy,module}.test.ts` | **0** | **15 tests 全部通过** |
| `npm run typecheck` | **0** | 通过 |
| `npx eslint <新文件及修改文件>` | **0** | **0 error, 0 warning** |
| `npx tsx --test packages/games/wits-wagers/tests/*.test.ts packages/client/tests/witsWagersView.test.ts` | **0** | **69 tests 全部通过** |

### 关键测试覆盖场景
- **隐私边界**：非参赛者 `me === null`，观战视角严格无 `me` 键；作答阶段公共事件与视角均无他人数值与标准答案。
- **视角完整性**：created -> answering -> arranging -> betting -> settlement -> game_over 各阶段字段投影精确对应，无越界与未登记键。
- **题库格式**：静态题库条目格式与数据源核验，`selectQuestions` 抽题唯一性与数量保证。
- **模块契约**：V2 `witsWagersModule` 接口完整性、序列化与快照反序列化（`parseState`）严格通过不变量断言。
- **客户端对拍**：客户端 parser 补齐并锁死 `revealed`、`history`、`result`，未知键与非法字段均直接失败关闭。

---

## 4. 遗留与下一任务

- 下一张任务卡：**T05（最小接入与持久化回归：共享写点 registry、catalog、game-admission、session/recovery 测试）**。
- 无常驻进程，无需清理 PID。
