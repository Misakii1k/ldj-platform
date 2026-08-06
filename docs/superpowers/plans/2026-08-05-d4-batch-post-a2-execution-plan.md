# D4 批量执行计划（A2 之后全部剩余门：U、U-UI、B、B-UI、UI3、V + Playwright 基建）

> 前置：D4-A2 已 PASS（8/14 门绿）。本计划一次性完成剩余 6 门 + Playwright 基础设施，三子代理并行，registry 串行独占。全部变更保留在未提交工作树；不执行任何 Git 状态变更命令（仅只读 git status/diff）。

## 第 0 步：保存本计划
将本计划全文写入 `docs/superpowers/plans/2026-08-05-d4-batch-post-a2-execution-plan.md`（writing-plans 规范：精确文件路径、TDD Red→Green 步骤、可被子代理执行的完整 brief）。

## 第 1 步：P0 Playwright 基础设施（Agent C 第一项）
- Modify 根 `package.json`：`npm install -D @playwright/test`（用户已批准根 package.json 变更）；scripts 增 `test:e2e`、`playwright:install`。
- Create `playwright.config.ts`：testDir `e2e/`，baseURL `http://127.0.0.1:3178`，workers 1；webServer = `node packages/server/src/index.ts`，env `{PORT:3178, DATA_DIR:<临时目录>, LOG_LEVEL:warn}`（不配 LLM env → llmAvailable=false，机器人走规则模式，自动化零真实供应商调用），`/health/live` 就绪探针。
- Create `e2e/helpers/wsClient.ts`：Node 端原生 WebSocket 客户端，复刻 `packages/server/tests/gatewayGame.test.ts` 的成熟模式（等 welcome、request/waitFor、createRoom/joinRoom/ready/startGame/gameAction/waitGameState）；可选复用 `tests/helpers/seedRoom.ts` 建行逻辑。
- Create `e2e/smoke.spec.ts`：Node WS 建房 + 浏览器加入并断言渲染。**基座完成判据 = smoke 通过。**
- `npx playwright install chromium`。

## 第 2 步：P1a D4-U 收尾（Agent A 第一；本窗口接管，registry 第一笔独占）
- Modify `packages/games/uno/server/index.ts`：导出 `unoHouseModule`（house/module.ts 已存在）。
- Modify `packages/games/uno/shared/manifest.ts`：注册 `uno_platform_house_v1`。
- Modify `packages/shared/src/game/catalog.ts`：uno rulesets += `uno_platform_house_v1` + setup。
- Modify `packages/server/src/core/game/registry.ts`：注册 `unoHouseModule`。
- TDD：先写注册断言（Red）→ 接线（Green）→ 质量门 → Create `docs/superpowers/reports/2026-08-05-d4-u-results.md`（42 个 house 测试等全绿）。

## 第 3 步：P1b 平台修复 T1-T4（Agent B 第一；core/adjudication/* 域独占）
- **T1 热重试循环（HIGH-1）**：Modify `taskStore.ts`/`taskQueue.ts` — attempts 持久化到 `primary_attempt_json`，`json_extract` 计算 `nextRetryAt` 带退避，attempts ≥8 终态（现状 errored 任务被无限热循环）。Red 断言 → Green。
- **T2 超时真取消**：Modify `runner.ts` — `#invoke` 改 AbortController，invoker 签名接受 `AbortSignal`（safeUpstream.safeFetch 已支持 signal）；AbortError 仍映射 timeout。Red 断言注入 signal 收到 abort。
- **T3 trailing-event 对账**：Modify `versionedRecovery.ts` + `tests/recovery.test.ts`：`reconcileEffects` 增加 `enqueue_adjudication` 分支 + receipt `kind:'none'` 单独处理（不抛、不重复入队）；重放零 provider 调用。
- **T4 at-most-once 防御**（可选）：`replayUnappliedAdjudicationResults` 幂等（同 taskId 不重复 reducer 副作用）。

## 第 4 步：P2 blank 规则集九组 TDD（Agent A 第二；packages/games/undercover/** 域独占）
- 复核 `compliance/rules/undercover_blank_v1.json`（18 条款/68 plannedTestIds），逐条 TDD。
- Create `packages/games/undercover/server/blank/**`（rules/schemas/bot/types/module）+ `tests/blank/**`；`versionedModule.ts` 注册 `undercover_blank_v1`；classic 仅导出可复用纯函数，**不改行为、不改 D1 字节**。
- 九组顺序：GOV → SETUP/ROLE → WIN → GUESS → FINAL → NORM → ADJ → ASYNC/TASK（每组 Red→Green 定向测试）。
- Create 集成测试（`packages/server/tests/` 新文件，走 gatewayGame.test.ts 真实 WS 模式）：白板规则机器人完整局 + async continuation + provisional override + 恢复矩阵 + classic 黄金回放回归。

## 第 5 步：P3 生产接线（Agent B 第二；依赖 T1-T2 与 P2 模块完成）
- Modify `packages/server/src/app.ts`：executor 创建处注入 `postCommit = handleCommitted`；创建 `AdjudicationTaskQueue` + `dispatchTask`（真实 invoker = `llmProtocol.buildAdjudicationSystemPrompt/UserPrompt` + `parseAdjudicationResponse` + `safeUpstream.safeFetch`，支持 AbortSignal；primary/fallback 均从现有单一 LlmConfig 构造，**不新增设置键、不新增迁移**）；queue start/stop 随 app 生命周期；adjudication outcome → `ws.applyGameOutcome` + ws 输出。
- `registry.ts` 第二笔（blank）由 Agent A 独占完成（串行）。
- 集成验证：blank 完整局 + 恢复矩阵（T3/T4）全绿。
- Create `docs/superpowers/reports/2026-08-05-d4-b-results.md`（P2+P3 全部证据）。

## 第 6 步：P4 UI 链（Agent C，串行单 owner；client/** + e2e/** 独占）
**每个 UI 门实施前必须调用 `oil-frontend` skill；真实 Chromium Playwright 验收；`tabletop/` 目录仅 C 写。**
- D4-U-UI：client uno/types.ts 扩展 house view 解析（消费服务端 tabletopProjection 或按既有 asPlayerView 推导）+ `viewRegistry.ts` 注册 `(uno, uno_platform_house_v1)` + `GamePage.tsx` 接线；Create `e2e/uno-house.spec.ts`（Node 驱动对局 + 浏览器真实操作出牌断言）。报告 `2026-08-05-d4-u-ui-results.md`。
- D4-B-UI：client undercover 扩展 blank 视角（无词方/有词方、30 秒终局猜词 UI）+ viewRegistry 注册 + GamePage 接线；Create `e2e/undercover-blank.spec.ts`。报告 `2026-08-05-d4-b-ui-results.md`。
- D4-UI3：werewolf 12 人桌面 — Create `e2e/werewolf-tabletop.spec.ts`（11 Node 玩家 + 1 浏览器同房，SeatRing dense 模式断言 12 席位无交叠、视角不泄漏）。报告 `2026-08-05-d4-ui3-results.md`（AC-03 tabletop skeleton 证据）。

## 第 7 步：P5 D4-V（主模型，依赖全部前置）
- **冻结 9 文件零改动**（`werewolf/server/module.ts`、`bot.ts`、`botPrompt.ts`、`shared/manifest.ts`、5 个 test 文件 — sha256 与 `compliance/d4/third-game-baseline.json` 逐字节一致，保证 measure-loc 基线锁定不破 + AC-09 语义冻结天然满足）。
- Create `packages/games/werewolf/server/v2/**`（V2 模块复刻 open-kill 规则：角色分配、夜杀/守卫/女巫/猎人/白痴、日讨论投票/逐出/遗言、胜负判定、计时、视图遮滤、机器人口径）— 走 GameModuleV2 模板复用共享原语（versionedContract/契约测试/tabletopProjection/botDriver）。
- Create `compliance/d4-v/target-manifest.json`（兼容 measure-loc CLI `--target` 格式：targetSourceFiles 指向 v2 实现文件）。
- TDD：AC 断言测试（Red）→ 实现（Green）→ 冗余削减（Refactor）。
- Measure：`node scripts/d4/measure-loc.mjs --root . --target compliance/d4-v/target-manifest.json` → 冻结 9 文件 hash 一致 + target 有效 LOC ≤ 900（1500×0.6）→ reductionPercent ≥ 40%（content-hash 正数，权威 commit 对比 DEFERRED，如实标注）。**不改 scripts/d4/** 与 scripts/tests/d4/**。
- AC-01..AC-11 逐条验收（映射主计划 L565-577 与 baseline acceptance 键）；`playable-check` 通过；报告 `docs/superpowers/reports/2026-08-05-d4-v-results.md`。

## 第 8 步：P6 全量验证与汇总
- 14 门逐门复核证据；质量门全套：定向/npm test 全绿 → `npm run typecheck` → `npm run lint` → `npm test` → `npm run compliance:d1`（build 前）→ `npm run build`（client dist，E2E 前置）→ `npm run compliance:d1`（build 后）→ `git diff --check` → D1 双-SHA 按 `compliance/d1/game-admission.json` 现值逐份核对（不硬编码）。
- 产出汇总报告；此后只进入总结与人工审查（**不自动**开新游戏/稳定原语 v1/权威 commit 对比）。

## 并行编排
- Agent A（general-purpose）：P1a → P2 → registry 第二笔 → B 报告。域：games/uno/server/index.ts、games/uno/shared/manifest.ts、shared/game/catalog.ts、games/undercover/**。
- Agent B（general-purpose）：P1b → P3。域：core/adjudication/*、core/game/versionedRecovery.ts、tests/recovery.test.ts、app.ts。
- Agent C（general-purpose）：P0 → P4 UI 链。域：根 package.json、playwright.config.ts、e2e/**、client/**。
- 主模型：P5 D4-V、P6 汇总与全量质量门、阶段间信号校验。
- **冲突矩阵**：registry.ts/catalog.ts 仅 A；core/adjudication/* + app.ts + recovery.test.ts 仅 B；client/**/e2e/**/根 package.json 仅 C；undercover/** 仅 A；werewolf/server/v2/** 仅主模型；packages/server/tests/ 新文件分域：A（blank 集成）、B（recovery）、主模型（V2 完整局）。
- 信号协议：A/B/C 每完成阶段即报告；主模型在 P1a 完成核第一笔注册、P3 完成后跑一次全量 `npm test`、P4 全完后取 ui3 curriculum 证据交 P5。

## 硬约束（原样保留）
- 不执行任何 Git 状态变更命令；不改 D1 fixtures 字节 / playable / 权利 / 准入；迁移只限 v1..v8（无 v9）；冻结 9 文件零改动；Red 阶段只跑定向测试；自动化不调用真实供应商模型；不并发修改 registry.ts/catalog.ts/tabletop；全部变更留在未提交工作树。
- 风险提示：D4-V target ≤900 有效 LOC 有压力；若超限通过共享原语提取与冗余削减达成，如实写入报告（不降阈值、不改测量脚本）。
