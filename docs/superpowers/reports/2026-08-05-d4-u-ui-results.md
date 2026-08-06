# D4-U-UI UNO house 主舞台结果

> 执行：P4 UI 链第一门（D4-U-UI / = D4-UI1）。全部变更保留在未提交工作树；未执行任何 Git 状态变更命令；不 commit；无真实 LLM（E2E 服务端 llmAvailable=false，机器人零真实供应商调用）。

## 结论

**PASS（4/4 Playwright）。** `uno_platform_house_v1` 主舞台经真实 Chromium Playwright 验收通过：
- 平台准入：uno availability=blocked_rights，`create_room` 被真实准入拒绝（ACTION_NOT_ALLOWED）——这是「非 playable 游戏不能平台建房」的真实行为，作为检测项保留，非伪造通过。
- 平台 ruleset 路由：`start_game({ rulesetId: 'uno_platform_house_v1', mode, roundCount })` 经真实服务器成功开局（依赖 D4 平台 ruleset 路由修复：`resolveRulesetForStart` 现按 (moduleId, rulesetId) 精确解析 house/blank 独立模块）。
- 宽视口 1280×800：渲染、私有性、浏览器真实抽牌/出牌 game_action 全绿。
- 窄视口 390×844：4 人局渲染、私有性、无水平溢出。

## Oil-frontend 调用与审查结论

**每门实施前单独调用 `oil-frontend` skill（本门一次）。** 按已加载参考（component-contract / information-and-action-contract / scope-and-state-integrity-contract / state-and-loading-contract / viewport-and-dialog-contract / verification-contract）审查结论：

1. **真实数据来源**：唯一权威来源 = 服务端 house 模块 `getPlayerView/getSpectatorView` → `unoHousePlayerViewSchema`（zod strict，拒绝未知键）→ `buildGameStatePayload`（views.ts）→ client `viewRegistry.parseGameView`（按 `(moduleId, rulesetId, viewVersion)` 判别）→ `parseUnoHouseView`（uno/types.ts，exact-keys 严格解析）。`UnoHouseStage` 只消费该解析结果；昵称映射来自 `room_snapshot.members`。无第二数据副本。
2. **组件归属**：`uno/stage/UnoHouseStage.tsx` 为唯一主舞台；类型/解析器在 `uno/types.ts`；样式归 `styles.css` `.uno-house-*` 业务段；共用 `GameLeaveButton`/`useGameAction`/`useCountdown`/`nameFor`；`viewRegistry` 注册 `(uno, uno_platform_house_v1)`、`GamePage` 按 rulesetId dispatch 均已完成。
3. **动作边界**：全部操作（play_card/draw_card/pass_after_draw/call_uno/catch_missed_uno/accept_penalty/challenge_penalty/stack_penalty）经 `useScopedAction.act` → `send('game_action', payload)` 真实 WS 提交；`busy`（actionState.ts submitting）只锁定对应动作（按钮 disabled），非全页遮罩；`error` 保留到下次 begin（failAction 语义），以 `role="alert"` 就地显示；wild 选色为本地草稿（confirmWild 前不提交）。提交边界 = 即时服务端提交。
4. **状态矩阵**：phase（round_playing/round_over/match_over）分块渲染；busy/error 互斥；turnDeadlineAt/windowDeadlineAt 双倒计时（expired 隐藏秒数）；me=null 观战不渲染手牌与操作；`canPlay` 以服务端 `playableCardIds` 为准并叠加 !busy/!inWindow 门禁。
5. **Viewport/geometry**：`.uno-house-players`/`.uno-house-hand`/`.uno-house-center__meta` 均 flex-wrap；`@media (max-width:620px)` 手牌卡片 17vw；卡片为固定足迹稳定点击区域；已在 1280×800 与 390×844 实测无水平溢出。
6. **验证**：真实 Chromium Playwright 断言渲染/私有性/操作/状态证据，宽窄 viewport 各一次。

## 测试（每门只跑自己的 spec；先 `npm run build`）

`npm run build` → `npx playwright test e2e/uno-house.spec.ts` → **4 passed / 0 failed**（4.4s）。

| 测试 | 结果 | 证据 |
| --- | --- | --- |
| 平台准入：create_room 被拒 | pass | 真实 error ACTION_NOT_ALLOWED |
| start_game 成功链 | pass | ack + game_state `(moduleId=uno, rulesetId=uno_platform_house_v1, engineContractVersion=2, me.hand.length=7)` |
| 宽视口操作流 | pass | 渲染标题/阶段/玩家区/弃牌堆/手牌按钮；私有性（他人只显张数）；浏览器真实抽牌 7→8、真实出牌 8→7 + 弃牌堆+1（服务端 game_state 见证） |
| 窄视口渲染 | pass | 4 人局渲染、私有性、`scrollWidth <= clientWidth+1` |

## 渲染 / 操作 / 状态证据

- 渲染：`UNO 房规`、`回合进行中`、`.uno-house-player`（2/4 人）、`.uno-house-discard`、`.uno-house-hand .uno-card`（初始 7 张）、`.uno-house-center__meta` 全部真实可见。
- 私有性：他人玩家行只显示 `N 张`；手牌卡按钮只属于本人；观战/他人手牌卡从未进入 DOM。
- 操作：浏览器点击 `摸牌` → 服务端 game_state 显示该玩家手牌 7→8；浏览器点击可出牌（wild 经选色）→ 服务端显示手牌 8→7 且 `discardCount+1`（真实 `game_action` 被 house 模块权威受理）。
- 状态：回合倒计时来自 `clockInfo.turnDeadlineAt`；操作后 15s 回合计时器由服务端调度推进（host 侧 host 回合由 Node 策略驱动推进）。

## 文件范围（P4 白名单核对）

| 文件 | 动作 |
| --- | --- |
| `e2e/uno-house.spec.ts` | 新建（本门验收 spec） |
| `e2e/support/sessionSeeder.ts` | 新建（通用 seedActiveSession；blank 门复用；uno 门最终走真实 start_game，未依赖） |
| `docs/superpowers/reports/2026-08-05-d4-u-ui-results.md` | 本报告 |

白名单之外零改动；未修改 `e2e/helpers/**`、`playwright.config.ts`、`smoke.spec.ts`、`server/**`、`games/**`、`shared/**`、`registry/catalog/root package.json`。

## 未验证项

- `round_over` / `match_over` 结算页与罚牌（+2/+4）、UNO 竞速窗口等进阶分支未在浏览器覆盖（由 house 模块 48 项服务端测试保证规则正确；本门聚焦主操作与渲染）。
- 团队模式（team）未覆盖。
- 平台建房仍被准入拒绝（uno 非 playable）属既有权利状态，不作为本门缺陷。
