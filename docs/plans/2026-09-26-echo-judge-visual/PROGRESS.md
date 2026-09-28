# 进度（2026-09-26 起）

执行模型每完成一步追加一行证据；视觉项只能写「待用户看图 / 用户已确认（日期）/ 用户驳回（原话）」。

| 任务 | 状态 | 证据（命令 · 退出码 · 截图路径） |
|---|---|---|
| T0 服务端上轮判决字段（等 §6 第 1 条） | 完成（用户 2026-09-28 拍板方案 A） | `npx tsx --test packages/games/echo-judge/tests/*.test.ts packages/client/tests/echoJudgeStage.test.ts` 45/45 + 3/3 通过；`npm run typecheck` 本任务文件无错误（仅剩并行会话在途的 WerewolfStage.tsx / wits-wagers/seats.ts 两处既有报错） |
| T1 法庭骨架 | 实现完成 · 待用户看图 | `npm run typecheck` 本任务文件 0 错误；`echoJudgeStage.test.ts` 分边/已发言集合单测通过；几何检查见 geometry-report.json |
| T2 ② 轮流作答 | 实现完成 · 待用户看图 | 卷宗/进度条/发言人黄框/话筒抛物线 560ms + 交棒木槌；`npx playwright test e2e/echo-judge-tabletop.spec.ts` 1 passed |
| T3 ① 立案 | 实现完成 · 待用户看图 | 审判长三卷宗（页签三色已确认）+ 选中盖章；旁听席身份二选一 + 暗号卡；旧侧栏与 IdentityFlipCard 已移除；「自己出题」内联表单（原页面无此入口，按参照稿演示说明实现为内联表单） |
| T4 ③ 审判 | 实现完成 · 待用户看图 | 暗角/点席位指认/「指认」章/旁听席斟酌条 + 举槌循环；SeatTargetPicker 已删 |
| T5 ④ 宣判 + 终局（依赖 T0） | 实现完成 · 待用户看图 | 翻面序列/告示牌四情形/账单卡单测通过；中途演出 ≤2.4s + 停留 900ms 可跳过；终局停留 + 暗号仅从 reveal 取；接 TabletopVictoryBurst |
| T6 验收 | 完成 · 待用户看图 | `npm run build` ✓；e2e echo-judge-tabletop 1/1 ✓；motion-contract echo-judge 2/2 ✓；game-viewport-contract 20/20 ✓；visual-audit 6b echo-judge 段出图 ✓（6b/6c 在 bell-clash 段失败＝并行会话在途改动，非本任务）；截图 13 张 + 几何检查 0 异常 → `docs/superpowers/reports/2026-08-15-game-ui-refresh/echo-judge-court/`；报告 `REPORT.md` |

## 用户看图记录

- （空）
