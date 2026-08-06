# D4-B-UI 卧底白板主舞台（undercover_blank_v1）结果

> 执行：P4 UI 链第二门（D4-B-UI / = D4-UI2）。全部变更保留在未提交工作树；未执行任何 Git 状态变更命令；不 commit；无真实 LLM（E2E 服务端 llmAvailable=false，机器人/裁判零真实供应商调用，本地精确匹配零 provider 调用）。

## 结论

**PASS（4/4 Playwright）。** `undercover_blank_v1` 主舞台经真实 Chromium Playwright 验收通过：
- 平台开局成功链：`start_game({ rulesetId: 'undercover_blank_v1', speechSeconds, voteSeconds })` 经真实服务器成功开局（依赖 D4 平台 ruleset 路由修复，按 (moduleId, rulesetId) 精确解析 blank 模块），word_reveal 帧 `engineContractVersion=2`、`role=player`。
- 有词/无词视角不泄漏：平民词条默认隐藏（占位文案），长按（pointerdown）才显示、松手遮挡；白板显式无词；他人都市词绝不进入 DOM（以平民词明文做泄漏探测，`toHaveCount(0)`）。
- 无词视角 + 全流程：白板看词不泄漏 → 发言/投票渲染 → 终局猜词 30 秒倒计时 → `skip` 真实 game_action → 平民方获胜。
- 终局猜词 `submit` 真实 action：白板提交正确平民词 → 本地精确匹配零 provider 调用 → 白板方获胜（host 权威 game_state winner=blank）。

## Oil-frontend 调用与审查结论

**每门实施前单独调用 `oil-frontend` skill（本门一次）。** 按已加载参考（component-contract / information-and-action-contract / scope-and-state-integrity-contract / state-and-loading-contract / viewport-and-dialog-contract / verification-contract）审查结论：

1. **真实数据来源**：唯一权威来源 = 服务端 blank 模块 `getPlayerView/getSpectatorView` → `blankPlayerViewSchema`（zod strict）→ `buildGameStatePayload` → client `viewRegistry.parseGameView`（`(undercover, undercover_blank_v1, 1)`）→ `parseBlankView`（undercover/types.ts，exact-keys 严格解析）。`UndercoverBlankStage` 只消费该解析结果；昵称来自 `room_snapshot.members`。无第二数据副本。
2. **组件归属**：`undercover/stage/UndercoverBlankStage.tsx` 为唯一主舞台；类型/解析器在 `undercover/types.ts`；样式归 `styles.css` `.blank-*` 业务段；共用 `GameLeaveButton`/`useGameAction`/`useCountdown`/`nameFor`；`viewRegistry` 注册 blank 键、`GamePage` 按 `rulesetId === 'undercover_blank_v1'` dispatch。
3. **动作边界**：confirm_word/finish_speech/cast_vote/submit_guess/submit_final_guess/skip_final_guess 全部经 `useScopedAction.act` → `send('game_action', payload)` 真实 WS 提交；`busy` 只锁定对应动作（按钮 disabled），非全页遮罩；`error` 以 `role="alert"` 就地显示且保留已输入内容（超长猜词被服务端拒绝后输入仍在——spec 已断言）。提交边界 = 即时服务端提交。
4. **裁判任务 sessionId 数据流修复（本门唯一净新增客户端改动）**：平台 `applySessionAction` 对 `enqueue_adjudication` effect 校验 `taskEffect.sessionId === session.id`；模块初始状态 `sessionId:''` 且猜词动作原不携带 sessionId → 提交被 deny → 30 秒终局超时按猜错。修复：`UndercoverBlankStage` 从 `game_state` 信封的 `state.game.sessionId` 读取会话标识，随 `submit_guess`/`submit_final_guess` 回传（仅 sessionId 存在时附加）。这使外部裁判任务真实入队，本地精确匹配链路可用。属于真实数据流修复，非测试伪造。
5. **状态矩阵**：phase（word_reveal/speaking/voting/runoff_voting/vote_result/final_guess/game_over）分块渲染；`guessPending`（等待裁判层）在非 final_guess 阶段显示脉冲状态；`deadlineAt` 倒计时（`剩余 N 秒`）；观战 me=null 只显示观战提示；busy/error 互斥。
6. **Viewport/geometry**：`.blank-stage` 内容驱动尺寸 + flex-wrap；`@media (max-width:520px)` 玩家卡 `min-width:44%`；长词/错误提示不产生水平溢出；1280×800 与 390×844 实测通过。

## 测试（每门只跑自己的 spec；先 `npm run build`）

`npm run build` → `npx playwright test e2e/undercover-blank.spec.ts` → **4 passed / 0 failed**（约 1.1m，含 30 秒终局流程）。

| 测试 | 结果 | 证据 |
| --- | --- | --- |
| 平台开局成功链（start_game + word_reveal） | pass | ack + `rulesetId=undercover_blank_v1` + engineContractVersion=2 |
| 有词视角不泄漏（长按显示/松手遮挡，他人都市词不入 DOM） | pass | 占位文案可见、`.blank-word-card__word` 计数与明文 `toHaveCount(0)` |
| 无词视角 + 全流程 + 30 秒倒计时 + skip → 平民胜 | pass | 倒计时匹配 `/^剩余 \d+ 秒$/`，host game_state winner=civilian |
| 终局猜词 submit 正确词 → 白板胜（本地精确匹配零 provider） | pass | host game_state winner=blank，结算页渲染 |

## 回归与约束

- 客户端 `tsc -p packages/client/tsconfig.json` 零错误；`npm run build` 通过。
- 未修改 server/games/shared/registry/catalog；未执行任何 Git 状态变更命令；无真实供应商 LLM 调用（welcome `llmAvailable=false` 断言 + 本地精确匹配零 provider）。
- 遗留：P6 全量质量门（lint/`npm test`/compliance:D1 build 前后/D1 双 SHA/diff check）统一执行。
