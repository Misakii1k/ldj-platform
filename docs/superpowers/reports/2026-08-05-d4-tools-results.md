# D4-TOOLS 开发工具链结果

> 子代理 TOOLS 门 TDD 完成 + 协调器最终统一验证通过（2026-08-05）。
> 全量质量门由协调器串行执行并回填结果（见「质量门」表）。

## 范围

D4 主计划 D4-TOOLS 门（`docs/superpowers/plans/2026-08-05-d4-new-capabilities-master-plan.md` 第 525–548 行）：
提供标准开发工具链并验证可用性；产出第三游戏 LOC 度量固定脚本。全程 TDD（Red→Green→Refactor），
仅允许触碰主计划白名单文件；未执行任何 Git 状态变更命令。

## 交付物

### 新建脚本（`scripts/d4/`）

- `generate-module.ts` —— 模块生成器：生成标准模块骨架（`shared/manifest.ts` + `server/module.ts` + `server/index.ts` + `tests/contract.test.ts`）。reduce 对一切动作返回 `NOT_IMPLEMENTED`，**不生成伪业务逻辑**（无 I/O、无真实时钟、无全局随机源）；产物可复现（两次生成字节一致），且通过真实契约套件（identity/initial/pure/被拒动作不推进/视角 Schema）。
- `view-snapshot.ts` —— 视角快照工具：逐玩家 + 观战视角快照（规范化 JSON + 字节数 + SHA-256），输出观战↔玩家字节比对与疑似泄漏清单。
- `rule-trace.ts` —— 从规则追踪 JSON 生成「条款→实现→测试」映射表，输出 `docs/superpowers/reports/2026-08-05-d4-<gate>-rule-trace.md`；实现/测试解析优先级：trace 内联映射 → 源码/测试目录扫描 → 如实标注 `UNMAPPED`。
- `diagnostics.ts` —— 开发/测试环境诊断器：阶段、合法 actor、合法动作、计时器、序号、随机值编号。**默认关闭**（不传 `--enabled` 只返回 `enabled:false` 占位）；独立于 `packages/` 生产代码，不进入任何构建路径与玩家视角。
- `playable-check.mjs` —— playable 准入检查：校验 `compliance/d1/game-admission.json`（catalogStatus/releaseStatus 为 playable 必须带完整授权证据）、`third-game-baseline.json`（`claims.playable` 必须为 false）、共享 GAME_CATALOG 交叉校验。
- `measure-loc.mjs` —— 固定版本度量脚本：按 `compliance/d4/third-game-baseline.json` 的 `measurementRules`/`excludedContent`/`comparisonUnit` 计算有效非测试 TS LOC（排除测试文件/生成文件/空行/纯类型声明/静态题库，保留驱动运行时的静态数据），`reductionPercent >= 40` 为 pass。

### 修改（白名单内）

- `packages/shared/tests/helpers/versionedGameContract.ts` —— 契约套件扩展为：identity / initial / pure / **被拒动作不推进** / **同种子确定性** / **视角 Schema**（逐玩家 + 观战 round-trip 稳定、`me.playerId` 与请求者一致）/ **无秘密泄漏**（支持同阵营共词放行与终局揭示放行）/ **结果 only-once**（沿动作序列结果候选恰好一次出现且稳定）/ **快照可重放**（同 seed 两次重放字节一致，末态过 parse/invariants）/ **机器人合法候选**（pickBotAction 返回的动作必须被 reducer 接受）。
- `packages/server/tests/helpers/fullGameDriver.ts` —— 完整局驱动器新增 **最大步数**（耗尽步数会话仍 ACTIVE → 失败）与 **最大虚拟时间上限**（`maxVirtualTimeMs`，虚拟时间 = 已接受动作步进 1s/动作 + 被强制拨快的计时器调度时长；超限即失败）；结果新增 `virtualTimeMs`；`gameId` 扩展支持 werewolf/landlord（稳定基线模块验证）。

### 测试（`scripts/tests/d4/*.test.mjs`，8 个文件 51 项）

`node --test scripts/tests/d4/*.test.mjs` → **51/51 全绿**（fail 0）。

## TDD 证据

| 阶段 | 结果 |
| --- | --- |
| Red | 41 项测试（工具/扩展尚未实现）：5 项既有基线回归绿（identity/initial/pure、驱动正常局、崩溃矩阵），36 项红（工具缺失或新行为未实现） |
| Green | 实现后 51/51 绿 |
| Refactor | 生成器产物通过真实契约套件；diagnostics 默认关闭且脚本不进入构建路径；`npx tsc -p tsconfig.server.json` 通过；范围 eslint 0 错误 |

### 稳定基线模块验证（只读引用，不依赖 UNO 中途状态）

- 契约套件：对 **undercover V2**（`undercover_classic_v1`）+ D1 冻结 fixture 全项断言通过（含 40 步完整局重放、无秘密泄漏、结果 only-once、机器人合法候选）。
- 完整局驱动器：undercover / landlord / werewolf 均完整收束（finished=true、resultRows=1、pendingTimers=0）；双上限超限即失败均有测试覆盖。
- 既有消费者无回归：`packages/games/undercover/tests/contract.test.ts` 4/4、`packages/server/tests/fullGameMatrix.test.ts` 4/4（含 UNO/卧底逐动作崩溃矩阵）。

## 工具实测输出

### playable-check

```
$ node scripts/d4/playable-check.mjs .
无 playable        （exit 0）
```

当前输出为「无 playable」——满足验收点。

### measure-loc（已知样例锁定 + 目标未提供的 provisional）

```
$ node scripts/d4/measure-loc.mjs --root .
measure-loc: 基线锁定 OK（9 文件哈希一致） reduction=0% 未提供目标实现
（content-hash provisional，权威 commit 对比 DEFERRED）
```

- 冻结源集合 9 文件逐文件 `sha256`/`lineCount`/`effectiveNonTestLineCount` 与 `compliance/d4/third-game-baseline.json` **全部一致**：
  - `module.ts` 1570 行 → 有效 1233；`bot.ts` 94 → 80；`botPrompt.ts` 201 → 175；`manifest.ts` 16 → 12；5 个测试文件 → 0。
  - 基线有效非测试 TS LOC 合计 **1500**。
- reductionPercent 公式与 pass 条件（`>= 40`）在测试中验证（合成目标 ≥99% pass；未提供目标 → provisional false）。
- 因本任务禁止提交，目标实现由 D4-V 提供后由**同一固定脚本**原样测量；本次为 content-hash provisional，权威 commit 对比 `DEFERRED`。

### rule-trace（demo 输入：`compliance/rules/undercover_blank_v1.json`，gate=tools）

```
$ node scripts/d4/rule-trace.ts --trace compliance/rules/undercover_blank_v1.json --gate tools
rule-trace:OK gate=tools rulesetId=undercover_blank_v1 clauses=18 impl=0/18 tests=0/68
out=docs/superpowers/reports/2026-08-05-d4-tools-rule-trace.md
```

生成 `docs/superpowers/reports/2026-08-05-d4-tools-rule-trace.md`：18 条款 / 3 差异；
blank 规则集尚未实现，实现与测试映射**如实标注 UNMAPPED**（0/18、0/68），不臆造覆盖。

### view-snapshot（undercover 初始状态）

```
$ node scripts/d4/view-snapshot.ts --module packages/games/undercover/server/index.ts --state <state.json> --out <out.json>
view-snapshot:OK players=4 leaks=0
```

- 4 玩家 + 观战视角快照；观战↔每个玩家视角字节均不同（`uc-p1..p4:false`）；`leaks=[]`。
- 观战 580 字节 vs 玩家视角 699 字节；同输入两次捕获字节一致（快照可复现）。

### diagnostics

```
$ node scripts/d4/diagnostics.ts --state n/a --module n/a            # 默认关闭
{ "enabled": false, "message": "diagnostics 默认关闭；显式传 --enabled 才启用" }

$ node scripts/d4/diagnostics.ts --state <state.json> --module packages/games/undercover/server/index.ts --enabled --out <out.json>
rulesetId=undercover_classic_v1 phase=word_reveal seq=null randomCursor=null timers=0
legalActors: uc-p1:confirm_word uc-p2:confirm_word uc-p3:confirm_word uc-p4:confirm_word
```

### generate-module

```
$ node scripts/d4/generate-module.ts --out <dir> --game-id demo --ruleset-id demo_v1 --display-name "演示游戏" --min-players 2 --max-players 4
generate-module:OK gameId=demo rulesetId=demo_v1 files=4
```

产物 4 文件骨架 + 契约测试占位；在测试中验证产物通过真实契约套件、无伪业务逻辑、两次生成字节一致、越界/重复玩家被拒。

## 质量门

| 门 | 结果 |
| --- | --- |
| `node --test scripts/tests/d4/*.test.mjs` | PASS（51/51） |
| `playable-check` 输出「无 playable」 | PASS |
| `measure-loc.mjs` 基线锁定（9 文件哈希一致） | PASS（provisional，目标由 D4-V 提供） |
| `npx tsc -p tsconfig.server.json` | PASS（无错误） |
| 范围 `npx eslint`（本次改动全部文件） | PASS（0 错误） |
| 全量 `npm test`（协调器验证） | PASS（628/628：tsx 564 + node --test mjs 64，0 失败） |
| `npm run compliance:d1`（协调器验证） | PASS（build 前与 build 后各一次） |
| `npm run build`（协调器验证） | PASS（1907 modules） |
| `npm run typecheck` / `npm run lint`（协调器验证） | PASS（0 错误） |
| `git diff --check`（协调器验证） | PASS（干净） |

> 说明：本任务遵守约束未运行全量质量门；上述全量项已由协调器统一串行验证并回填（见上表）。

## 审计

- 未触碰 `packages/games/**`（除只读）、`packages/client/**`、`package.json`、`package-lock.json`、`packages/server/src/**`（白名单外）、`compliance/**`（除只读）。
- 未执行任何 Git 状态变更命令（无 branch/add/commit/push/tag/stash/reset/clean/checkout）。
- `compliance/d4/third-game-baseline.json` 冻结源集合与工作树哈希**一致**（未改动，未漂移）。
- 未改动 migration、D1 fixture、playable/权利/准入。

## 异常与边界

- **另一窗口（D4-U，UNO）中途状态**：本门所有绿/红判据均以稳定基线模块（undercover V2 / landlord / werewolf）为准，未以 UNO 中途状态作判据；UNO 相关验证由 D4-U/D4-V 与协调器最终统一执行。
- **measure-loc 目标未提供**：reductionPercent 当前 0%（provisional）；≥40% 由 D4-V 在目标实现就绪后用同一固定脚本测量。
- **rule-trace demo 输入为 undercover_blank**：blank 规则集未实现，映射如实 UNMAPPED；狼人杀 open-kill 的权威条款→实现→测试映射由 D4-V 生成。
