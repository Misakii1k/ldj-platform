# R2 任务卡：UNO 页面修复与手机版完善（用户驳回后迭代）

- 日期：2026-09-28
- 上游：本目录 `README.md`、`contracts/uno.md`、`tasks/T3-uno.md`；像素参照 `docs/ui-preview/cards-trio/r2/uno-1-play.html`、`uno-2-result.html`
- 背景：R1 交付被用户驳回；本轮按 R2 计划执行，同一截图位必须给 before/after 同视口对照（before 已存 `../before-r2/`）

## 用户已拍板决策

1. 结算逐张翻开：补下发字段 `lastRound: { roundNumber, finisherPlayerId, remainingHands } | null`，viewVersion 1 → 2（客户端与服务端同发版，旧端 fail-closed 重同步，已接受）
2. 紧凑模式点按行为保持现状：第一下抽出看，第二下出牌

## 范围与文件白名单

允许改动的文件（不在此列的一律不动）：

- `packages/client/src/game/party-table/party-table.css`（只增不改默认值，Ding 共用）
- `packages/client/src/game/party-table/PartySlam.tsx`
- `packages/client/src/game/uno/stage/UnoHouseStage.tsx`
- `packages/client/src/game/uno/stage/UnoRoundResult.tsx`
- `packages/client/src/game/uno/stage/useUnoHouseStage.tsx`
- `packages/client/src/game/uno/stage/deriveStageEvents.ts`
- `packages/client/src/game/uno/stage/ringLayout.ts`（删除）
- `packages/client/tests/unoRingLayout.test.ts`（删除）
- `packages/client/src/game/uno/uno.css`
- `packages/client/src/game/uno/types.ts`
- `packages/client/src/game/viewRegistry.ts`
- `packages/client/src/motion/ambientMotion.ts`（失效选择器同步）
- `packages/client/src/game/tabletop-game-motion.css`（失效选择器同步）
- `packages/games/uno/server/house/{types,schemas,rules,module}.ts`
- `packages/games/uno/tests/house/{rules,schemas,registry}.test.ts`
- `packages/client/tests/` 下 UNO 解析相关测试
- `e2e/cards-trio-capture.spec.ts`、`e2e/game-viewport-contract.spec.ts`
- `packages/client/src/game/ding/BellClashGamePage.tsx`（仅移除显式 cardWidth，行为不变）

禁止：新增依赖/字体/图片；新增非白名单断点；改 `uno_legacy_platform_v1` 及其它游戏；改 CardFanEngine 默认行为；一屏多个黄色主行动。

## 执行清单

| # | 项 | 优先级 |
|---|---|---|
| 1 | PartySlam 永久残留修复（css opacity:0 + keyframes、组件 armed 状态、结果页 slamText 初值 ''） | P0 |
| 2 | 结算按钮坞改底部居中（与契约 §4.2 右下不符，已在计划 §7 标记，待用户看图裁决） | P0 |
| 3 | draw4 fixture 去掉 `sourcePlayerId`（5 键形状），补 per-frame 断言 | P1 |
| 4 | `.pt-me-sticker` 手机 bottom 140→196px；桌面去 translate 防裁切 | P1 |
| 5 | 卡牌尺寸令牌化 `--fan-card-w/--fan-card-h`（86/127、60/89、44/64 三档） | P1 |
| 6 | 对比度：4× muted→`--gp-muted`；`.pts.zero`→`--gp-green-dark`；UNO! 徽章底→`--gp-coral-dark` | P1 |
| 7 | 飞行卡牌可见化：事件带 card、PartyCard 渲染、样式（奶油底+3px 墨边+硬阴影） | P2 |
| 8 | `gp-button`→`gp-btn`（6 处） | P2 |
| 9 | 补 `@keyframes pt-flip-in` / `.pt-card.flip` / `.pt-winner-badge.in` pop | P2 |
| 10 | 清理：sweepColor、ringLayout、孤儿媒体块、uno.css 死选择器、ambientMotion 失效选择器 | P2 |
| 11 | 连线：`lastRound` 全链路 + viewVersion 2 + 测试 | P0 |
| 12 | 机器门全绿 → 重截 12 图（新增 uno-match-result） → 报告 | — |

## 验收

- 机器门：typecheck / lint / test / compliance:d1 / build / 指定 e2e 全绿（另列）
- 视觉：全部项 = 待用户看图；before/after 同视口成对给出绝对路径
- 隐私不变量：`round_playing` 期间 `lastRound === null`
