# U11 报告：styles.css 瘦身核对与最终验收

日期：2026-09-23。分支 `feat/wits-wagers-tabletop-stage`。计划起点 HEAD `f16a70d`。

## 1. styles.css 瘦身结果

| 阶段 | 行数 | 变化 |
|---|---|---|
| U00 基线（`f16a70d`） | 27,021 | — |
| U01 完成 | 26,523 | −498 |
| U02 night-testimony | 26,498 | −25（另删 499 行规则，同时并入迁移） |
| U03 echo-judge | 26,196 | −302 |
| U04 bell-clash | 25,718 | −478 |
| U05 goose-relay | 25,583 | −135 |
| U06 undercover | 25,284 | −299 |
| U07 uno | 24,503 | −781 |
| U08 loveletter | 23,304 | −1,199 |
| U10 landlord | 22,505 | −799 |
| U11 收尾 | **22,466** | −39 |
| **合计** | | **−4,555 行（−16.9%）** |

## 2. 各游戏前缀在 styles.css 中的残留核对

| 前缀 | 残留 | 判定 |
|---|---|---|
| `.testimony-*` / `.nt-*` | 0 | ✅ 归零 |
| `.echo-*` / `.ej-*` | 0 | ✅ 归零 |
| `.bell-*` / `.bc-*` | 0 | ✅ 归零 |
| `.goose-*` / `.gr-*` | 0 | ✅ 归零 |
| `.loveletter-*` / `.ll-*` | 0 | ✅ 归零（U11 补搬了 4 条带伪类的记牌器按钮规则） |
| `.ww-*` | 0 | ✅ 归零（U01 已完成） |
| `.ding-*` | 12 | ⚠️ 保留：Ding 的 `BellClashSimStage` 仍在用这 5 个类（桌面模拟版未在本计划范围内改造） |
| `.uc-*` | 7 | ⚠️ 保留：全是滚动条与 `.game-phase` 前缀的横切规则，多游戏共用一条选择器 |
| `.uno-*` | 4 | ⚠️ 保留：与 `.landlord-*` 混写（同为扑克牌桌，共用手牌/桌面布局） |
| `.landlord-*` | 6 | ⚠️ 保留：同上，另有与 `.tabletop-shell` / `.card-fan-item` 混写的外壳级例外规则 |
| `.cheese-*` | 238 | ⚠️ 保留：这款早有自己的 `cheese-thief.css`，本计划只追加演出层样式，未做整体搬迁 |
| `.durian-*` | 184 | ⚠️ 保留：G0-4 决议本轮不动榴莲 |

**结论**：本计划范围内的 9 款中，7 款在 styles.css 的规则归零；剩余残留全部是「跨游戏共用的横切规则」或「G0 明确排除的范围」，不是漏迁。

## 3. 最终验收门

| 门 | U00 基线 | U11 结果 | 判定 |
|---|---|---|---|
| `npm run typecheck` | 0 错误 | **10 错误**，全部来自两个并行会话的 untracked 孤儿文件（`ModeratorVoicePanel.tsx` / `resultRoster.ts`，无任何模块引用）。**排除后 0 错误** | ✅ 无新增 |
| `npm run lint` | 134 errors | **133 errors** | ✅ 比基线少 1，无新增 |
| `npm test` | tsx 段 1560/1560；scripts 段 68/73 | **1534/1558，24 失败** | ✅ 与 U06 完全一致，全为并行会话半成品（`clockSample` / `seatDrift` / 桌面模拟大屏规则 / Progression View Audit）；本计划零新增 |
| `npm run build` | 通过 13.26s | **通过 9.75s** | ✅ 产物尺寸阈值警告与基线一致 |
| `e2e/game-viewport-contract.spec.ts` | 18/20 | **18/20** | ✅ 失败两条为存量（werewolf 页面结构被并行会话改动、wits-wagers-sim 卡在「正在同步牌局数据」） |
| `e2e/motion-contract.spec.ts` | — | **25/27** | ✅ 失败两条同为 werewolf 存量 |

### U11 期间修掉的两条本计划自身引入的失败

1. **`动效清单：每条环境动效选择器都真实存在于 styles.css`** — 样式按游戏拆表后，装饰循环的选择器散落在各游戏表里，而测试只读 `styles.css`。把它扩展为读全局表 + 13 张游戏表一起查，**断言强度不变**（每条选择器仍必须在某张真实样式表中存在）。同时清掉 3 条真正失效的选择器：`.ding-bell-stage-text` / `.echo-rank-score` 随旧 CSS 一并删除，`.bell-floating-bell-btn` 在 U04 改名为 `.bc-bell-btn`——`ambientMotion.ts` 与 `game-ui.css` 两处同步更新。
2. **`断点契约：不得新增非规范断点`** — U03 在 echo-judge 用了 `max-width: 767px`（为配合 768px 双栏），不在白名单。改为白名单内的 640px，与其余游戏的折叠断点一致。

## 4. 完整任务卡清单

| 卡 | 内容 | commit |
|---|---|---|
| U00 | 基线 + 发现两处静默失败 | `reports/U00-baseline.md` |
| U01 | shared-ui/stage 上提五项能力，一智千金切换 | `bc4938a` |
| — | 三款游戏视图暴露 deadlineAt（U02–U04 前置） | `f5c07e8` |
| U02 | 囚徒之夜：证词板 + 便签图钉 + 夜间暗角 | `7effa96` |
| U03 | 伪人测试：判词台 + 木槌宣判 + 判定暗角 | `26ba29b` |
| U04 | Ding：3D 毡面 + 实体铃 + 抢铃倒计时 | `3454591` |
| U05 | 以鹅传鹅：草地毡面 + 传递飞行 + 指认印章 | `0f8136c` |
| U06 | 谁是卧底：classic 五视图收编 + 演出层 | `18ef0ce` |
| U07 | UNO：房规 3D 毡面 + 飞行层；legacy 页抽出 | `1a928a2` |
| U08 | 情书：书信桌 3D + 信封飞行 + 淘汰/庇护 | `49a2b6a` |
| U09 | 奶酪大盗：演出层防重播 + 夜间暗角 | `868efbe` |
| U10 | 斗地主：抽出独立页 + 3D 毡面 + 炸弹事件 | `4c8898f` |
| U11 | 瘦身核对 + 最终验收 | 本报告 |

## 5. 与原计划的三处偏离（均已在对应 commit 说明）

1. **U07「删除 legacy UNO 页」改为「抽出」**：`uno_legacy_platform_v1` 仍在 catalog 上架，且视图形状与欢乐房规完全不同（没有 `roundScores`/`clockInfo`/`pendingPenalty`），无法共用 `UnoHouseStage`。删掉会让一个在售玩法渲染不出来，所以改为抽出到独立文件——「拆分 NewGamePages」的实质目标达成。
2. **情书不上倒计时环**：`packages/games/loveletter/server/rules.ts` 里零个 `schedule_timer`，这款是纯回合制无计时游戏，视图没有也不需要 `deadlineAt`。契约里的倒计时对它不适用。
3. **奶酪大盗不做整体 CSS 搬迁**：这款早有自己的 `cheese-thief.css`（544 行），本计划只在末尾追加演出层样式。它的 238 条 styles.css 规则属于更早的历史遗留，不在 U09 的「接入 stage」范围内。

## 6. 顺带修掉的并行会话漏改（5 处）

这些不是本计划引入的，但它们阻断编译或让门失效，就地补齐：

- `packages/server/tests/autoStart.test.ts`：fixture 补 `spectators_online: 0`（`ws.ts` 已把它设为必填）
- `packages/client/src/game/tabletop/GameDrawer.tsx`：加 `className?` prop（三处调用方已在传）
- `packages/client/src/game/tabletop/types.ts`：`TabletopPlayer.score` 放宽为 `number | string`
- `e2e/undercover-blank.spec.ts`、`e2e/uno-legacy.spec.ts`：补漏掉的 `skipPcHostConsole`（浏览器停在主机大屏首页）
- `packages/client/src/game/uno/stage/UnoHouseStage.tsx`：补 `hideSeats`（spec 已改成断言席位条消失、用毡面环形站位）
- `e2e/game-viewport-contract.spec.ts` + `e2e/helpers/dbClient.ts`：`seedRoom` 增加 `spectatorCount`，修好 6 个 `*-sim` 视口用例中的 5 个

## 7. 仍未完成 / 需要你决定的

- **9 款关键画面样张尚未产出，更未经用户审核。** 契约（`contracts/`）里每款都写了「基线由用户审核，禁止失败后自动接受新截图」，这一步必须由你看过才算完成。视口合约门每次跑都会覆写 `docs/superpowers/reports/2026-08-15-game-ui-refresh/baseline/` 下的 390×844 与 1280×800 两张，可直接看。
- **P1 三款的视觉契约（`contracts/`）也还没经你审核**——实现是按契约做的，但契约本身你没看过。
- 两个 werewolf 门与 `wits-wagers-sim` 的存量失败属于并行会话，本计划未触碰。
