# D5 P1c：权威 LOC 对比基线侧 + target 锁存（2026-08-06）

> 角色：Agent C（P1c）只读执行 + 报告。**未写任何生产代码；未修改 `scripts/d4/**`；未执行任何 git 状态变更命令；未触碰 registry/landlord/client/catalog/admission；无真实 LLM。**
> 唯一写操作：`compliance/d4-v/target-manifest.json` 锁存增强 + 本报告与稳定原语评估报告。
> 执行时点：commit A 工作树（HEAD = `b9bf4586cd1942fcc6cfdd3dc6dfccae5b833d7f`，D4 全绿不可变基线）。

## 1. 基线侧权威验证（commit A 工作树）

命令（原样执行，measure-loc 不改）：

```text
node scripts/d4/measure-loc.mjs --root . --json
```

关键结果：

| 字段 | 值 | 判定 |
| --- | --- | --- |
| `baselineAllMatch` | `true` | 通过 |
| `baselineTotal` | `1500` | 与 `compliance/d4/third-game-baseline.json` 冻结值一致 |
| `provisional` | `true` | 未提供 target，符合预期 |
| 基线文件核验 | 9/9 文件 `hashMatch`/`lineCountMatch`/`effectiveMatch` 全 `true` | 通过 |
| 退出码 | 0（provisional 模式下 pass 门不参与） | 通过 |

9 个基线文件的 sha256 与 `third-game-baseline.json` `sourceFiles` 逐字节一致（module.ts=ad15db05…、bot.ts=273dda5e…、botPrompt.ts=1abb1c08…、manifest.ts=d6cb97e1…、四个测试文件 6da496b4/e74b00bf/be3c04cf/9d99b037 + roles.test.ts=7ea7ec93）。`git status` 确认冻结 9 文件零改动。

**工作树并发说明（如实标注）**：measure 执行时刻工作树存在一处并行 Agent B（P1b）的并发修改 `packages/server/tests/helpers/fullGameDriver.ts`（+26/-6，为 `FullGameMatrixOptions` 增加可选 `rulesetId` 并在 start_game 载荷带 `gameConfig:{rulesetId}`）。该文件不属于冻结 9 文件、不属于 v2 target 6 文件，**不影响本次基线测量**（`baselineAllMatch=true` 成立）。Agent C 未触碰该文件。

## 2. target 侧：权威终稿时序依赖（不虚报）

本报告**未**将 target 侧 measure-loc 记为权威终稿。时序依赖：

```
P1a（Agent A，werewolf v2 平台注册）完成
  → 主模型在 commit B 上执行
      node scripts/d4/measure-loc.mjs --root . --target compliance/d4-v/target-manifest.json
  → 产出 D4-V 权威终稿（要求 reduction ≥ 40%）
```

在 commit A 工作树上只做了一次**语义自检**（非权威）：`--target compliance/d4-v/target-manifest.json` 可正常解析增强后 manifest（仍只读 `targetSourceFiles[].path/role`），预投影 `baselineAllMatch=true`、`targetTotal=869`、`reduction=42.07%`、`pass=true`。**该 42.07% 是 commit A 工作树预投影，不是权威终稿**；P1a 若未触碰 v2 server 6 文件则数值应保持，但权威结论一律以 commit B 上的执行结果为准。

## 3. target-manifest 锁存增强（审计增强，非脚本改动）

改前结构核对：`compliance/d4-v/target-manifest.json` 原为 `schemaVersion/createdAt/candidate/targetSourceFiles`，6 个 target 条目仅 `path+role`（已核对输出并留痕）。

新增（不改变 measure-loc 读取语义，其只读 `targetSourceFiles[].path/role`）：

- 顶层 `lockupMetadata`：`lockedAt=2026-08-06`、`lockedOnCommit=b9bf4586cd1942fcc6cfdd3dc6dfccae5b833d7f`、`lockedInWorkingTree="commit A 工作树字节"`、三条规则引用 + `auditNote`（注明 P1a 后主模型在 commit B 上以 measure-loc --target 重测覆盖）。
- 每个 target 条目新增 `sha256`/`lineCount`/`effectiveNonTestLineCount`（按 baseline `measurementRules` 的 hashRule/rawLineCountRule/effectiveNonTestLineCountRule 计算，复用 `scripts/d4/measure-loc.mjs` 导出的 `countLines`/`effectiveNonTestLoc` 只读计算）：

| path | role | sha256 | lineCount | effectiveNonTestLineCount |
| --- | --- | --- | --- | --- |
| `packages/games/werewolf/server/v2/types.ts` | target_types | `b20c9f67c5705a8b36c672bf3879382bf9f0f0a9ce12fa17790c3e8d68e3f549` | 220 | 1 |
| `packages/games/werewolf/server/v2/schemas.ts` | target_schemas | `94df90c76087321a9128130de4e9b7f30450755f307705aa9def0024a7d0ea4c` | 101 | 90 |
| `packages/games/werewolf/server/v2/rules.ts` | target_rules | `f9eced90358e99345fe723a24b10d2fb6e617a8e02540e9cdbe9ee1df5714594` | 633 | 603 |
| `packages/games/werewolf/server/v2/module.ts` | target_module | `29676587392ffc972cc3e5327d0672a0c13154405fbabf24c65ecf971527f54d` | 41 | 37 |
| `packages/games/werewolf/server/v2/bot.ts` | target_rule_bot | `4e5deff199bbde39500744db56abe91d1fb2bea35f023593a06f219097d467b1` | 67 | 63 |
| `packages/games/werewolf/server/v2/botPrompt.ts` | target_llm_prompt | `e6185b44914b00b6879c29fb17b809863d28f9bbe8a65097067b6c3c46a5f226` | 79 | 75 |

合计有效非测试行 `869`（与 measure-loc target 预投影一致）。注：`types.ts` 全文件为纯类型声明，`effectiveNonTestLineCount=1` 来自首行文件头注释（注释行计入、纯类型排除，符合固定脚本规则）。

6 个文件均在 git 跟踪内（`git ls-files` 确认），锁存值对应跟踪字节。

## 4. 验收对照与本窗口交付

| 计划项 | 结果 |
| --- | --- |
| 基线 commit A 跑 `measure-loc`（须 `baselineAllMatch=true`） | PASS（1500/9 文件一致，provisional=true） |
| target 锁存字段（sha256/lineCount/effective） | 完成（6 文件 + lockupMetadata） |
| 权威终稿 | 留待 P1a → commit B（本报告未虚报） |
| 脚本不改 | `scripts/d4/measure-loc.mjs` / `playable-check.mjs` 零改动 |

## 5. 待 P1a / commit B 依赖清单

1. **P1a 完成后**，主模型在 commit B 上复跑 `node scripts/d4/measure-loc.mjs --root . --target compliance/d4-v/target-manifest.json` 产出 D4-V 权威终稿（reduction ≥ 40% 门）。
2. 若 P1a 修改了 v2 server 6 文件中任一文件，目标锁存值需以 commit B 工作树重算覆盖（本报告值为 commit A 锁存）。
3. 权威终稿是稳定原语 v1 声明的前置门之一（见稳定原语评估报告）。

## 6. 硬约束核验

- 未写生产代码；`scripts/d4/**` 零改动；未执行 git add/commit/status 变更类命令（仅只读 `git log`/`git status`/`git diff`/`git rev-parse` 取证）。
- 未触碰 registry/landlord/client/catalog/admission；未执行任何会改变 git 状态的操作；无真实 LLM。
