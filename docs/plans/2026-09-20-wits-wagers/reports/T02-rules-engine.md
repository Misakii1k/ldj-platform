# T02 报告：纯函数赔率、判胜、账本

日期：2026-09-20。工作根：`D:\项目`，分支 main。
前置门：T01 已通过（契约修订 C01；包骨架、manifest 与客户端严格视角 parser 完成）。

---

## 1. 目标与实现概述

根据 01 §3、01 §4 与 04 §T02 要求，实现一智千金核心纯函数逻辑：
- `board.ts`：版图槽位与赔率常量查表（`buildBoard`）、胜出目标判定（`pickWinningTarget`）。
- `scoring.ts`：单人账本结算（`settlePlayer`）、整轮结算（`settleRound`）、终局排名与并列判定（`computeRankings`）。
- 测试：将 `golden-cases.json` 复制到 `tests/`，对 35 组数值黄金算例（B01–B08, W01–W08, S01–S12, R01–R03, K01–K03, F01）及核心边界用例逐项断言，严禁修改预期值。

---

## 2. 改动路径

**新增**：
- `packages/games/wits-wagers/server/board.ts`
- `packages/games/wits-wagers/server/scoring.ts`
- `packages/games/wits-wagers/tests/board.test.ts`
- `packages/games/wits-wagers/tests/scoring.test.ts`
- `packages/games/wits-wagers/tests/golden-cases.json`（从规划目录原样复制）

**未修改**：
- 共享入口、客户端代码、服务端现有会话/注册表。

---

## 3. 命令与测试结果

| 命令 | 退出码 | 结果 |
|---|---|---|
| `npx tsx --test packages/games/wits-wagers/tests/board.test.ts packages/games/wits-wagers/tests/scoring.test.ts`（实现前） | **1** | `ERR_MODULE_NOT_FOUND`（TDD 红阶段确认） |
| `npx tsx --test packages/games/wits-wagers/tests/board.test.ts packages/games/wits-wagers/tests/scoring.test.ts`（实现后） | **0** | **13 tests 全部通过** |
| `npm run typecheck` | **0** | 通过（strict indexed checks 兼容） |
| `npx eslint packages/games/wits-wagers/{server,tests}/*.ts` | **0** | **0 error, 0 warning** |
| `npx tsx --test packages/games/wits-wagers/tests/*.test.ts packages/client/tests/witsWagersView.test.ts` | **0** | **39 tests 全部通过** |

### 覆盖黄金用例明细
- **B01–B08**：1..7 个唯一猜测值的槽位分配与赔率查表（含偶数猜测无 C 槽中心留空验证）。
- **W01–W08**：胜出目标判定，含下限超出判 smaller、精确命中、极大数等。
- **S01–S12**：账本收支唯一公式，含未放置筹码 extraStake=0、两枚同槽各自生效不合并等。
- **R01–R03**：整轮结算、获胜作者 +3（超时补答不奖励作者也不计答对次数）、全超出 smaller 胜出无作者奖励。
- **K01–K03**：终局排名（按积分、获胜猜测次数、原始席位稳定排序），标准比赛名次（如 1, 1, 3）。
- **F01**：完整七轮推演（score 序列 7 -> 28 -> 91 -> 280 -> 847 -> 2548 -> 7651）。

---

## 4. 遗留与下一任务

- **无未解决阻碍**。
- 下一张任务卡：**T03（schema、初始状态、纯 reducer 与 timer effects）**。
- 无常驻进程，无需清理 PID。
