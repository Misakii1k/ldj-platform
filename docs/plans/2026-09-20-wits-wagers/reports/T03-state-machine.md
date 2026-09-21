# T03 报告：schema、初始状态、纯 reducer 与 timer effects

日期：2026-09-20。工作根：`D:\项目`，分支 main。
前置门：T02 已通过（纯函数版图、赔率、判胜、账本结算全部黄金算例通过）。

---

## 1. 目标与实现概述

根据 02 §3–§5、02 §8 与 04 §T03 要求，实现一智千金核心状态机、严格动作校验与计时器副作用调度：
- `types.ts`：定义完整的状态字段、动作联合体、公共事件、问题与终局结果类型。
- `schemas.ts`：zod strict schema 解析配置与动作；严格拒绝未登记字段（特别是 score/odds/answer/deadlineAt 等伪造字段）；限制数值为安全正整数（1..999,999,999,999）。
- `state.ts`：纯函数生成确定性 SHA-256 `roundToken`（结合 now, round, 4 次 PRNG 采样）；提供包含 7 道经审校样本题的测试级题库与 `createInitialState` / `createState` 构造函数；初始状态不排 effect。
- `reducer.ts`：纯 reducer 处理完整生命周期流转：
  - `created` + `begin` -> round 1 `answering`，排首个计时器；
  - `answering` + `submit_guess` -> 记录作答与 revision 递增；全员答齐触发提前翻牌进入 `arranging`（取消原 timer，排新 timer）；超时自动补 1（P1）；
  - `arranging` 3s 超时 -> `betting`；
  - `betting` + `set_bets` -> 验证筹码目标在版图、extraStake <= 余额、原子替换；
  - `betting` 超时 -> 统一结算账本、更新 score 与 winningGuesses、写入 history、进入 `settlement`（8s）；
  - `settlement` 超时 -> round 1..6 进入下一轮 answering；round 7 进入 `game_over` 并输出 `resultCandidate`；
  - `player_forfeited` -> 幂等标记退席；全员退席/提交提前推进。
- `invariants.ts`：全量状态不变量断言（人数 3..7、轮次、安全整数、题库 7 题、阶段特定约束、下注期余额不超限、版图槽位与赔率、timeoutAuthors 子集等）。

---

## 2. 改动路径

**新增**：
- `packages/games/wits-wagers/server/types.ts`
- `packages/games/wits-wagers/server/schemas.ts`
- `packages/games/wits-wagers/server/state.ts`
- `packages/games/wits-wagers/server/invariants.ts`
- `packages/games/wits-wagers/server/reducer.ts`
- `packages/games/wits-wagers/tests/schemas.test.ts`
- `packages/games/wits-wagers/tests/reducer.test.ts`
- `packages/games/wits-wagers/tests/invariants.test.ts`

**未修改**：
- 客户端代码、已由 C01 锁定的目录、平台内核共享文件。

---

## 3. 命令与测试结果

| 命令 | 退出码 | 结果 |
|---|---|---|
| `npx tsx --test packages/games/wits-wagers/tests/{schemas,reducer,invariants}.test.ts` | **0** | **15 tests 全部通过** |
| `npm run typecheck` | **0** | 通过 |
| `npx eslint packages/games/wits-wagers/{server,tests}/*.ts` | **0** | **0 error, 0 warning** |
| `npx tsx --test packages/games/wits-wagers/tests/*.test.ts packages/client/tests/witsWagersView.test.ts` | **0** | **54 tests 全部通过** |

### 关键测试覆盖场景
- **完整七轮推演（F01）**：虚拟时钟完整执行 7 轮流转，每轮验证 answering -> arranging -> betting -> settlement，最终 round 7 成功产生 `game_over` 与 `resultCandidate`，无残留计时器。
- **作答全员提前推进**：当 3 名活跃玩家全部提交猜测时，立即提前翻牌进入 `arranging`，取消旧 answering 计时器并按 `config.arrangingSeconds` 排定展示计时器。
- **作答超时系统补 1（G0 P1）**：超时玩家自动以 `origin: 'timeout'` 补 1，归集入 `timeoutAuthors`，结算时不给予作者 +3 奖励也不计入答对次数。
- **拒绝场景 X01 / X02 / X05 / X06 / X07**：资金不足、押注未分配目标、非系统发起控制动作、超时边界、陈旧 roundToken/revision 均严格拒绝。
- **退席机制**：`player_forfeited` 幂等生效，剩余活跃者均已答题时提前翻牌。

---

## 4. 遗留与下一任务

- 下一张任务卡：**T04（白名单视角、题库适配和 V2 包装）**。
- 无常驻进程，无需清理 PID。
