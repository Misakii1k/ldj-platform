# T05 报告：最小接入与持久化回归

日期：2026-09-20。工作根：`D:\项目`，分支 main。
前置门：T04 已通过（V2 模块、题库抽题、白名单视角与对拍）。

---

## 1. 目标与实现概述

根据 02 §2、04 §T05 要求，完成一智千金在平台共享核心中的最小注册与持久化测试：
- **注册表接入**：在 `packages/server/src/core/game/registry.ts` 中注册 `witsWagersModule`，通过 `(wits-wagers, wits_wagers_platform_v1)` 元组路由。
- **目录台账登记**：
  - `packages/shared/src/game/catalog.ts`：登记 `wits-wagers` 为 `availability: 'internal_prototype'`, `maturity: 'M1'`, `botSupport: 'none'`, `theme: 'ocean'`, `surface: 'board'`，初始未公开上线；
  - `compliance/d1/game-admission.json`：同步登记待审核条目，状态保持真实待审核，严禁虚构批准信息；
  - `scripts/d1-compliance.mjs` 校验 100% PASS。
- **目录单测修正**：`packages/shared/tests/catalog.test.ts` 中针对 `wits-wagers` 显式增加 `botSupport === 'none'` 期望，保留旧有 11 款游戏的断言。
- **持久化会话事务链**：
  - `packages/games/wits-wagers/tests/registry.test.ts`：验证模块、默认规则集、manifest 均正确解析；
  - `packages/server/tests/witsWagersSession.test.ts`：基于 `RoomCommandExecutor` 和 SQLite 验证 `begin` -> `answering`（产生 `schedule_timer` 落盘 `timers` 表）-> 答题 -> 全员答齐提前翻牌（原 timer 被 cancel，新 timer 产生）-> `arranging` 到期 -> `betting` 下注 -> `settlement` 结算写入；
  - `packages/server/tests/witsWagersRecovery.test.ts`：使用真实文件 SQLite 模拟服务崩溃断开，重开后通过 `runStartupRecovery` 验证崩溃恢复不换题、分数不重复结算、幂等性通过。

---

## 2. 改动路径

**新增**：
- `packages/games/wits-wagers/tests/registry.test.ts`
- `packages/server/tests/witsWagersSession.test.ts`
- `packages/server/tests/witsWagersRecovery.test.ts`

**修改**：
- `packages/server/src/core/game/registry.ts`（导入并注册 `witsWagersModule`）
- `packages/shared/src/game/catalog.ts`（登记 `wits-wagers`）
- `compliance/d1/game-admission.json`（登记待审核条目）
- `packages/shared/tests/catalog.test.ts`（同步目录状态与机器人能力断言）

---

## 3. 命令与测试结果

| 命令 | 退出码 | 结果 |
|---|---|---|
| `node scripts/d1-compliance.mjs .` | **0** | **D1 compliance: PASS** |
| `npx tsx --test packages/games/wits-wagers/tests/registry.test.ts packages/server/tests/witsWagersSession.test.ts packages/server/tests/witsWagersRecovery.test.ts packages/shared/tests/catalog.test.ts` | **0** | **13 tests 全部通过** |
| `npm run typecheck` | **0** | 通过 |
| `npx eslint <新文件及修改文件>` | **0** | **0 error, 0 warning** |
| `npx tsx --test packages/games/wits-wagers/tests/*.test.ts packages/client/tests/witsWagersView.test.ts packages/server/tests/witsWagers*.test.ts packages/shared/tests/catalog.test.ts` | **0** | **82 tests 全部通过** |

---

## 4. 遗留与下一任务

- 下一张任务卡：**T06（题库内容扩充与独立审校清单）** / **T07（前端组件与固定样例界面）**。
- 无常驻进程，无需清理 PID。
