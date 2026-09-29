# 一智千金 Implementation Plan

> 执行者：按任务逐步实施，使用已安装的 executing-plans 技能（若可用）；不要因为文档提到某技能就安装新工具。当前任务是规划交接，不授权自动启动全部开发。

**Goal:** 在现有平台接入一智千金七轮完整对局，规则、界面、保密与恢复可独立验收。
**Architecture:** 一个GameModuleV2 + 一个独立游戏包 + 一个专属React页面，复用既有WS/SQLite/计时器；规则、题库、UI分离。关键共享入口串行修改。
**Tech Stack:** Node>=24、TypeScript、已有zod、React/Vite、node:test/tsx、Playwright。

---

## 所有任务通用执行步骤

工作根目录以下统一为 `D:\项目`；不允许在 `D:\项目-r1-mvp` 安装、写入或测试本功能。

1. 阅读STATUS和当前任务引用的1–2份契约，复核git status/差异，不接管其他未提交修改。
2. 先写本任务列明的失败测试（2–5分钟小步）；执行**具体测试文件**并看到预期失败，而非import路径拼错。
3. 最小实现一个行为，再运行相同测试；不要同时顺手加第二项功能。
4. 相关文件通过后运行 `npm run typecheck`、相关单测、`npm run build`（遵循项目规范同步 `packages/client/dist`）。最终门才跑完整CI。
5. 写本任务报告：路径、命令、退出码、测试数量、未通过项、产生的服务PID及清理结果。可提交checkpoint时只精确stage本人文件；不要git add .、git reset/clean/stash他人文件。
6. 冻结规则或需要越界写入时停止报告；同一失败连续两轮修复无进展，提交最小复现，不进入无限重试。

**顺序：T00 → G0 → T01 → T02 → T03 → T04 → T05 → T06 → T07 → 视觉确认 → T08 → T09 → T10。**
T06（独立题库）与T07（固定样例UI）仅在共享类型冻结后可并行；同一轮最多两个执行者，共享入口T05/T07/T08不同时修改。顺序表是默认串行方案，只有明确分配互不重叠文件时才并行。
一次只派发一张任务卡，局部小步TDD，不把本文件整份作为“自行完成所有任务”的授权。

## T00：基线与决策（负责人，禁止直接开工）

**读**：本目录README/01；`D:\项目\AGENTS.md`；`D:\项目\package.json`。
**写**：本目录STATUS.md及新增 `reports/T00-baseline.md`。

1. 记录 `git status --short --branch`、`git log -5 --oneline`、`git worktree list`。
2. 选择用户认可的开发基线：当前未提交工作对实现有影响。默认继续在当前工作区局部新增；若需要隔离，先由用户确认并保存所需变更的checkpoint再创建worktree，不能从HEAD创建后谎称含有未提交功能。
3. 与用户确认G0 P1–P7，未确认不要把建议写成“用户接受”。G0是一个产品确认点，不要求用户审查技术字段。
4. 开发者在开工前跑基线typecheck/相关测试/构建并保存原始失败，区分存量故障和新回归；本规划轮没跑过，不能引用为绿色。

**完成标准**：基线和用户决定可追溯；没有游戏入口新增。

## T01：包、协议与纯样例（依赖G0）

> **按 02 契约修订 C01（2026-09-20 用户确认）调整为「方案 A：按平台现状」。**
> 原白名单中的 `shared/contract.ts`、`shared/parseView.ts`、`shared/index.ts` 及 `packages/client/package.json` 改动**已作废**：
> 客户端视角 parser 改放 `packages/client/src/game/wits-wagers/types.ts`，客户端不新增游戏包依赖。理由见 02 C01。

**Create**：
- `D:\项目\packages\games\wits-wagers\package.json`
- `D:\项目\packages\games\wits-wagers\shared\manifest.ts`
- `D:\项目\packages\games\wits-wagers\tests\manifest.test.ts`
- `D:\项目\packages\client\src\game\wits-wagers\types.ts`（严格视角类型与 parser）
- `D:\项目\packages\client\tests\witsWagersView.test.ts`（parser 白名单/失败关闭测试）
**Modify（仅依赖声明/链接）**：`D:\项目\packages\server\package.json`、`D:\项目\tsconfig.server.json`、`D:\项目\package-lock.json`。
**不改**：`packages/client/package.json`、`packages/client/tsconfig.json`（C01）。
**读**：02的身份/视角/动作段。

1. manifest.test锁定id/规则/人数/版本；测试尚无manifest而失败。
2. 创建包exports（`./manifest`、`./server` 两项）；server入口待T04实现，T01 不创建 server/ 目录也不在前端导入它。
3. client parser对每个phase做白名单校验：错误字段、缺key、角色不符、非法数值、未知版本返回null。不是typeof object就通过。
4. fixture使用假题与已知的公开阶段数据，不引用生产题库，不复制服务端State作为PublicView。
5. 在当前工作区根目录运行 `npm install`，检视lock仅有必要新增变化；不要运行npm update。

**验证**：`npx tsx --test packages/games/wits-wagers/tests/manifest.test.ts packages/client/tests/witsWagersView.test.ts`。
**完成标准**：manifest 可被 registry/catalog 消费；client parser 严格失败关闭；**客户端仍零游戏包依赖**；不依赖server/questions。

## T02：纯函数赔率、判胜、账本（最高优先级）

**Create**：
- `D:\项目\packages\games\wits-wagers\server\board.ts`
- `D:\项目\packages\games\wits-wagers\server\scoring.ts`
- `D:\项目\packages\games\wits-wagers\tests\board.test.ts`
- `D:\项目\packages\games\wits-wagers\tests\scoring.test.ts`
- `D:\项目\packages\games\wits-wagers\tests\golden-cases.json`（从本规划目录原样复制）

1. board测试逐条写1..7不同值、重复作者、全部相同、4个答案中心空位；先看失败。
2. 用01中的常量槽位表实现 `buildBoard(guesses)`；用 `pickWinningTarget(board,answer)`返回目标ID。
3. scoring测试逐个加载golden-cases中的scoreAfter和expectedAwardedAuthors，断言明确数值。JSON测试数据用node:fs的readFileSync(new URL(..., import.meta.url)) + JSON.parse读取并校验形状，不要求全局resolveJsonModule。
4. 实现 `settleRound`，余额变动只按01唯一算法。额外测试筹码同槽基础下注值2，不能被去重成1。
5. 排名按score、winningGuesses、并列；显示排序只用席位顺序。

**验证**：`npx tsx --test packages/games/wits-wagers/tests/board.test.ts packages/games/wits-wagers/tests/scoring.test.ts`。
**完成标准**：全部黄金算例通过；不允许修改expected。覆盖公式不能取代逐个独立值断言。

## T03：schema、初始状态、纯reducer与timer effects

**Create**：
- `D:\项目\packages\games\wits-wagers\server\types.ts`
- `D:\项目\packages\games\wits-wagers\server\schemas.ts`
- `D:\项目\packages\games\wits-wagers\server\state.ts`
- `D:\项目\packages\games\wits-wagers\server\reducer.ts`
- `D:\项目\packages\games\wits-wagers\server\invariants.ts`
- `D:\项目\packages\games\wits-wagers\tests\schemas.test.ts`
- `D:\项目\packages\games\wits-wagers\tests\reducer.test.ts`
- `D:\项目\packages\games\wits-wagers\tests\invariants.test.ts`

按02阶段逐步写：created/begin → answering提交 → arranging超时 → betting替换 → settlement →下一轮 → game_over。
只用ctx虚拟时间，不真实等待。每次transition验证timerId/action/deadline和cancel，重复/旧阶段不能结算。
动作schema拒绝额外字段；actor校验防伪系统动作。余额校验全部整组原子，expectedRevision来自本人，roundToken阻止跨局旧请求。
明确 `createState` helper接收测试题库；生产module不开放customQuestions配置。初始状态不排effect，begin排第一个effect。
forfeit采用02规则；保留期断线由平台处理；不要新增“机器人接管”承诺。

**验证**：`npx tsx --test packages/games/wits-wagers/tests/schemas.test.ts packages/games/wits-wagers/tests/reducer.test.ts packages/games/wits-wagers/tests/invariants.test.ts`。
**完成标准**：虚拟时间完整七轮、最终只一次结果候选、无残留timer；没人提交也能有限结束（P1后）。

## T04：白名单视角、题库适配和V2包装

**Create**：
- `D:\项目\packages\games\wits-wagers\server\views.ts`
- `D:\项目\packages\games\wits-wagers\server\questions.ts`
- `D:\项目\packages\games\wits-wagers\server\question-bank.zh-CN.ts`
- `D:\项目\packages\games\wits-wagers\server\module.ts`
- `D:\项目\packages\games\wits-wagers\server\index.ts`
- `D:\项目\packages\games\wits-wagers\tests\views.test.ts`
- `D:\项目\packages\games\wits-wagers\tests\privacy.test.ts`
- `D:\项目\packages\games\wits-wagers\tests\module.test.ts`
- `D:\项目\packages\games\wits-wagers\tests\questions.test.ts`

先以7道可审查的非模糊测试级题建立schema（不标题库完成）。静态import题库，开局ctx.random选择7个不同id并复制进State。
对实际模块返回的每个视角、公共事件、错误串做隐私测试。只读玩家或观战视角，不传State给前端。
包装所有V2接口（含parseState/parsePlayerView/parseSpectatorView/assertInvariants/snapshotMigrations={}）。
**验证**：`npx tsx --test packages/games/wits-wagers/tests/*.test.ts`。
**完成标准**：任意非参赛ID拿不到me；揭晓前无标准答案/来源/其他人猜测；有权限的服务器snapshot仍完整恢复。

## T05：最小接入与持久化回归（共享写点owner）

**Modify**：
- `D:\项目\packages\server\src\core\game\registry.ts`
- `D:\项目\packages\shared\src\game\catalog.ts`
- `D:\项目\compliance\d1\game-admission.json`（待审核台账；不可虚构批准信息）
- `D:\项目\tsconfig.server.json`
- `D:\项目\packages\shared\tests\catalog.test.ts`
- `D:\项目\packages\shared\tests\gameProgressionAudit.test.ts`
**Create**：
- `D:\项目\packages\games\wits-wagers\tests\registry.test.ts`
- `D:\项目\packages\server\tests\witsWagersSession.test.ts`
- `D:\项目\packages\server\tests\witsWagersRecovery.test.ts`

1. catalog及game-admission台账同步登记、数量与状态一致，授权字段保持真实待审核。catalog先 `availability:'internal_prototype',maturity:'M1',botSupport:'none'`；schema和module注册齐全。测试registry与正常未开放状态；不能为此把未完成UI的游戏提前放到生产目录。
2. 对V2 `applySessionAction`和本游戏注册模块测试snapshot/timer/result事务链。原型期需要测试开局时，在专用test fixture构造会话行并用真实module初态+begin，不新增生产测试开关。T08开放入口后再补真实建房→start链路。
3. 检查catalog.test中精确目录列表和“其余全rule_and_llm”的断言，只增加本游戏none的显式期望，保留旧游戏能力断言。
4. gameProgressionAudit对none支持使用真人席位加入+本游戏确定性脚本动作/虚拟时钟驱动，而非假声明rule或跳过本游戏。若当前测试只遍历playable，调整在T08开放时再做。
4a. 本游戏严格检查state.deadlineAt；不能照抄现有audit只把timers表改成过去而不推进ctx.now的做法。新游戏路径用node:test虚拟时钟同时推进executor的Date.now，或专用事务ctx注入时间；不削弱deadline守卫。其他游戏旧测试路径不顺手改造。
5. 恢复测试用临时文件SQLite（不是仅:memory:），每阶段落库后重开+startup recovery；下注保存与结算后均测试。不要改通用timerRunner/session解决模块自身错误。
6. 当前FullGameDriver helper只列4个GameId，不能直接当作已支持本游戏；专用测试可复用其思路，不扩大公共helper类型后没有对应驱动。

**验证**：`npx tsx --test packages/games/wits-wagers/tests/registry.test.ts packages/server/tests/witsWagersSession.test.ts packages/server/tests/witsWagersRecovery.test.ts packages/shared/tests/catalog.test.ts`。
**完成标准**：effect确实入timers表、崩溃恢复不换题不重复加分、历史ruleset准确解析；原型未公开。

## T06：题库内容（可与T07并行，不改逻辑）

**Modify**：`D:\项目\packages\games\wits-wagers\server\question-bank.zh-CN.ts`。
**Create**：`D:\项目\docs\game-library\wits-wagers\question-review.md`。

按G0约定数量逐条增加原创中文题面、精确单位、正确数值、来源和口径，写入review记录；不可抓取整套付费题卡。
questions.test检查id唯一、格式、审核标记、整数范围、至少7题，但“格式通过”不代表事实审核通过。
审校者必须查真实来源；不能把同一模型自我确认当第二重事实核验。70题不足时明确内容未完成，不用复制题面或改id凑数。
**验证**：`npx tsx --test packages/games/wits-wagers/tests/questions.test.ts` + 独立人工审校清单。
**完成标准**：每道发布题来源与答案对得上；可离线使用；未审核项不能进生产可抽取池。

## T07：固定样例界面（可与T06并行）

**Create**：
- `D:\项目\packages\client\src\game\wits-wagers\WitsWagersGamePage.tsx`
- `D:\项目\packages\client\src\game\wits-wagers\WitsWagersTable.tsx`
- `D:\项目\packages\client\src\game\wits-wagers\GuessPanel.tsx`
- `D:\项目\packages\client\src\game\wits-wagers\BetEditor.tsx`
- `D:\项目\packages\client\src\game\wits-wagers\ResultPanel.tsx`
- `D:\项目\packages\client\src\game\wits-wagers\wits-wagers.css`
- `D:\项目\packages\client\src\game\wits-wagers\betDraft.ts`
- `D:\项目\packages\client\tests\witsWagersBetDraft.test.ts`
- `D:\项目\e2e\fixtures\wits-wagers.ts`
- `D:\项目\e2e\wits-wagers-visual.spec.ts`

**Modify（前端共享入口，本任务独占）**：`D:\项目\packages\client\src\game\viewRegistry.ts`、`D:\项目\packages\client\src\game\GamePage.tsx`。

只消费T01稳定视角；先把parser与页面lazy/case注册完成，否则只伪造game_state无法显示尚未注册的页面。生产目录仍internal_prototype；T07页面纯props回调，没有controller时不发送动作。Playwright用测试专用routeWebSocket/本地fake WS驱动已存在页面路径和fixtures，浏览器先seedBrowserSession跳过主机控制台；不改生产socket、API或加入`?demo=true`后门。交互在纯组件回调/草稿测试验证，真实保存待T08。
完成V1/V2/V3与03所有基础状态，保存截图到 `D:\项目\output\wits-wagers-acceptance\T07`；截图需用户/负责人确认，不能自行把初稿视为基准。
前端不算权威赔率和score；可计算草稿预留和预计收益提示，但明确“预计”，结果取server ledger。
**验证**：`npx tsx --test packages/client/tests/witsWagersBetDraft.test.ts packages/client/tests/breakpointContract.test.ts`；浏览器矩阵按03。
**完成标准**：关键画面获确认，响应式/对比度/触控正确。不称已联机完成。

## T08：真实前端动作、开放入口、WS私密性

**Modify**：
- `D:\项目\packages\client\src\game\viewRegistry.ts`
- `D:\项目\packages\client\src\game\GamePage.tsx`
- `D:\项目\packages\client\src\app\GameCard.tsx`（只在需要专属缩写/图标时）
- `D:\项目\packages\shared\src\game\catalog.ts`及`D:\项目\compliance\d1\game-admission.json`（验收及真实准入审批齐全后playable/M2）
- T07新增容器文件；T05新增session测试；必要时T05列出的catalog/audit测试
**Create**：
- `D:\项目\packages\client\src\game\wits-wagers\useWitsWagersController.ts`
- `D:\项目\packages\client\tests\witsWagersView.test.ts`
- `D:\项目\packages\server\tests\witsWagersGateway.test.ts`
- `D:\项目\e2e\wits-wagers.spec.ts`

1. 复核T07已注册的strict parser key `wits-wagers:wits_wagers_platform_v1:1`及VERSIONED_MODULE_IDS；接上controller，不重复建第二套GamePage入口。
2. 本游戏controller直接useConnection.send并捕获已有ServerError.payload.code，本地维护busy/error；禁止重写共享连接层。明确STALE_CLIENT_STATE时resync、保留草稿并等待用户再确认保存。普通超时/断线结果未知时只同步，不自动重发。pending只禁本人的提交，不全屏锁桌。只有确认视角包含本人预期revision和相同数据才显示“已保存”（ACK可能先于game_state）。
3. 本地改动不自动加分、不自动推进；服务器拒绝保留错误和已确认值；revision冲突提示重新核对，不自动覆盖。
4. 三玩家+观战真实浏览器/WS验证，正常建房/start/七轮/结果/回大厅；2和8席位拒绝，3与7合法。
5. G0、最小可玩、隐私/恢复及准入负责人真实审批全部通过后，catalog与台账一起保存playable/M2。未审批则保持internal_prototype：模块/视角测试照常做，真实生产建房E2E标待批准，不偷偷临时切playable、不要加生产后门。完整视觉验收后M3；真机后M4。
6. 若项目全游戏测试假设bot存在，按05明确支持none，不改本游戏botSupport撒谎。

**验证**：`npx tsx --test packages/client/tests/witsWagersView.test.ts packages/server/tests/witsWagersGateway.test.ts packages/server/tests/witsWagersSession.test.ts packages/shared/tests/catalog.test.ts packages/shared/tests/gameProgressionAudit.test.ts`；`npx playwright test e2e/wits-wagers.spec.ts --workers=1`。
**完成标准**：无UI假交付；抓到真实每角色帧验证保密，而不只是DOM隐藏；多窗口旧请求不篡改账本。

## T09：故障/构建/泄露门

**Create**：
- `D:\项目\e2e\wits-wagers-recovery.spec.ts`
- `D:\项目\scripts\tests\wits-wagers-client-boundary.test.mjs`
- `D:\项目\scripts\verify-wits-wagers-client-boundary.mjs`（只检查/临时构建审计；严禁copy或输出题库内容进客户端）
**Modify**：T05恢复测试、T08 gateway测试、T07视觉测试；只限发现的问题所属本游戏文件。

按05完整矩阵。边界脚本单测建立内存模块图fixture（shared合法、跨server非法），不依赖尚未构建的dist。T09验收另外通过Vite Node API使用临时、仅验收生效的plugin记录bundle模块id（不修改生产vite.config），并扫描实际dist中server目录模块及题库专有标记（id前缀/唯一来源文本/专用sentinel）；不只grep answer泛词，不把类型字段当泄露。实际构建/扫描明确在npm run build之后执行，不能把npm test中不含产物的单测冒充真实扫描。
七轮结束timer表无pending；forfeit、refresh、offline/resume、server recovery后结果一次；终局返回大厅清理UI订阅。
复用Playwright配置独立3178端口/临时DATA_DIR。该helper会清理e2e临时目录，确认它不是用户数据目录再跑；端口被别的工作占用就报告，不杀掉未知进程。
**验证**：05命令组 + 真实手机/LAN验收报告。Android若交付按T10附加门。

## T10：发布、交接、清理

**写**：本目录STATUS.md、`reports/final-acceptance.md`；实际产品构建由现有命令产生。
- 全局CI必要门：typecheck/lint/test/compliance:d1/build/test:e2e；存量失败单列，不能因为不是自己引起就写全通过。
- Web构建 `npm run build` 同步client/dist；Android内嵌主机必须 `node scripts/build-server-bundle.mjs`，按需要 `npm run build:apk`，不能只sync前端就声称内嵌游戏可用。
- 不在本任务自动部署公网、发布商店或替换用户正在使用的APK。
- 关闭**本任务创建且仍不需要的**server/preview/浏览器辅助进程；记录PID、端口、用途和退出结果。绝不 `taskkill /IM node.exe /F` 批量杀其他项目。
- 报告剩余未完项，未过真机不升M4。
