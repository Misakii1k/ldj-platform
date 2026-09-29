# T01 报告：包、协议与严格视角 parser

日期：2026-09-20。工作根：`D:\项目`，分支 main，基线 HEAD `21c2daf`。
前置门：G0 已通过（P1–P7 见 STATUS 决策记录）。

---

## 1. 契约修订 C01（本任务最重要的产出）

**T01 开工前只读勘察发现 02/04 的包结构方案与平台现状矛盾，已停止并上报，由用户裁决选「方案 A：按平台现状」。**

原方案要求新增 `shared/contract.ts`、`shared/parseView.ts`、`shared/index.ts`，exports 增加 `./shared`，并让浏览器 import 该子路径。

矛盾证据（11/11 现有游戏无一例外）：

| 事实 | 核验方式 |
|---|---|
| 游戏包 exports 只有 `./manifest` + `./server` | 逐个读 11 份 package.json |
| `shared/` 下只有 `manifest.ts` | `ls packages/games/*/shared/*.ts` |
| **客户端从不导入任何游戏包** | `grep "@ldj/game-" packages/client/src` → 空 |
| `packages/client/package.json` 只依赖 `@ldj/shared` | 读文件 |
| client tsconfig `paths` 只映射 `@ldj/shared`、`@/*` | 读文件，游戏包根本解析不到 |
| 客户端 parser 一律住 `client/src/game/<id>/types.ts` | 读 durian/cheese-thief/bell-clash，均零 import |
| 当前 `client/dist` 不含游戏包/服务端模块 | 实测 grep dist 产物 |

原方案会把「客户端零游戏包依赖」这条**结构性**边界降级为「依赖但只准某子路径」的**约定性**边界，而 T09 专设构建边界门守这个方向。

**已落地的 C01**：exports 仅 `./manifest` + `./server`；client parser 放客户端侧；`packages/client/package.json` 与 client tsconfig **不改**。已知代价是视角类型与服务端 views 结构重复，由 T04 对拍测试覆盖。
修订正文写入 `02-architecture-contract.md` §2，T01 白名单同步更新到 `04-implementation-plan.md`。

---

## 2. 改动路径

**新增**：

- `packages/games/wits-wagers/package.json`
- `packages/games/wits-wagers/shared/manifest.ts`
- `packages/games/wits-wagers/tests/manifest.test.ts`
- `packages/client/src/game/wits-wagers/types.ts`
- `packages/client/tests/witsWagersView.test.ts`

**修改**：

- `packages/server/package.json`（+1 行依赖 `@ldj/game-wits-wagers`）
- `tsconfig.server.json`（+2 路径映射：`/manifest`、`/server`）
- `package-lock.json`（见 §4）
- `docs/plans/2026-09-20-wits-wagers/02-architecture-contract.md`、`04-implementation-plan.md`（C01）

**明确未改**：`packages/client/package.json`、`packages/client/tsconfig.json`、`viewRegistry.ts`、`GamePage.tsx`、`catalog.ts`、`registry.ts`、`game-admission.json`。T01 不创建 `server/` 目录（T04 负责），因此包暂时只有 `./manifest` 可解析——这是预期状态，`./server` 的映射先行声明不影响 typecheck。

---

## 3. 命令与结果

| 命令 | 退出码 | 结果 |
|---|---|---|
| `npx tsx --test packages/games/wits-wagers/tests/manifest.test.ts`（实现前） | **1** | `ERR_MODULE_NOT_FOUND: shared/manifest.ts` —— 确认因缺实现而失败，非拼写错误 |
| `npx tsx --test packages/client/tests/witsWagersView.test.ts`（实现前） | **1** | `ERR_MODULE_NOT_FOUND: wits-wagers/types.ts` —— 同上 |
| `npx tsx --test <manifest + view + breakpointContract>` | **0** | **29 tests / 29 pass / 0 fail** |
| `npx eslint <本任务全部新文件>` | **0** | 无 error/warning |
| `npm run typecheck` | **0** | 通过 |
| `npm test`（全量） | **1** | tsx 段 **1417/1417 通过**（基线 1391，+26 全为本任务）；scripts 段 64/68 |
| `npm run build` | **0** | 通过，10.92s |

### 3.1 存量失败未变

scripts 段那 4 项与 T00 基线**逐字相同**，全部来自 `scripts/tests/d4/`（werewolf 在途重构脱离 D4 冻结基线）：

1. `driver：werewolf 稳定基线模块完整局可收束`
2. `已知样例锁定：冻结源集合 9 文件全部哈希/行数/有效 LOC 与 baseline 一致`
3. `runMeasurement：reductionPercent 达标`
4. `runMeasurement：未提供目标实现时为 content-hash provisional`

**本任务零新增回归**，也未触碰这 4 项所属文件。日志：`output/wits-wagers-baseline/npm-test-after-t01.log`。

### 3.2 边界复核

- `grep "@ldj/game-" packages/client/src packages/client/package.json packages/client/tsconfig.json` → **空**，C01 核心约束保持。
- build 后扫 `packages/client/dist/assets/*.js` 无 `wits-wagers` / `@ldj/game-` 痕迹（parser 尚未注册进 viewRegistry，未进模块图，符合预期）。

---

## 4. package-lock.json 说明（含一处非本任务的既有脏数据）

`npm install` 退出码 0，lock 净变化 14 增 4 删，其中**只有 3 处属于本任务**：

- `node_modules/@ldj/game-wits-wagers` → link
- `packages/games/wits-wagers` 包条目
- `packages/server` 依赖表 +1 行

**第 4 处不是本任务引入**：lock 里原有 `node_modules/@ldj/game-party-sandbox` 链接，但该包在提交 `37e47e9`（移除真人法官模式）时已随目录删除。核验：

```
packages/games/party-sandbox        → 目录不存在
git ls-files packages/games/party-sandbox → 空（未被跟踪）
git show HEAD:package-lock.json | grep -c party-sandbox → 4（HEAD 里就有）
```

即 HEAD 的 lock 早已与磁盘不一致，`npm install` 顺手把这条悬空链接清理并给残留条目打上 `extraneous: true`。这是既有脏数据的自动修正，不是我引入的变更，也未运行 `npm update`、未升级任何第三方依赖版本。

---

## 5. 测试有效性验证（变异测试）

29 个断言全绿容易掩盖空转，因此对 parser 的 8 个关键守卫逐个做变异，确认每个都有测试真正盯着：

| 被删守卫 | 结果 |
|---|---|
| 顶层 `hasExactKeys`（未知键） | ✅ fail 1 |
| 未放置筹码 `extraStake !== 0` | ✅ fail 1 |
| BetPair A/B 顺序 | ✅ fail 1 |
| `timeoutAuthors ⊆ authors` | ✅ fail 1 |
| 猜测上界 `<= MAX_GUESS` | ✅ fail 1 |
| 赔率白名单 `ALLOWED_ODDS` | ✅ fail 1 |
| `viewVersion !== 1` | ✅ fail 1 |
| `targetId` 正则形状 | ✅ fail 1 |

8/8 变异全部被捕获，无空转断言。变异在副本上进行，每轮结束即还原；最终 `git status` 确认 `types.ts` 为未跟踪新文件、内容完整。

> **过程中的一个真实失误，如实记录**：首轮变异脚本用 `python`，而该环境的 `python` 是 Windows Store 转发存根（`--version` 退出码 49，静默不执行），导致脚本什么都没改却报告"fail 0"，我一度把它误读为"断言空转"。改用 `py -3` 后 8/8 全部正常捕获。教训：变异测试必须先验证变异确实落盘（本次用 `grep -c` 核对守卫已消失）。

---

## 6. 完成标准对照

| T01 完成标准 | 结果 |
|---|---|
| manifest.test 先失败再实现 | ✅ 实测 ERR_MODULE_NOT_FOUND → 4 tests pass |
| manifest 可被 registry/catalog 消费 | ✅ 形状 `GameManifest & {rulesets}`，与 echo-judge 一致 |
| 包 exports 仅 `./manifest`、`./server` | ✅ 有测试锁定，含"无根 barrel"断言 |
| client parser 逐 phase 白名单、失败关闭 | ✅ 22 tests，覆盖未知键/错角色/非法数值/错版本 |
| fixture 用假题，不引用生产题库 | ✅ 测试内联假题，无任何 server 导入 |
| **客户端零游戏包依赖** | ✅ grep 为空 |
| `npm install` lock 仅必要变化 | ✅ 见 §4（另含一处既有脏数据的自动修正） |
| 不依赖 server/questions | ✅ T01 未创建 server/ 目录 |

**T01 完成。未进入 T02。**

## 7. 进程

未启动任何常驻服务；所有命令前台一次性执行。无需清理的 PID。无付费模型调用、无网络访问。

## 8. 下一张卡与仍存风险

**下一张：T02（纯函数赔率、判胜、账本）** —— 最高优先级，且与 T01 产物无文件重叠。
需带给执行者的上下文：

- `golden-cases.json` 须原样复制进 `packages/games/wits-wagers/tests/`，**expected 不可改**。
- 01 §3 的槽位常量表是唯一事实源，禁止重新推导公式。
- 01 §4 的账本公式：`score` 始终是结算前完整余额，下注只算 reserved 不扣 score；赢的本金已在 scoreBefore 里，**不可二次加**。
- T01 已把 `TargetId` 形状（`smaller` | `g:<正整数>`，无前导零）与赔率集合 `{2,3,4,5,6}` 钉死在 client parser；T02 的 `buildBoard` 输出必须与之吻合，否则 T04 对拍会失败。

**仍存风险**：

1. 视角的 `revealed`/`history`/`result` 三个字段，T01 只锁了容器形状与有界性（history ≤ 7），内部结构留给 T04 随服务端 views 一起冻结。T04 必须回头补齐这三项的 parser 白名单，否则它们是当前 parser 上最宽的口子。
2. 准入台账仍无 wits-wagers 条目，T08 想标 playable 必须先有真实审批。
3. CI 当前因存量 lint（38 errors）+ 存量测试（4 项）必然红，与本任务无关。
