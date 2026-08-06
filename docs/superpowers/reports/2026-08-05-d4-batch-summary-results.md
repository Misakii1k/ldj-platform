# D4 批次执行汇总结果（A2 之后全部剩余门）

> 执行：`docs/superpowers/plans/2026-08-05-d4-batch-post-a2-execution-plan.md`（已批准）。全部变更保留在未提交工作树；未执行任何 Git 状态变更命令（仅只读 status/diff）；无真实供应商 LLM 调用；D4 完成仅进入总结与人工审阅。

## 结论

**14 门全部 PASS。** 批次新增：D4-U、D4-U-UI、D4-B、D4-B-UI、D4-UI3、D4-V + Playwright 基建；前序 8 门（0/f1/f2/t/ui0/a1/a2/tools）保持 PASS。终局 `npm run ci`（typecheck+lint+test+compliance:d1）+ build + build 后 compliance:d1 + `git diff --check` 全部通过；两份 D1 fixture SHA 不变；冻结 9 文件哈希逐字节一致；无 playable/权利/准入变更。

## 14 门证据

| 门 | 结果 | 报告 | 核心证据 |
| --- | --- | --- | --- |
| D4-0 | PASS | 2026-08-05-d4-0-results.md | 前序 |
| D4-F1 | PASS | 2026-08-05-d4-f1-results.md | 前序 |
| D4-F2 | PASS | 2026-08-05-d4-f2-results.md | 前序 |
| D4-T | PASS | 2026-08-05-d4-t-results.md | 前序 |
| D4-UI0 | PASS | 2026-08-05-d4-ui0-results.md | 前序 |
| D4-A1 | PASS | 2026-08-05-d4-a1-results.md | 前序 |
| D4-A2 | PASS | 2026-08-05-d4-a2-results.md | 前序 |
| D4-TOOLS | PASS | 2026-08-05-d4-tools-results.md + rule-trace | 前序（工具测试 64/64 复跑绿） |
| **D4-U** | PASS | 2026-08-05-d4-u-results.md | UNO 71/71（含 house 48）、注册 5/5、D1 黄金 4/4、boot 7/7、compliance:d1 PASS |
| **D4-U-UI** | PASS | 2026-08-05-d4-u-ui-results.md | Chromium 4/4：准入检测 + ruleset 路由成功链 + 宽/窄视口真实抽牌/出牌 |
| **D4-B** | PASS | 2026-08-05-d4-b-results.md | blank 九组 57/57、undercover 29/29、server 304/304、shared 105/105、registry 第二笔 |
| **D4-B-UI** | PASS | 2026-08-05-d4-b-ui-results.md | Chromium 4/4：视角不泄漏、30s 终局猜词、skip/submit 真实 action |
| **D4-UI3** | PASS | 2026-08-05-d4-ui3-results.md | Chromium 1/1：12 席位 dense 无交叠 + 视角隐私 |
| **D4-V** | PASS | 2026-08-05-d4-v-results.md | V2 49/49 + server 验证 5/5、measure-loc reduction 42.07%（target 869≤900）、playable-check 无 playable |
| 平台修复 | PASS | 2026-08-05-d4-b-platform-fixes-results.md | T1-T4 55/55（adjudicationTask 16 + Runner 17 + recovery 22） |
| P3 生产接线 | PASS | 并入 d4-b 报告 | dispatchTask 端到端 1/1 + boot/恢复 62/62 定向 |
| Playwright 基建 | PASS | 2026-08-05-d4-p0-results.md | build + Chromium 151 smoke 连续 3/3、零 LLM |

## 批次新增内容

### D4-U（uno_platform_house_v1）
- `packages/games/uno/server/index.ts` 导出 `unoHouseModule`/`UNO_HOUSE_VERSIONED_IDENTITY`；`shared/manifest.ts` 注册规则集（base 常量 + spread 保持 GameManifest 类型兼容）；`shared/game/catalog.ts` uno rulesets/setup 增 house（legacy 默认不变）；`registry.ts` 第一笔注册。

### D4-B（undercover_blank_v1）
- `packages/games/undercover/server/blank/**`（types/schemas/rules/module/bot）+ `tests/blank/` 九组 57 项按 plannedTestIds 映射；classic 行为与 D1 字节不变。
- `registry.ts` 第二笔：`resolveRulesetForStart` 聚合各模块声明规则集、`listGameManifests` 按 game 去重；（undercover, undercover_blank_v1）恰一条注册。
- 平台 `session.ts startGame` 通用 ruleset 路由修复（批次扩展授权）：先 `resolveRulesetForStart` 再 `getGameModule(moduleId, rulesetId)`，legacy 默认行为不变，无新增 game-id 分支。

### 平台修复（P1b T1-T4）与 P3 接线
- T1 attempts 持久化 primary_attempt_json + json_extract 退避 + ≥8 终态（消除 errored 热循环）；T2 runner invoker AbortSignal 真取消；T3 versionedRecovery `enqueue_adjudication` 对账 + receipt kind:none；T4 重放 at-most-once。
- P3：executor postCommit=handleCommitted、AdjudicationTaskQueue+dispatchTask（真实 invoker + AbortSignal）、queue start/stop 生命周期、结果经 ws.applyGameOutcome 广播。

### P4 UI 链
- 三门均先调用 `oil-frontend` skill（记录见各报告）；真实 Chromium Playwright 验收（每门仅跑自己 spec，先 `npm run build`）。
- 数据流修复：`UndercoverBlankStage` 猜词提交回传 `game_state` 信封 `sessionId`（平台校验 `taskEffect.sessionId === session.id`），使外部裁判任务真实入队、本地精确匹配链路可用。

### D4-V（werewolf_platform_open_kill_v1 模块级验证）
- 冻结 9 文件零改动（sha256 与 `compliance/d4/third-game-baseline.json` 逐字节一致）；新建 `packages/games/werewolf/server/v2/**`（V2 模块：规则/契约/bot/botPrompt）+ `tests/v2/` 49 项 + server 验证 5 项。
- `compliance/d4-v/target-manifest.json`；`measure-loc --target`：baseline=1500、target=**869**、reduction **42.07%**（≥40%）、baselineAllMatch=true。
- 注册决策（批次裁决）：v2 不注册平台 registry（真实接管需改 registry/session，违反 AC-01 与白名单）；以 GameModuleV2 契约套件 + 完整局/重放/恢复/视角泄漏/机器人合法性验证扩展性；open-kill 产品仍由冻结 legacy module 承载。

## 质量门（终局全量）

| 检查 | 结果 |
| --- | --- |
| `npm run ci`（typecheck + lint + test + compliance:d1） | PASS（exit 0） |
| `npm run build`（client dist） | PASS |
| build 后 `npm run compliance:d1` | PASS |
| `git diff --check` | PASS（无空白错误） |
| D1 fixture 双 SHA | UNO `e29db1cc2a9ac3e9bf38ea39ce75bcae1aeab66ebd8f491f4cdc8758701da9e6`、卧底 `38b011909f2945140a3007cfefb052cc47dfcbccc270869bdf3ec5897508ae68`（golden 测试 4/4 断言） |
| 冻结 9 文件 sha256 | 全部匹配 `compliance/d4/third-game-baseline.json` |
| `measure-loc` 基线锁定 | baselineAllMatch=true |
| `playable-check` | 输出「无 playable」 |

## 状态与声明

- **无变更**：playable、权利、发布、目录准入状态一律未改；全部规则集保持 `internal_prototype`。
- **冻结不变**：`werewolf_legacy_platform_v2` 语义（wolfKillScope=non_wolf）、`uno_legacy_platform_v1`、`undercover_classic_v1` 均保持可运行且未被替换。
- **未执行任何 Git 状态变更命令**；改动以未提交工作树保留，供用户单独授权版本控制操作。

## 延期项（如实标注）

1. **D4-V LOC 为 content-hash provisional**：权威 commit 对比 DEFERRED（本任务禁止 commits）；稳定原语 v1 声明 blocked（`stablePrimitivePromotionBlockedUntil` 未到）。
2. **D4-V v2 未注册平台 registry**：仅模块级验证（批次裁决）；若后续要做真实平台开局，需另窗口改为 `getGameModule(gameId, rulesetId)` 注册（AC-01 字面语义冲突，需单独授权）。
3. **blank fullGameMatrix 未并入**：driver 仅支持默认 ruleset，留待 blank admission 窗口；模块级 57/57 + server 集成已覆盖规则与裁判链路。
4. **perf.smoke.test.ts 全量并行内存 flake**：单独运行通过，与本批次无关。
5. **E2E 全量未并入 npm 默认 test**：`test:e2e` 需显式运行（webServer + Chromium），P6 已逐 spec 单独跑通。
