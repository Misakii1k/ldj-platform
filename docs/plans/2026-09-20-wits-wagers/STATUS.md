# 交接状态

更新时间：2026-09-20（T10 完成）；规划包v0.2；工作区D:\项目，HEAD核对为21c2daf（main）。

## 当前结论

**T00–T10 全部任务已圆满完成。**
一智千金（Wits & Wagers）平台适配版已全链路接入并验收通过：
- 规则引擎、状态机、V2服务模块、持久化会话、崩溃恢复确定性通过全部断言；
- 首期 35 题经审校事实题库与独立审核记录；
- 前端组件与控制器、无横向溢出视口适配、草稿单测与全量 Playwright E2E（视觉快照、完整开局流转、断线恢复）全绿通过；
- 客户端零游戏包依赖（C01）与产物零题库泄露边界门 100% 达标；
- 全量 CI 门通过（扣除存量 38 个 werewolf lint 错误与 4 个 d4 脚本失败，0 新增回归）；
- 无任何常驻残留进程。

## 契约修订

|编号|内容|状态|
|---|---|---|
|C01|包结构改「方案 A：按平台现状」——exports 仅 `./manifest`+`./server`，客户端视角 parser 放 `client/src/game/wits-wagers/types.ts`，**客户端保持零游戏包依赖**|2026-09-20 用户确认，已写入 02 §2 与 04 T01|

## 已完成

- 读取用户规则和研究报告；检查North Star Games Deluxe官方PDF文字与用户规则差异。
- 定义平台适配版、赔率完整表、账本、状态机、动作、视角和恢复边界。
- 制定2D页面/交互/多尺寸/对比度要求；尚无已批准截图。
- T00–T10分工、文件白名单、验收门、交接提示词已写全。
- golden-cases.json：8组赔率、8组判胜、12组账本、3组全轮、3组排名、1组七轮、10组拒绝场景，共45组。其中35组数值黄金用例可由规划校验器检查；10组行为要求需要未来产品测试实现。
- 修正players兼容性、expectedSeq并发失败策略、准入台账、静态TS题库、V2错误映射、结算后的余额投影、预览入口依赖等接入问题。
- **T00：工作区基线已建立（typecheck 0 / lint 1 / test 1 / d1 0 / build 0），存量失败已定位并与本功能切割；G0 七项全部获用户确认；03视觉契约按P6重写。证据见 reports/T00-baseline.md。**
- **T01：契约修订 C01；包骨架 + manifest + 客户端严格视角 parser 完成。29 tests 全绿，8 个关键守卫经变异测试确认非空转；typecheck/build 通过；客户端仍零游戏包依赖。证据见 reports/T01-package-contract.md。**
- **T02：纯函数赔率、判胜、账本完成。golden-cases.json 35 组数值黄金算例（B01–B08, W01–W08, S01–S12, R01–R03, K01–K03, F01）及核心边界用例 13 tests 全部通过；typecheck / eslint 0 error。证据见 reports/T02-rules-engine.md。**
- **T03：schema、初始状态、纯 reducer 与 timer effects 完成。严格状态生命周期（created -> answering -> arranging -> betting -> settlement -> game_over）、提前翻牌、P1 超时补 1、拒绝场景 X01/X02/X05/X06/X07 及完整七轮虚拟时间推演 15 tests 全部通过；typecheck / eslint 0 error。证据见 reports/T03-state-machine.md。**
- **T04：白名单视角、题库适配和 V2 包装完成。witsWagersModule（GameModuleV2）、静态题库抽取、白名单视角投影（非参赛者 me:null、观战者无 me 键、作答阶段防偷看）、客户端 parser 补齐 revealed/history/result 严格校验并对拍 15 tests 全部通过；全量 wits-wagers 69 tests 全绿；typecheck / eslint 0 error。证据见 reports/T04-module-and-views.md。**
- **T05：最小接入与持久化回归完成。注册表 registry、目录 catalog、准入台账 game-admission 同步登记且 D1 compliance PASS；会话事务链（timers 表排定、提前翻牌取消旧 timer、下注与结算）与真实文件 SQLite 崩溃恢复测试 13 tests 全部通过；全量 82 tests 全绿；typecheck / eslint 0 error。证据见 reports/T05-persistence-and-registry.md。**
- **T06：题库内容与独立审校完成。首期 35 道正整数事实题入库（覆盖地理、历史、天文科技、自然生物、体育工程与艺术），每题具备权威来源 URL、口径说明与 reviewed: true 标记；审校清单记录于 docs/game-library/wits-wagers/question-review.md；单测与 typecheck 通过。证据见 reports/T06-question-bank.md。**
- **T07：固定样例界面与草稿测试完成。组件库（GuessPanel, WitsWagersTable, BetEditor, ResultPanel, WitsWagersGamePage, wits-wagers.css, betDraft.ts）就位；遵守平台浅色纸感 + accent=ocean（P6）与无非规范断点；草稿单测 4 tests 通过；Playwright 视觉驱动 V1/V2/V3 生成 4 张截图并通过横向溢出断言。证据见 reports/T07-visual-prototype.md。**
- **T08：真实前端动作、开放入口与 WS 私密性完成。useWitsWagersController 动作与 STALE_CLIENT_STATE 自动重同步；网关集成测试 witsWagersGateway.test.ts 验证全链路开局与隐私过滤；Playwright 真实浏览器 E2E 测试 e2e/wits-wagers.spec.ts 验证 2 人拦截、3 人真实 DOM 作答、全员答齐提前翻牌与版图自动渲染；全部通过。证据见 reports/T08-controller-and-privacy.md。**
- **T09：故障/构建/泄露门完成。边界校验脚本 scripts/verify-wits-wagers-client-boundary.mjs 证实客户端源码零游戏包依赖（C01）且 dist 产物零题库特征词泄露；单测 scripts/tests/wits-wagers-client-boundary.test.mjs 5 tests 全部通过；E2E 刷新恢复测试 e2e/wits-wagers-recovery.spec.ts 通过。证据见 reports/T09-boundary-and-recovery.md。**
- **T10：发布、交接、清理与最终验收完成。全局 CI 必要门全量运行，存量基线隔离（tsx 段 1469/1469 pass，scripts 段存量 4 项与 T00 严格吻合；lint 存量 38 项严格吻合，本功能 0 error 0 warning）；产物构建同步，无常驻残留进程。证据见 reports/final-acceptance.md。**

## 未完成（不能宣称已验证）

- 准入真实最终审批（正式上线前）。
- 视觉关键页面最终样稿需负责人核验。

## 决策记录

|项|当前状态|来源/下一步|
|---|---|---|
|核心玩法|用户选择最后一份规则为基线|七轮、2枚筹码、正整数、净赔率、同分先比获胜答案次数|
|P1 超时作答|**已确认（2026-09-20）**|系统补1并标记系统补答；不得+3作者奖励、不计winningGuesses|
|P2 超时下注|**已确认（2026-09-20）**|保留服务端最后确认的整组投注；未放置即不下注，不强制押分|
|P3 时长节奏|**已确认（2026-09-20）**|作答默认30秒、建房可选60/90，答齐可提前；下注走满时长不提前封盘；排序3秒、结算8秒|
|P4 再次平局|**已确认（2026-09-20）**|分数→获胜答案次数→仍同则并列冠军；不采集生日、不加赛|
|P5 队伍设备|**已确认（2026-09-20）**|3–7席位，一席位=一提交身份=一设备，小队共用一台；不改平台权限模型|
|P6 视觉|**已确认（2026-09-20）**|**完全复用平台浅色纸感 `--game-*` 令牌 + accent=ocean；03第3节原深绿色表作废并已重写**|
|P7 数值/内容/AI|**已确认（2026-09-20）**|1..999999999999正整数；发布目标70题；首版无任何付费AI，离线LAN可玩|
|准入审批|未提供|现有项目要求真实记录，不由模型代签，不阻止纯模块原型测试|

## 基线（T00 实测，2026-09-20）

|命令|退出码|结论|
|---|---|---|
|`npm run typecheck`|0|通过|
|`npm run lint`|1|**存量** 38 errors / 17 文件|
|`npm test`|1|tsx段 1391/1391 通过；scripts段 64/68，**存量失败4项**|
|`node scripts/d1-compliance.mjs .`|0|PASS|
|`npm run build`|0|通过|

存量4项失败全部在 `scripts/tests/d4/`，根因是 `packages/games/werewolf/server/module.ts` 在途改动脱离 D4 冻结基线（baseline `40b304ad…`/1571行 vs 当前 `a41555b9…`/1872行）。
**后续任务卡报告测试结果时必须扣除这4项与38个lint error，不得写"全部通过"；也不得顺手修复他人在途工作。**
日志：`output/wits-wagers-baseline/{npm-test,npm-lint,npm-build,compliance-d1}.log`。
开发基线决定：**继续在 `D:\项目` main 局部新增，不建 worktree**（理由见 T00报告 §1.4）。

## 下一步

**全部研发任务已完成（T00–T10 全部闭环）。**
交付产物与报告汇总于 `reports/final-acceptance.md`。
后续仅待：正式上线前准入负责人真实签署与视觉样稿签字。

## 验证记录

本包自检：**225条断言通过**（T00 将色值断言从旧深绿表同步为 P6 平台令牌，并新增 accent 天花板与 03 同步检查；两条新断言经反向用例验证确会失败）。16个既有引用路径存在。详见reports/plan-verification.md 与 reports/T00-baseline.md §6.1。verify-plan.py只读验证规划文件和独立算术，不修改产品，也不访问网络。
项目测试：**T00已执行，结果见上方基线表**。产品服务进程：T00未启动任何常驻服务，所有命令为前台一次性执行，无需清理PID。

## 执行后更新格式

- 当前任务 / 已通过门 / 当前分支与基线：
- 用户新增明确决策（原话摘要及时间）：
- 本次改动白名单 / 实际改动路径：
- 命令结果 / 报告位置 / 未执行项：
- 还需解决的唯一下一问题：
- 下一张卡与可并行范围：
- 本任务创建进程是否清理：

