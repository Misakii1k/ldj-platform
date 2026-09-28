# 伪人测试「法庭庭审现场」验收报告（design-spec §11.4）

日期：2026-09-28 · 状态：**待用户看图**

## 机器门

| 项 | 结果 | 命令 / 说明 |
|---|---|---|
| typecheck | PASS（本任务文件 0 错误） | `npm run typecheck`；仅剩并行会话在途文件既有报错（WerewolfStage.tsx、wits-wagers/seats.ts、uno-house-schemas.test.ts） |
| build | PASS | `npm run build` 退出码 0 |
| 单测 | PASS（本任务域） | `npx tsx --test packages/games/echo-judge/tests/*.test.ts packages/client/tests/echoJudgeStage.test.ts` 45/45 + 3/3；全量 `npm test` 仅 4 个失败，均属并行会话域（werewolf 驱动 ×1、measure-loc/third-game-baseline ×3），本任务未触碰 |
| viewport-contract | PASS 20/20 | `npx playwright test e2e/game-viewport-contract.spec.ts`（含 echo-judge 与 echo-judge-sim 七档视口） |
| motion-contract | PASS 2/2（echo-judge） | `npx playwright test e2e/motion-contract.spec.ts --grep "伪人测试"`（reduced 停装饰 / off 全关） |
| e2e 完整局 | PASS 1/1 | `npx playwright test e2e/echo-judge-tabletop.spec.ts` |
| visual-audit 6b echo-judge 段 | PASS（出图 22_echo_judge_tabletop.png） | 6b/6c 在 bell-clash 段失败：bell-clash/uno 文件正被并行会话改写，其页面暂不渲染 `.tabletop-shell`，与本任务无关（已核实失败页快照为铃铛对决） |
| 几何检查（截图内嵌） | PASS 13/13 无异常 | `capture-court-shots.ts` 逐张断言：无横向滚动、法庭在视口内、卷宗区与左右旁听席不重叠、审判席不压卷宗 |

## 视觉判定（状态：待用户看图）

对照物：`docs/echo-judge-court-reference.html`（用户在 DESIGN-REVIEW 中确认的唯一基准）。
Fixture：6 人固定昵称（阿杰/老王/可可/小鱼干/Momo/糯米）、真实 WS 对局；第 2 轮立案/作答/审判/宣判；宣判为混合案（抓对 1 + 冤枉 1 + 漏网 1）。

| 画面 | 截图绝对路径 | 对照物 | 事实描述 | 用户结论 |
|---|---|---|---|---|
| 立案·审判长 1280x800 | D:\项目\docs\superpowers\reports\2026-08-15-game-ui-refresh\echo-judge-court\echo-judge-setup-judge-1280x800.png | 参照稿 S1 | 墙面+木地板、中央审判席（深色法官卡骑顶+木槌）、左右旁听席各列、中央三张卷宗卡（甲米橙/乙浅绿/丙浅紫竖向页签、±3° 旋转、「立这一案→」）、底栏深色身份条+「自己出题」 | （空，等用户） |
| 立案·审判长 390x844 | …\echo-judge-setup-judge-390x844.png | 参照稿 S1 移动版 | 旁听席上下两条、卷宗改竖排整行卡（左侧竖排品类页签）、底栏同桌面 | （空，等用户） |
| 立案·旁听席 1280x800 | …\echo-judge-setup-player-1280x800.png | 参照稿 S1 | 虚线「封」封条（审判长挑卷宗中）+「当人类/当伪人」两大卡，伪人卡深色底+黄色暗号卡 | （空，等用户） |
| 立案·旁听席 390x844 | …\echo-judge-setup-player-390x844.png | 参照稿 S1 移动版 | 同上，两卡上下排；身份条显示「暗号『书签』」 | （空，等用户） |
| 轮流作答 1280x800 | …\echo-judge-answering-1280x800.png | 参照稿 S2 | 卷宗·第 2 案大纸卡（双关引号、红色口述角标、证人席）、5 条彩色进度药丸、当前发言人黄框浮起、底栏黄色「我说完了」、右上绿色圆环倒计时 | （空，等用户） |
| 轮流作答 390x844 | …\echo-judge-answering-390x844.png | 参照稿 S2 移动版 | 同上压缩版；进度 2/5；身份条「暗号『怀表』」 | （空，等用户） |
| 轮流作答·9 人 1280x800 | …\echo-judge-answering-9p-1280x800.png | 参照稿 S2（6 人） | 8 席左右两列各 4、进度 1/8、法官阿杰聆听中 | （空，等用户） |
| 审判·审判长 1280x800 | …\echo-judge-judgment-judge-1280x800.png | 参照稿 S3 | 暗角收拢、点选席位红色「指认」章、卷宗内「已指认 2 人」+ 名牌 + 判罚提示、底栏「宣判·指认 2 人」+「没人是伪人」 | （空，等用户） |
| 审判·审判长 390x844 | …\echo-judge-judgment-judge-390x844.png | 参照稿 S3 移动版 | 同上压缩版 | （空，等用户） |
| 审判·旁听席 390x844 | …\echo-judge-judgment-player-390x844.png | 参照稿 S3 | 卷宗内深色条「审判长正在斟酌……谁被点了你看不到」，旁听席不可点 | （空，等用户） |
| 宣判 1280x800 | …\echo-judge-verdict-1280x800.png | 参照稿 S4 | 混合案：被告席翻面（小鱼干「伪人」章+灰分、Momo 深色逃脱卡+蓝「逃脱」章+绿 +2）、中央告示牌「抓到 1 个伪人·还有 1 个伪人漏网·冤枉了 1 个人类」+ 账单卡（审判长抓对 1·冤枉 1 → ±0）、底栏「宣判中……」+「跳过」 | （空，等用户） |
| 宣判 390x844 | …\echo-judge-verdict-390x844.png | 参照稿 S4 移动版 | 同上压缩版 | （空，等用户） |
| 终局 1280x800 | …\echo-judge-game-over-1280x800.png | 参照稿 S4 终局支 | 全员翻面、告示牌「审判结案 · <胜者> 胜」、平台「再来一局」面板 | （空，等用户） |
| 终局 390x844 | …\echo-judge-game-over-390x844.png | 同上 | 全员翻面（人类蓝章/伪人红章+珊瑚红暗号），结案告示牌 | （空，等用户） |

另附逐张几何测量：`…\echo-judge-court\geometry-report.json`。采集可重跑：`npx tsx docs/plans/2026-09-26-echo-judge-visual/capture-court-shots.ts`。

## 实现中修的既有问题（顺带修复记录）

1. 外壳背景被平台规则 `.tabletop-shell[data-game-id]{background:transparent!important}` 强制透明，旧「赛博测谎实验室」背景图（`bg_echo_judge_portrait/landscape.jpg`，经 `::before`）透出——已在 echo-judge.css 内用更高优先级 + `content:none` 撤下旧图、铺法庭墙面。
2. `--ej-*` 局部变量原挂 `.ej-court`，底栏（在 `.ej-court` 之外）取不到导致身份条透明——改挂 `.tabletop-theme-court`。
3. 法官卡 `position:absolute` 被同特异性、后定义的 `.ej-seat{position:relative}` 覆盖——提权为 `.ej-bench .ej-seat--judge`。

## 用户看图记录

- （空，等待用户看图后回填；视觉「实现完成」不以本报告为准）
