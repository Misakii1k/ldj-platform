# D5 P1c：稳定原语 v1 评估取证（2026-08-06）

> 角色：Agent C（P1c）只读取证。依据：`compliance/d4/third-game-baseline.json` L213（`stablePrimitiveV1Gate`）与 spec L245-251（原语成熟度·稳定原语）。本报告只采集**现有证据**，不新写代码。
> 评估基线：commit A 工作树（HEAD = `b9bf4586cd1942fcc6cfdd3dc6dfccae5b833d7f`）。P1a（werewolf v2 平台注册）此时**尚未完成**，相关条目如实标注「依赖 P1a」。

## 结论

**稳定原语 v1 在 P1a 完成前不能声明 —— DEFERRED。**

除「P1a/commit B」三项依赖外，其余成熟度门的现有证据全部通过或已具备模块级证据。可声明的前提是 GAP-1（v2 平台注册）、GAP-2（权威 commit 对比终稿）、GAP-3（v2 客户端接线 + e2e 真实开局）三关全部闭合。

## 证据来源（本窗口复跑，均为现网工作树值）

| 命令 | 结果 |
| --- | --- |
| `npx tsx --test "packages/games/uno/tests/*.test.ts" "packages/games/undercover/tests/*.test.ts"` | **52 pass / 0 fail** |
| `npx tsx --test "packages/games/werewolf/tests/v2/*.test.ts"` | **49 pass / 0 fail** |
| `npx tsx --test packages/server/tests/werewolfV2Validation.test.ts` | **5 pass / 0 fail**（完整局、确定性重放、不可变性、契约+视角泄漏门、超时驱动） |
| `npx tsx --test packages/server/tests/recovery.test.ts` | **22 pass / 0 fail** |
| `npx tsx --test "packages/shared/tests/*.test.ts"` | **105 pass / 0 fail** |
| `node scripts/d4/measure-loc.mjs --root . --json` | `baselineAllMatch=true`、`baselineTotal=1500`、`provisional=true` |

说明：UNO/卧底/恢复/共享套件的测试命令用 glob 形式（`npx tsx --test <目录>` 会被当作单文件导入报 `ERR_MODULE_NOT_FOUND`，目录形式在本环境不可用；glob 形式结果与 D4-V 报告计数一致）。

## 逐条件评估表

| # | 条件（来源） | 证据 | 判定 | 缺口 |
| --- | --- | --- | --- | --- |
| C1 | UNO 与卧底相关回归全部通过（spec L247） | 52/52 复跑绿；D1 黄金回放/注册断言保持（D4-B 汇总：uno 71/71、undercover 29/29） | **通过** | 无 |
| C2 | 至少一款第三方验证游戏真实复用（spec L248） | werewolf v2 模块级复用：49/49 定向测试 + werewolfV2Validation 5/5，直接复用 GameModuleV2 模板（`packages/shared/src/game/versionedContract.ts`）、共享契约套件、botDriver 接口。**平台级注册未完成**：`registry.ts` 未加入 `werewolfV2Module` | **现状：模块级证据通过；平台级真实复用待 P1a 后补** | GAP-1：P1a 注册 + 注册断言（`sessionIdentity.test.ts` 增 open_kill→v2 解析断言） |
| C3 | 确定性重放/快照恢复/不可变性/视角泄漏（spec L249） | 共享契约套件 `versionedContractAssertions`（`packages/shared/tests/helpers/versionedGameContract.ts`：`deterministic`/`pure`/`rejectedDoesNotAdvance`/`snapshotReplayable`/`noSecretLeak`/`viewSchemas`/`resultOnlyOnce`）被 v2 `contract.test.ts` 直接复用（6 用例）；werewolfV2Validation 5/5（含重放/不可变/泄漏门）；恢复 recovery.test.ts 22/22 | **通过** | 无 |
| C4 | 机器人和真人动作共用同一合法性入口（spec L250） | `botLegalCandidates` 契约断言（机器人候选动作均被 reducer 接受）；v2 `bot.ts` 只读玩家视角纯函数，产出动作经 `parseAction`+`reduce` 与真人同入口；`pickV2BotAction` 实现 shared `BotDecisionInput` 接口，由平台 botRunner 驱动 | **通过** | 无 |
| C5 | 7 类基础设施直接复用 ≥6 且不复制实现（baseline sevenInfrastructure / spec L919） | 平台层 7 类归属：room（`shared/src/domain/room.ts`+server commands）、transactions（`server/src/core/game/session.ts`）、recovery（`server/src/core/recovery.ts`+`versionedRecovery.ts`）、broadcast（`gateway/ws.ts`）、timers（`server/src/core/game/timerRunner.ts`）、botDriver（`server/src/core/game/botRunner.ts`+`BotDecisionInput`）、tabletopSkeleton（client 共享 UI）。v2 对平台内部**零导入**（见 C6），room/transactions/recovery/broadcast/timers/botDriver 六类复用证据成立（平台回归 D4-B/D4-U/D4-B-Platform 报告）；tabletopSkeleton 由 D4-UI3 Chromium 1/1 验证（狼人 12 人审判桌） | **现状 ≥6 成立**（六类平台层复用 + 契约套件/botDriver 直接复用；tabletopSkeleton 对 v2 的消费待 P1a 客户端接线确认） | GAP-3（部分）：v2 客户端接线（`viewRegistry`/`GamePage`）使桌面骨架对 v2 视图生效，需 P1a 客户端连锁 + e2e 真实开局 |
| C6 | 零逃生钩子（baseline `escapeHooksDefinition` / spec L923） | v2 server 目录对 server core/persistence/gateway **零导入**（grep 确认 `NO_PLATFORM_IMPORTS_IN_V2`）；无绕过不变量、直改原语内部、注入 game-id 分支的接口；strict schema（`parseConfig`/`parseAction`）+ `assertInvariants` + 视图由 state 构建；`shared/src`/`server/src` 中 werewolf 引用仅为目录声明数据与既有 v1-v8 迁移解析，无新增分支 | **通过** | 无 |
| C7 | 权威 commit 对比可用（baseline `stablePrimitivePromotionBlockedUntil`/`authoritativeComparisonRequired`） | 基线侧完成：commit A 上 `measure-loc --root .` → `baselineAllMatch=true`、`baselineTotal=1500`、`provisional=true`（本窗口复跑确认）。target 侧权威终稿**尚未执行**（commit A 预投影 42.07% 非权威） | **待补** | GAP-2：P1a 完成后在 commit B 上 `measure-loc --target compliance/d4-v/target-manifest.json` 产出权威终稿（reduction ≥ 40%） |
| C8 | 破坏性修改须升级版本或提供迁移层（spec L251，结构属性） | v2 独立 ruleset `werewolf_platform_open_kill_v1` + `snapshotMigrations {}`；legacy `werewolf_legacy_platform_v2` 语义冻结（legacy 39/39 + 冻结 9 文件哈希不变，D4-V） | **通过** | 无 |

## 当前工作树并发说明

取证期间工作树存在并行 Agent B（P1b）对 `packages/server/tests/helpers/fullGameDriver.ts` 的并发修改（+26/-6，`FullGameMatrixOptions` 增可选 `rulesetId`）。该文件不影响上述任何证据采集（不在冻结 9 文件、不在 v2 6 文件、不在被采证测试套件之外的其他断言范围内）。

## 待 P1a / commit B 依赖清单

1. **GAP-1（P1a）**：`registry.ts` 注册 `werewolfV2Module` + `LEGACY_RULESET_ALIASES` 收窄 + 注册断言（open_kill→v2、legacy→legacy）；客户端连锁（types/viewRegistry/GamePage）。闭合后补证 C2 平台级真实复用。
2. **GAP-2（P1a 后 commit B）**：主模型在 commit B 上 `measure-loc --target compliance/d4-v/target-manifest.json` 权威终稿（reduction ≥ 40%），闭合 C7。
3. **GAP-3（P1a 客户端连锁）**：v2 客户端 view 接线 + `e2e/werewolf-tabletop.spec.ts` 真实跑 v2 引擎 + 恢复/视角泄漏/机器人完整局对 v2 再确认，闭合 C5 中 tabletopSkeleton 对 v2 的消费。

以上三项全部闭合后，方可按 baseline L213 声明稳定原语 v1；本窗口结论为 **DEFERRED**（现状 = 除 P1a/commit B 依赖外的成熟度门证据齐备）。
