# D5 计划：权威化收尾 + 产品化上架 + landlord V2（稳定原语 v1 目标）

> 前置：D4 全部 14 门 PASS（未提交工作树）。用户已确认范围（D4 权威化收尾 + 产品化上架 + 新游戏接入 + 稳定原语 v1 声明）、授权分阶段 commit、四款一起上架。D5 无官方定义——本计划依据引擎设计「需另行批准」清单（spec L245-253/L869-874/L913-923/L986-1000/L1066-1077）与 `compliance/d4/third-game-baseline.json` acceptance 设计。

## G0：Git 版本控制基线（唯一授权点，主模型执行）
用户已授权分阶段 commit（不 push 远程、不做 rebase/force）。执行：`git add -A && git commit` 把当前 D4 全绿工作树固化为**不可变基线提交**（commit A，记录哈希）。此后每阶段末一个 checkpoint commit（P1 末 = B、P2 末 = C），全部保留在本地分支 main。

## P1：D4 权威化收尾（三个并行代理 + 主模型）
### P1a（Agent A，registry 单 owner）v2 平台注册
- `packages/games/werewolf/server/index.ts`：`export { werewolfV2Module } from './v2/module.ts';`
- `packages/server/src/core/game/registry.ts`：`MODULES` 加 `werewolfV2Module`（**在 werewolfModule 之后**，保住 legacy 默认）；`LEGACY_RULESET_ALIASES.werewolf` 收窄为 `['werewolf_legacy_platform_v2']`（否则重复注册抛错）。
- 客户端连锁（必须同步否则 e2e/DOM 断）：`packages/client/src/game/werewolf/types.ts` 支持 schemaVersion 1 解析（v2 view）；`packages/client/src/game/viewRegistry.ts` 注册 `werewolf:werewolf_platform_open_kill_v1:1`；`packages/client/src/game/GamePage.tsx` werewolf 走 v2 stage（复用既有 WerewolfStage 或按 viewVersion 分派）；样式按需。
- 测试：`packages/server/tests/sessionIdentity.test.ts` 增「open_kill 解析到 v2、legacy 仍解析到 legacy」注册断言；`packages/client/tests/` 增 v2 view 解析测试；`e2e/werewolf-tabletop.spec.ts` 更新（现在真实跑 v2 引擎）。TDD Red→Green。
- 风险如实记录：历史 legacy open-kill raw 快照（v7 回填）注册后解析到 v2 无信封 → SUSPENDED；internal_prototype 阶段实际无在途会话，报告标注即可，不为此加 game-id 分支。

### P1b（Agent B）矩阵 + CI + perf 稳定
- `packages/server/tests/helpers/fullGameDriver.ts`：`FullGameMatrixOptions` 加可选 `rulesetId`；start_game 载荷按需带 `gameConfig:{rulesetId}`。
- `packages/server/tests/fullGameMatrix.test.ts`：新增 blank 正常收束 + 逐动作崩溃矩阵两用例（断言 finished/resultRows=1/pendingTimers=0）。
- 根 `package.json`：`ci` 增 `npm run build && npm run test:e2e`（e2e 前置 build + Chromium，串行 workers 1）；保留独立 `test:e2e`。
- `perf.smoke` 稳定：给该文件开 `--expose-gc` 专用入口或与重测试分桶串行（不改生产逻辑，仅测试稳定性；堆断言在无 GC 时失效是 flake 根因）。
- 回归：blank/undercover/uno/werewolf 全测试 + server 全量。

### P1c（Agent C）权威 LOC 对比 + 稳定原语评估
- 脚本**原样执行**（不修改 `scripts/d4/**`）：基线 commit A 跑 `node scripts/d4/measure-loc.mjs --root .`（须 baselineAllMatch=true）；P1a 完成后的工作树跑 `--target compliance/d4-v/target-manifest.json` → D4-V 权威终稿（reduction ≥40%）。
- `compliance/d4-v/target-manifest.json` 补 sha256/lineCount/effective 锁存（审计增强，非脚本改动）。
- **稳定原语 v1 声明评估**（baseline L213 + spec L245-251）：权威对比可用 + UNO/卧底回归全过 + v2 真实复用（P1a 注册）+ 重放/恢复/不可变/视角泄漏/机器人合法 + 7 类复用≥6 + 零逃生钩子。逐条取证；全部通过才声明，否则如实 DEFERRED 并列出缺口。
- 产出：D4-V 报告终稿 + 稳定原语评估报告。

## P2：产品化上架（全部四款；先 landlord V2 化）
### P2a（Agent D）landlord V2 平台规则（新游戏接入）
- `packages/games/landlord/server/platform/**`（或 v2/）：GameModuleV2 复刻斗地主（bidding/play/pass/胜负/计时/视图遮滤/机器人），复用 `server/cards.ts` 既有纯函数（canBeat/identifyCombo/sortCards/buildLandlordDeck）；`shared/manifest.ts` 注册 `landlord_platform_v1`；`server/index.ts` 导出；`registry.ts`（单 owner 队列：P1a 后交给 D）注册。
- 测试：契约套件 + 完整机器人局 + 崩溃矩阵；TDD Red→Green。

### P2b（Agent E）上架链 + playable-check 语义调整
- **上架准入 11 项逐条验收**（spec L986-1000），每款一 gate：
  - undercover（classic V2 + blank V2）、werewolf（legacy + open-kill v2）、landlord（新 V2）→ catalog `availability:'playable'`、admission `catalogStatus/releaseStatus:'playable'` + rights 五字段（recordId/scope/expiresAt/rightsApprover/rulesApprover）approved。
  - **uno：blocked_rights 解除依赖外部权利证据**——若用户提供（本阶段工作树内不伪造），则一并上架；否则如实 DEFERRED（playable-check 会强制证据完整）。
- `scripts/d4/playable-check.mjs` 语义调整：由「必须无 playable」改为「存在 playable 时必须带完整授权证据」（校验逻辑已具备，改 pass 语义 + 更新 `scripts/tests/d4/playable-check.test.mjs`）。**注意：这是 scripts 白名单扩展，作为上架门必要配套，主模型批准。**
- 首页：`packages/client/src/game/NewGamePages.tsx`/`App.tsx` 移除 coming_soon 门禁（availability playable 已可见）；建房/开局/完整局 e2e（每款一个 spec 或合并）。
- 每款验收：恢复矩阵、视角泄漏、机器人完整局、契约测试、Chromium 真实开局。

## P3：全量质量门 + 汇总（主模型）
- 全链：`npm run ci`（含 build + e2e）→ `compliance:d1` 前后 → `git diff --check` → D1 双 SHA 按 admission 现值核对 → playable-check → 冻结 9 文件哈希复核。
- 每阶段 checkpoint commit（P1 末、P2 末）由主模型执行并记录哈希。
- 产出：`docs/superpowers/reports/2026-08-06-d5-results.md`（范围/白名单/各门证据/D1 哈希/稳定原语声明或 DEFERRED/uno 权利状态/延期项）+ 计划文件落盘 `docs/superpowers/plans/2026-08-06-d5-authoritative-launch-plan.md`。

## 并行编排与冲突矩阵
- Agent A（P1a）：werewolf index/registry（首笔）/werewolf 客户端/werewolf e2e/werewolf server 测试。
- Agent B（P1b）：fullGameDriver/fullGameMatrix/根 package.json/perf.smoke 稳定性。
- Agent C（P1c）：只读脚本执行 + target-manifest 锁存 + 稳定原语评估报告（不写生产代码）。
- Agent D（P2a）：landlord/**（含 registry 第二笔，串行在 A 后）。
- Agent E（P2b）：catalog.ts/admission/playable-check + 其测试/NewGamePages/首页 e2e。
- 主模型：G0/P1末/P2末 commit、门间信号、P3。
- **冲突矩阵**：registry.ts 单 owner 串行（A→D）；werewolf/** 仅 A（D 只做 landlord）；client 首页/目录仅 E；server tests 分桶（A=werewolf 相关、B=fullGameMatrix/perf）；scripts/d4/** 仅 playable-check 语义调整（E，经批准）且 measure-loc 永不改。

## 硬约束（更新后）
- **Git**：仅 add/commit（用户已授权，分阶段）；不 push 远程、不 rebase/force/clean 他人内容。
- playable/rights/admission **允许变更**（本阶段授权范围）；UNO 权利证据不可伪造，缺失则 DEFERRED。
- 迁移仍限 v1–v8（无 v9）；不新增 settings 键；D1 fixture 字节不变；无真实供应商 LLM。
- 冻结 9 文件仍零改动（measure-loc 依赖其哈希）。
- 稳定原语 v1 声明：全部门过才声明，否则如实 DEFERRED。
- 测试命令用定向 `npx tsx --test`/`npx playwright test`，避免全局 npm test 与并行代理冲突；Red 阶段只跑定向测试。

## 风险与如实标注
- v2 注册后历史 legacy open-kill raw 快照会话 SUSPENDED（无真实历史会话，标注即可）。
- UNO 上架依赖外部权利证据（blocked_rights 若无法解除则本批 DEFERRED，不伪造）。
- 稳定原语 v1 若任一成熟度门不过 → DEFERRED 并列出缺口。
- perf.smoke 稳定性仅测试层调整，不改生产逻辑。
