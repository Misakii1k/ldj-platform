# D4-A2 与后续门实施计划

> **执行要求：** 使用 `executing-plans`，按 Red → Green → Refactor 分批执行；不创建 worktree、不提交、不执行任何 Git 状态变更命令。当前共享未提交工作树继续作为唯一集成面。

**目标：** 先完成可独立于 D4-U 的 D4-A2 白板裁判 policy/runner 门，再按依赖顺序准备 D4-B、UI 门和 D4-V。

**架构：** A2 保持两层边界：`adjudication-policy` 是无 I/O 的纯函数，`adjudication-runner` 只负责受控 provider 调用、主备决策和结构化结果；A1 的 taskQueue 仍负责持久任务、独立调度和系统动作回灌。A2 本轮严格不改生产 app、恢复、设置或迁移；首个真实消费者 D4-B 获得独立批准后，再把 app 接线、尾事件任务对账和 blank reducer 一起做端到端闭环。

**技术栈：** TypeScript/Node 24、node:test + tsx、SQLite v8 `adjudication_tasks`、现有 `llmProtocol`/safe upstream 工具、Zod/严格 JSON（沿用仓库现有模式）。

---

## 一、执行边界与协调

### 本次批准后立即实施：仅 D4-A2

严格使用主计划 A2 白名单：

- Create `packages/shared/src/game/rules/adjudication-policy.ts`
- Create `packages/shared/tests/rules.adjudicationPolicy.test.ts`
- Create `packages/server/src/core/adjudication/runner.ts`
- Modify `packages/server/src/core/llmProtocol.ts`
- Create `packages/server/tests/adjudicationRunner.test.ts`
- Modify `packages/shared/src/game/rules/index.ts`
- Create `docs/superpowers/reports/2026-08-05-d4-a2-results.md`
- 保存本批准方案为 `docs/superpowers/plans/2026-08-05-d4-a2-and-next-gates-execution-plan.md`

明确禁止：

- 不新增 migration v9；D4 迁移只允许 v7/v8。
- 不改 `package.json` / `package-lock.json`。
- 不改 `packages/games/uno/**`、`packages/client/**`、D1 fixtures、playable/权利/准入。
- 不改 `packages/server/src/app.ts`、`versionedRecovery.ts`、`taskStore.ts`、`taskQueue.ts`、settings/config；这些属于后续真实消费者接线窗。
- Red 阶段只跑对应定向测试，避免破坏另一窗口的质量门。

### 并行文件域

- 本窗口 A2：shared rules + server adjudication runner/llmProtocol/tests。
- 另一窗口 D4-U：`packages/games/uno/**` + `packages/client/**`。
- 两边不并发修改 `packages/server/src/core/game/registry.ts`；D4-B 等 D4-U 交付后再启动。

---

## 二、D4-A2 任务拆解

### Task 1：冻结 policy API 与归一化行为

**文件：**

- Create `packages/shared/src/game/rules/adjudication-policy.ts`
- Create `packages/shared/tests/rules.adjudicationPolicy.test.ts`
- Modify `packages/shared/src/game/rules/index.ts`

**Red：** 先写以下精确行为测试：

1. `blank-normalization-v1` 应用 NFC。
2. trim 外围 Unicode whitespace，并把内部 Unicode whitespace 连续段折叠为一个 ASCII 空格。
3. 仅对 Latin 字母执行 lowercase，保留标点，不做简繁转换或同义推断。
4. 规范化后按 Unicode code point 计数，接受 1–64；non-BMP 字符计 1。
5. 在 whitespace 折叠前拒绝换行、Unicode 行/段分隔符和控制字符，避免换行被错误吞成空格。
6. 本地精确相等直接为 `equivalent`。
7. provider 分类只接受六类：`equivalent`、`not_equivalent`、`uncertain`、`provider_error`、`timeout`、`invalid_response`。
8. 主结果 `equivalent`/`not_equivalent` 为终局结果，不触发备用；其余四类触发备用。
9. 备用仍非明确时 fail closed 为猜错；只有任一明确 `equivalent` 判正确。
10. 迟到结果资格判定只接受：task/session 未结算、taskId 与 expectedSequence 匹配、结果尚未应用；具体白板 provisional 胜负仍留给 B reducer。

**Green：** 最小实现下列纯函数/类型：

- `normalizeBlankAdjudicationText`
- `classifyLocalExactMatch`
- `parseAdjudicationClassification`
- `shouldInvokeFallback`
- `finalizeAdjudicationDecision`
- `isAdjudicationResultEligible`

所有函数无网络、无数据库、无时钟、无日志、无全局状态。

**验证：**

- `npx tsx --test packages/shared/tests/rules.adjudicationPolicy.test.ts`
- 期望：先因模块缺失/断言不满足而 Red，Green 后全部通过。

### Task 2：扩展结构化 LLM protocol

**文件：**

- Modify `packages/server/src/core/llmProtocol.ts`
- Test through `packages/server/tests/adjudicationRunner.test.ts`

**Red：** 测试协议层：

1. provider 输入的业务字段严格只有 `normalizedStandardAnswer`、`normalizedGuess`、`adjudicationPolicyVersion`。
2. 请求提示/结构化 schema 不含 room、player、nickname、role、chat、ballot、API key、请求头或主模型结论。
3. 主/备请求分别从同一最小输入重新构造，备用载荷不可观察主结论。
4. 响应必须为严格 JSON/结构化 classification；未知键、未知类别、空文本、非 JSON 均映射 `invalid_response`。
5. 明确 timeout 由 runner 映射为 `timeout`，不泄露完整上游响应。

**Green：** 在既有 `buildInferenceRequest`/`extractText` 上追加裁判专用构造与解析函数，不改变机器人现有协议行为。自动化不调用真实供应商。

### Task 3：实现注入式主/备 adjudication runner

**文件：**

- Create `packages/server/src/core/adjudication/runner.ts`
- Create `packages/server/tests/adjudicationRunner.test.ts`

**公共结构：**

- runner 接受两个彼此独立的 provider invoker（primary/fallback）和可控 timeout/clock/logger 依赖。
- `dispatch(task)` 严格解析 `inputPlaintextJson`，只接受三项批准字段。
- 本地精确匹配不调用 provider。
- 每次 provider 调用都从批准字段重新构造请求；备用调用参数不包含主响应或主 classification。
- 返回有界结果：最终 classification、来源（local/primary/fallback/fail_closed）、policyVersion，以及不含明文/密钥/请求头的 bounded attempt 摘要。
- provider 错误作为结构化分类参与回退；只有非法任务输入、内部不变量或真正崩溃才抛异常，让 A1 taskQueue 标为 `errored` 并由恢复续跑。

**TDD 用例：**

1. 本地 exact：0 次 provider 调用。
2. 主 `equivalent`：不调备用，结果正确。
3. 主 `not_equivalent`：不调备用，结果猜错。
4. 主 `uncertain`/`provider_error`/`timeout`/`invalid_response`：各触发一次独立备用。
5. 备用 `equivalent` 可翻转为正确；备用其他结果 fail closed 为猜错。
6. 两个 provider 调用输入对象独立；备用看不到主结论。
7. 输入字段白名单与日志红线测试。
8. timeout/Abort、非法响应、双失败均返回结构化结果。
9. 模拟首次进程级异常、第二次重试成功，验证 runner 本身不消费任何猜词机会。
10. 将 runner 作为现有 A1 `dispatchTask` 可编程替身的直接替代，验证输出可被 taskQueue 回灌且同 taskId 不产生重复 reducer 副作用；测试只组装现有公开 API，不修改 A1 文件。

**定向命令：**

- `npx tsx --test packages/server/tests/adjudicationRunner.test.ts`
- `npx tsx --test packages/shared/tests/rules.adjudicationPolicy.test.ts packages/server/tests/adjudicationRunner.test.ts packages/server/tests/adjudicationTask.test.ts`

### Task 4：A2 审阅、全量质量门与报告

**主模型只读审阅：**

- diff 只落在上述白名单。
- policy 无 I/O；runner 不直写权威游戏状态。
- provider payload/日志无秘密字段。
- fallback 由独立请求构造，未携带 primary 结果。
- 无真实供应商自动化调用。
- 无 migration/package/admission/playable 变更。

**完整质量门：**

1. 目标测试全绿。
2. `npm run typecheck`
3. `npm run lint`
4. `npm test`
5. `npm run compliance:d1`（build 前）
6. `npm run build`
7. `npm run compliance:d1`（build 后）
8. `git diff --check`
9. 明确复核两份 D1 SHA-256：
   - UNO `e29db1cc2a9ac3e9bf38ea39ce75bcae1aeab66ebd8f491f4cdc8758701da9e6`
   - 卧底 `38b011909f2945140a3007cfefb052cc47dfcbccc270869bdf3ec5897508ae68`

**报告：** `docs/superpowers/reports/2026-08-05-d4-a2-results.md` 记录每轮 Red/Green、完整命令输出、隐私断言、主备隔离证据，并明确：A2 runner 已可注入，但生产 app 接线与 trailing-event task 对账仍待 D4-B 的独立接线窗。

---

## 三、A2 后的独立授权点：D4-B

A2 通过后不自动开始 B。先确认：

1. 另一窗口 D4-U 已完成、出具 `2026-08-05-d4-u-results.md`，并释放 `registry.ts`。
2. 单独批准 B 以及以下最小白名单扩展：
   - `packages/server/src/app.ts`：executor postCommit → taskQueue，runner 注入，queue start/stop，outcome 走 `ws.applyGameOutcome`。
   - `packages/server/src/core/game/registry.ts`：注册 `undercover_blank_v1`；与 UNO house 注册串行合并。
   - `packages/server/src/core/game/versionedRecovery.ts`：识别 `enqueue_adjudication` + receipt `kind:'none'`，重放不调用 provider。
   - `packages/server/src/core/adjudication/taskStore.ts`：提供幂等 task 对账；尾事件已提交但 postCommit 落库失败时，可按 effect 恢复缺失 pending 行，已有行必须校验 immutable fields。
   - `packages/server/src/core/adjudication/taskQueue.ts`：修复 `errored` 任务在同一轮被立即重新 claim 的热循环；采用持久化 attempts + 有界退避/重试上限，永久非法输入必须停留为可诊断终态，不得占满队列。
   - `packages/server/src/core/adjudication/runner.ts`：把每次 provider 调用的 `AbortSignal` 纳入 invoker 契约；runner 超时必须既映射为 `timeout`，又真正取消底层真实请求，避免孤儿连接累积。
   - `packages/server/tests/recovery.test.ts`：覆盖 trailing event 恢复、receipt 冲突失败关闭、重放零 provider 调用。
   - `packages/server/tests/adjudicationTask.test.ts` / `packages/server/tests/adjudicationRunner.test.ts`：覆盖永久非法任务无热循环、重试上限/退避、主备请求超时传播取消。

B 按 `UNDERCOVER-BLANK-*` 九组依次 TDD：GOV → SETUP/ROLE → WIN → GUESS → FINAL → NORM → ADJ → ASYNC → TASK。模块只新增 blank 规则集；classic 仅导出可复用纯函数，不改行为或 D1 字节。最后跑白板规则机器人完整局、async continuation、provisional override、恢复矩阵、classic 黄金回放和全量质量门，产出 `2026-08-05-d4-b-results.md`。

---

## 四、后续总顺序

1. **现在：D4-A2**（与 D4-U 并行，文件不相交）。
2. **D4-U 完成 + A2 完成后：单独批准 D4-B**（含上述生产接线/恢复对账扩展）。
3. **UI 门：** D4-U-UI、D4-B-UI、D4-UI3；先由单一 owner 建 e2e/tabletop 共享基座，所有 UI 门实施前必须调用 `oil-frontend`，真实 Playwright 验收，不并发抢写 `tabletop/`。
4. **最后 D4-V：** 依赖 TOOLS、UI3 骨架复用证据、U/B 回归；逐条完成 AC-01..AC-11 与 LOC ≥40% provisional 测量。
5. **全部 14 门完成后：** 只进入总结与人工审阅，不自动开始新游戏、稳定原语 v1 或权威 commit 对比。
