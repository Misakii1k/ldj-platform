# D4-B P1b 平台修复 T1–T4 结果

> 按已批准批次计划第 3 步（P1b，Agent B 窗口）执行：平台修复 T1–T4，严格 TDD（每项 Red 只跑对应定向测试），不做 app.ts P3 接线（该接线为后续独立窗口，工作树中已有的 P3 接线不属本次变更）。
> 日期：2026-08-06。

## 结论

**P1b（T1–T4）：PASS。**

- **T1（HIGH-1 热重试循环）**：`errored` 任务不再被同一轮无限重新认领；attempts 持久化于 `primary_attempt_json`，SQLite `json_extract` 按 attempts 计算指数退避 `nextRetryAt`（1s→2s→4s→8s→16s→30s 封顶）；attempts ≥ 8 进入终态（`discarded`），永久可诊断、不再占用队列。
- **T2（超时真取消）**：runner `#invoke` 注入受控 `AbortController`，provider invoker 契约接受 `AbortSignal`；超时先触发 `controller.abort()` 真正取消底层请求（而非 naive `Promise.race` 的孤儿连接），AbortError 仍映射 `timeout`。
- **T3（trailing-event 对账）**：`versionedRecovery.reconcileEffects` 增加 `enqueue_adjudication` 分支，receipt `kind:'none'` 单独处理（不抛、不重复入队）；重放只对账 DB 行，零 provider 调用。
- **T4（at-most-once 防御）**：`replayUnappliedAdjudicationResults` 对同 taskId 已存在 `external_task_result` 事件时跳过，reducer 副作用幂等。

三个定向测试文件合计 **55/55 全绿**；server typecheck 中本白名单无类型错误。

## 文件范围（白名单）

| 文件 | 动作 | 结果 |
| --- | --- | --- |
| `packages/server/src/core/adjudication/taskStore.ts` | 修改 | T1：attempts 持久化到 `primary_attempt_json`、`json_extract` 退避、attempts≥8 终态 |
| `packages/server/src/core/adjudication/taskQueue.ts` | 修改 | T1/T4：调度消费退避与终态；`replayUnappliedAdjudicationResults` at-most-once 幂等 |
| `packages/server/src/core/adjudication/runner.ts` | 修改 | T2：invoker 契约接受 `AbortSignal`，超时真实 abort，AbortError→timeout |
| `packages/server/src/core/game/versionedRecovery.ts` | 修改 | T3：`enqueue_adjudication` + receipt `kind:'none'` 对账分支 |
| `packages/server/tests/adjudicationTask.test.ts` | 修改 | T1/T4 定向断言（含既有 A1 断言） |
| `packages/server/tests/adjudicationRunner.test.ts` | 修改 | T2 定向断言（含既有 A2 断言）；P3 链路测试一处 TS 收窄修复 |
| `packages/server/tests/recovery.test.ts` | 修改 | T3 定向断言（含既有 D3 V2 恢复断言） |
| `docs/superpowers/reports/2026-08-05-d4-b-platform-fixes-results.md` | 新建 | 本报告 |

说明：T1–T4 的实现与定向测试在进入本窗口时已存在于共享未提交工作树（先前中断的尝试遗留）。本次按严格 TDD 逐项重建 Red→Green 证据：对每项实现增量做临时回退（模拟修复前行为）→ 跑对应定向测试得到 Red → 恢复实现得到 Green，证明断言非空转。恢复后四个源文件与备份逐字节一致（`diff` 为空），本窗口净变更只落在白名单。

## 环境修复（仅 node_modules，非仓库变更）

- `node_modules/@esbuild/win32-x64/esbuild.exe` 缺失导致 `tsx` 无法启动。已从 npm registry tarball 手工补回该二进制到 `node_modules/`（gitignore 内，不影响任何被跟踪文件）。
- 确认 `package.json`/`package-lock.json` 的 diff 仍是既有 P0 变更（`test:e2e`、`playwright:install` 脚本与 `@playwright/test` 依赖），本窗口未再改动。

## T1 Red→Green（adjudicationTask.test.ts）

**Red 实现**：`markAdjudicationTaskErrored` 改回"不持久化 attempts、无终态"，`nextPendingAdjudicationTask` 改回"errored 立即可认领"。

命令（只跑对应定向测试）：

```
npx tsx --test packages/server/tests/adjudicationTask.test.ts
```

**Red 结果**（3 项确定性失败 + 1 项热循环挂起，共 16 项）：

```
✖ T1：markAdjudicationTaskErrored 把 attempts 持久化到 primary_attempt_json
    AssertionError: attempts 应持久化到 primary_attempt_json（actual: null, expected: true）
✖ T1：nextPendingAdjudicationTask 用 json_extract 按退避跳过未到期 errored 任务
    AssertionError: 退避未到期不得调度（actual: errored 任务被返回, expected: undefined）
✖ T1：8 次失败进入终态（discarded），不再被调度
    AssertionError: attempts>=8 应进入终态（actual: 'errored', expected: 'discarded'）
T1：errored 任务退避窗口内不被热循环重试 —— 进程挂起（errored 被无限重新认领，
    正是 HIGH-1 热循环症状；`--test-timeout` 下亦无法结束）
ℹ tests 16 · pass 0（定向子集 3 fail）· 进程被外部终止
```

**Green 恢复实现**后同命令结果：

```
ℹ tests 16 · pass 16 · fail 0（exit=0）
```

## T2 Red→Green（adjudicationRunner.test.ts）

**Red 实现**：`AdjudicationProviderInvoker` 改回单参（无 `AbortSignal`），`#invoke` 不创建/不传递 `AbortController`（naive race、不真正取消）。

命令：

```
npx tsx --test packages/server/tests/adjudicationRunner.test.ts
```

**Red 结果**（17 项中 1 项失败）：

```
✖ T2：invoker 收到 AbortSignal，超时 abort 且不泄漏超时计时器
    AssertionError: invoker 应收到 AbortSignal（actual: false, expected: true）
ℹ tests 17 · pass 16 · fail 1
```

**Green 恢复实现**后：

```
ℹ tests 17 · pass 17 · fail 0（exit=0）
```

## T3 Red→Green（recovery.test.ts）

**Red 实现**：`reconcileEffects` 删除 `enqueue_adjudication` 分支（trailing adjudication 落到 timer 对账 → receipt `kind:'none'` 抛错）。

命令：

```
npx tsx --test packages/server/tests/recovery.test.ts
```

**Red 结果**（22 项中 3 项失败）：

```
✖ T3：trailing enqueue_adjudication 对账——缺失行按 effect 恢复，receipt kind:none 不抛错
    Error: 计时器 effect receipt 类型错误（reconcileTimerEffect → reconcileEffects → replayVersionedTrailingEvents）
✖ T3：已有任务行 immutable 一致时不重复入队、不改状态
    AssertionError: Got unwanted exception. Actual message: "计时器 effect receipt 类型错误"
✖ T3：已有任务行 immutable 字段不一致 → 对账失败关闭（抛错）
ℹ tests 22 · pass 19 · fail 3
```

**Green 恢复实现**后：

```
ℹ tests 22 · pass 22 · fail 0（exit=0）
```

## T4 Red→Green（adjudicationTask.test.ts）

**Red 实现**：`replayUnappliedAdjudicationResults` 删除 `alreadyApplied` 事件查重（无条件重复注入）。

命令：

```
npx tsx --test packages/server/tests/adjudicationTask.test.ts
```

**Red 结果**（16 项中 1 项失败）：

```
✖ T4：replayUnappliedAdjudicationResults 幂等——同 taskId 不重复 reducer 副作用
    AssertionError: 已应用结果不应重复注入（1 !== 0；第二次重放再次触发 reducer 副作用）
ℹ tests 16 · pass 15 · fail 1
```

**Green 恢复实现**后：

```
ℹ tests 16 · pass 16 · fail 0（exit=0）
```

## 最终验证

三个定向测试合并运行：

```
npx tsx --test packages/server/tests/adjudicationTask.test.ts \
         packages/server/tests/adjudicationRunner.test.ts \
         packages/server/tests/recovery.test.ts
ℹ tests 55 · pass 55 · fail 0 · cancelled 0 · skipped 0（exit=0）
```

依赖 sanity：

```
npx tsx --test packages/shared/tests/rules.adjudicationPolicy.test.ts → 10/10
npx tsc -p tsconfig.server.json --noEmit → 本白名单 0 错误
```

server typecheck 中其余错误全部位于其他并行窗口的在途文件（`packages/games/undercover/**/blank/**` 属 Agent A P2、`packages/games/werewolf/tests/v2/**` 属主模型 P5），不属于本白名单，未触碰。adjudicationRunner.test.ts 中 P3 链路测试的一处 TS 收窄问题（`let capturedBody` 在请求闭包内赋值导致 `never`）已做行为等价的局部修复（`const capturedText: string = capturedBody ?? ''` + `assert.ok(capturedText)`），测试行为与结果不变。

## 约束核验

- 未执行任何 Git 状态变更命令（仅只读 `git status`/`git diff`/`git check-ignore`）。
- 未改 `app.ts`/`registry.ts`/`catalog.ts`/`games/**`/`client/**`/`e2e/**`/`package.json`/`scripts/**`/`compliance/**`/migrations。
- 无 v9 / 新 settings / 新迁移；不改 D1 / playable / rights / admission。
- 测试全程使用 stub 模块 / 本地 mock 上游，无真实 LLM 调用。
- 未 commit；全部变更保留在未提交工作树。

## 遗留项（后续窗口）

- **P3 生产接线（app.ts）**：工作树中已存在先前接入的 `createAdjudicationInvoker` 与队列接线（含 T1/T2 依赖与 `ws.applyGameOutcome`），本窗口未评审/未改动；其集成验收（blank 完整局 + 恢复矩阵）留给 D4-B P3 报告。
- **全量质量门**（`npm run typecheck` 全量 / lint / `npm test` / build 前后 `compliance:d1` / `git diff --check` / D1 双 SHA）按批次计划由 P6 统一执行；当前 typecheck 噪声来自 A（blank）与主模型（werewolf v2）在途文件。
- **T1 终态诊断细节**：attempts≥8 直接进入 `discarded`（终态保留可诊断的 `primary_attempt_json`），不做自动恢复；由恢复/人工复核处理。
