# 斗地主 / UNO / Ding 视觉重做 · 进度

> ⚠️ **2026-09-27 修复轮 R1**：用户反馈「已实现效果不好」后，用读图 + DOM 取证查出并修复 **10 处缺陷**（含 1 处致命：UNO/Ding 画面被巨型黑色团块盖住，根因是 `party-table.css` 从未被 import；另有 Ding 圆盘错位、手牌牌宽偏差、旧规则配置项残留、叫分假数据、质疑面板折行/出屏/头像撑破/对比度不足）。
> **修复报告（含前后对照）**：`docs/plans/2026-09-26-cards-trio-visual/reports/R1-fix-report.md`
> **重采集的截图组（39 张）**：`docs/superpowers/reports/2026-08-15-game-ui-refresh/baseline/`
> 执行模型每完成一个任务更新一行。视觉栏只允许：`待用户看图` / `用户已确认（日期）` / `用户驳回（原话）`。

| 任务 | 状态 | 完成日期 | 机器门（命令 → 退出码） | 改动文件 | 视觉 |
|---|---|---|---|---|---|
| R2.4 UNO 顶部栏（规则按钮） | 已完成（等看图） | 2026-09-28 | typecheck(0), build(0), cards-trio-capture UNO(1/1 pass) | UnoHouseStage.tsx + uno.css（顶部操作区 + 规则抽屉） | 待用户看图 |
| R2.3 UNO 标记去重 | 已完成（等看图） | 2026-09-28 | build(0), cards-trio-capture UNO(1/1 pass) | UnoHouseStage.tsx（删 unoCalled 说话泡分支，保留角标） | 待用户看图 |
| R2.2 牌数图标+倒计时位置 | 已完成（等看图） | 2026-09-28 | build(0), cards-trio-capture(3/3 pass) | party-table.css（牌叠图标）, UnoHouseStage.tsx + uno.css（倒计时钉右上角，修 active 态裁切回归） | 待用户看图 |
| R2.1 手机竖屏席位收紧 | 已完成（等看图） | 2026-09-28 | build(0), cards-trio-capture(3/3 pass) | PartySeatRing.tsx（ry 244→190 / spread 72°→80°，仅移动端） | 待用户看图 |
| R2 UNO 修复+手机版 | 已完成（等看图） | 2026-09-28 | typecheck(0), lint(0), test(UNO 范围 50/50 pass；狼人杀工作流 4 项既有失败与本轮无关), compliance:d1(PASS), build(0), e2e(uno-house 4/4, uno-legacy 2/2, capture UNO 1/1 共 12 shots；viewport-contract/motion-contract/bell-clash-tabletop 受并行会话端口干扰未复验——用户 2026-09-28 决定免跑) | party-table.css, PartySlam.tsx, UnoHouseStage.tsx, UnoRoundResult.tsx, useUnoHouseStage.tsx, deriveStageEvents.ts, uno.css, uno/types.ts, viewRegistry.ts, ambientMotion.ts, tabletop-game-motion.css, server/house/{types,schemas,rules,module}.ts, 测试×4, e2e×2, 删 ringLayout.ts+其测试；round_over 驻留/begin 推进为计划外已确认改动 | 待用户看图 |
| R1 修复轮 | 已完成 | 2026-09-27 | typecheck(0), lint(0), test(1598 pass/0 fail), compliance:d1(0), build(0), cards-trio-capture(3/3 pass, 39 shots) | main.tsx, bell-clash.css, UnoHouseStage.tsx, BellClashGamePage.tsx, catalog.ts, VictoryScroll.tsx, LandlordGamePage.tsx, module.ts, deriveStageEvents.ts, cards-trio-capture.spec.ts | 待用户看图 |
| T0 基线 | 已跳过 | 2026-09-27 | — | — | — |
| T1 Ding 规则 | 已完成 | 2026-09-27 | typecheck(0), lint(0), test(48/48 pass, 0 fail), compliance:d1(0), build(0) | packages/games/bell-clash/server/*, tests/*, RULES_ORIGINAL.md, game-admission.json, types.ts, BellClashGamePage.tsx | — |
| T2 派对桌组件 | 已完成 | 2026-09-27 | typecheck(0), lint(0), test(1592 pass, 0 fail), compliance:d1(0), build(0) | packages/client/src/game/party-table/*, shared-ui/CardFanEngine.tsx, tests/cornerHandLayout.test.ts | 待用户看图 |
| T3 UNO | 已完成 | 2026-09-27 | typecheck(0), lint(0), test(1592 pass, 0 fail), compliance:d1(0), build(0), e2e(uno-house: 4 pass, viewport-contract uno: 1 pass, uno-legacy: 2 pass) | packages/games/uno/server/house/*, packages/games/uno/tests/*, packages/client/src/game/uno/*, packages/client/src/game/party-table/*, e2e/uno-house.spec.ts, e2e/game-viewport-contract.spec.ts | 待用户看图 |
| T4 Ding 页面 | 已完成 | 2026-09-27 | typecheck(0), lint(0), test(1592 pass, 0 fail), compliance:d1(0), build(0), e2e(bell-clash-tabletop: 3 pass, viewport-contract bell-clash: 2 pass) | packages/client/src/game/bell-clash/*, e2e/bell-clash-tabletop.spec.ts, e2e/game-viewport-contract.spec.ts | 待用户看图 |
| T5 茶馆组件 | 已完成 | 2026-09-27 | typecheck(0), lint(0), test(1594 pass, 0 fail), compliance:d1(0), build(0), breakpointContract(3 pass), teahouseHandFit(2 pass) | packages/client/src/game/landlord/teahouse/*, packages/client/tests/teahouseHandFit.test.ts | 待用户看图 |
| T6 斗地主 | 已完成 | 2026-09-27 | typecheck(0), lint(0), test(1595 pass, 0 fail), compliance:d1(0), build(0), e2e(landlord-platform: 2 pass, viewport-contract landlord: 1 pass) | packages/games/landlord/server/platform/*, packages/client/src/game/landlord/*, e2e/landlord-platform.spec.ts, e2e/game-viewport-contract.spec.ts | 待用户看图 |
| T7 截图组 | 已完成 | 2026-09-27 | e2e/cards-trio-capture.spec.ts(3/3 pass, 39 shots generated) | e2e/cards-trio-capture.spec.ts, docs/superpowers/reports/2026-08-15-game-ui-refresh/baseline/*.png, reports/T7-screenshots.md | 待用户看图 |

### T1 规则用例对照表（`ding-rules.md §7` 14条）

| # | 契约要求 | 测试用例名 | 测试文件 |
|---|---|---|---|
| 1 | 任何人（非当前出牌者）都能拍铃；拍铃时 turn_timeout 被取消、challenge_timeout 被排上 | `规则 1：任何人（非当前出牌者）都能拍铃；拍铃时 turn_timeout 被取消、challenge_timeout 被排上` | `packages/games/bell-clash/tests/rules.test.ts` |
| 2 | 拍铃打出的短语卡颜色与顶牌不同也被接受 | `规则 2：拍铃打出的短语卡颜色与顶牌不同也被接受` | `packages/games/bell-clash/tests/rules.test.ts` |
| 3 | hand[cardIndex] 不是短语卡 → 拒绝；challenge 进行中再拍 → 拒绝 | `规则 3：hand[cardIndex] 不是短语卡 → 拒绝；challenge 进行中再拍 → 拒绝` | `packages/games/bell-clash/tests/rules.test.ts` |
| 4 | 5 名投票人，2 人质疑后超时 → 成功：discardTop 是这张卡，currentPlayerId 是拍铃者，拍铃者手牌 −1 | `规则 4：5 名投票人，2 人质疑后超时 → 成功：discardTop 是这张卡，currentPlayerId 是拍铃者，拍铃者手牌 −1` | `packages/games/bell-clash/tests/rules.test.ts` |
| 5 | 5 名投票人，第 3 人质疑时立即结算为拍错（不等超时）：卡回到原位，手牌 +1（罚摸），currentPlayerId 回到被打断的人 | `规则 5：5 名投票人，第 3 人质疑时立即结算为拍错（不等超时）：卡回到原位，手牌 +1（罚摸），currentPlayerId 回到被打断的人` | `packages/games/bell-clash/tests/rules.test.ts` |
| 6 | 5 名投票人里 3 人投「有」→ 已不可能过半质疑 → 立即结算成功 | `规则 6：5 名投票人里 3 人投「有」→ 已不可能过半质疑 → 立即结算成功` | `packages/games/bell-clash/tests/rules.test.ts` |
| 7 | challenge 进行中 play_card / draw_card 被拒 | `规则 7：challenge 进行中 play_card / draw_card 被拒` | `packages/games/bell-clash/tests/rules.test.ts` |
| 8 | 普通回合打出短语卡 → 不产生 challenge，回合转下家 | `规则 8：普通回合打出短语卡 → 不产生 challenge，回合转下家` | `packages/games/bell-clash/tests/rules.test.ts` |
| 9 | 摸牌自动打出短语卡 → 不产生 challenge | `规则 9：摸牌自动打出短语卡 → 不产生 challenge` | `packages/games/bell-clash/tests/rules.test.ts` |
| 10 | 拍铃成功打出最后一张手牌 → game_over，拍铃者获胜 | `规则 10：拍铃成功打出最后一张手牌 → game_over，拍铃者获胜` | `packages/games/bell-clash/tests/rules.test.ts` |
| 11 | 拍错时牌堆为空 → 不罚摸，不报错 | `规则 11：拍错时牌堆为空 → 不罚摸，不报错` | `packages/games/bell-clash/tests/rules.test.ts` |
| 12 | 视图：challenge 在公开视图里可见；其他人手牌仍不可见 | `规则 12：视图：challenge 在公开视图里可见；其他人手牌仍不可见` | `packages/games/bell-clash/tests/rules.test.ts` |
| 13 | 机器人：challenge 中且自己是投票人 → challenge_vote { doubt: false } 且被 reducer 接受；不是投票人 → null；平时从不返回 ring_bell | `规则 13：机器人：challenge 中且自己是投票人 → challenge_vote { doubt: false } 且被 reducer 接受；不是投票人 → null；平时从不返回 ring_bell` | `packages/games/bell-clash/tests/botAction.test.ts` |
| 14 | 契约套件（contract.test.ts）照旧全绿 | `铃铛对决 契约套件：identity/initial/viewSchemas` 等 6 项契约测试通过 | `packages/games/bell-clash/tests/contract.test.ts` |

## 待确认（README §5）

| # | 问题 | 执行时的默认做法 | 用户回答 |
|---|---|---|---|
| Q1 | UNO/Ding 手机紧凑模式"第一次点抽出来看、第二次点出牌" | 按此实现 | |
| Q2 | Ding 质疑窗口 3 秒、严格过半算拍错 | 按此实现，可配置 | |
| Q3 | 拍铃打断别人回合，别人的选择作废 | 按此实现 | |
| Q4 | 斗地主要不要「提示」按钮 | 先不做 | |
| Q5 | 平板竖屏 768×1024 也显示斗地主旋转提示 | 显示 | |

## 用户看图记录

- 2026-09-28 R2 截图组：「挺好的」，唯一优化点 = 竖屏手机端对手席位不贴合圆桌（不如横屏围着桌子）→ 已以 R2.1 收紧移动端席位环（ry 244→190、spread 72°→80°），重采集完成，待用户再看图。
- 2026-09-28 R2.1 后：「牌的剩余数量不要纯黑的……换一个 icon」「倒计时放的位置不太好，尤其竖屏」→ R2.2 牌数图标改为层叠小牌、倒计时环钉到桌面右上角，顺带修了 active 态贴纸裁切回归，待用户再看图。
- 2026-09-28 R2.2 后：「这个UNO标是不是太多了」（剩 1 张玩家同时挂角标+黑泡）→ R2.3 删除 UNO! 说话泡分支，只留角标，待用户再看图。
- 2026-09-28 R2.3 后：「行，还可以」+「顶部每个游戏都有的标题和选项栏没布置上，整上」→ R2.4 UNO 顶部操作区（规则按钮 + 规则抽屉），待用户再看图。

## 定稿来源

- 2026-09-26 用户：「挺好的」+ 三条反馈（Ding 规则、斗地主横屏、牌多显示）已在 r2 方向稿里改完。
- 2026-09-26 用户：「在我绝大多数确定的差不多的情况下，就这么做吧」→ 以 `docs/ui-preview/cards-trio/r2/` 当前版本为定稿，残留小决定列入上表 Q1–Q4。
