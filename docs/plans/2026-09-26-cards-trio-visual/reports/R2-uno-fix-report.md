# R2 修复报告：UNO 页面修复与手机版完善（2026-09-28）

> R1 被用户驳回后的迭代轮。同一截图位提供 before/after 同视口对照（before 存于 `../before-r2/`）。
> 视觉结论一律「待用户看图」；本报告只列机器门事实与事实性描述。

## 1. 范围与决策

- 任务卡：`../tasks/R2-uno-mobile.md`（含文件白名单）
- 用户拍板：
  1. 结算逐张翻开 → 新增下发字段 `lastRound`（含 `remainingHands`），`viewVersion` 1 → 2；
  2. 紧凑模式两指点按（先抽出看、再点出牌）保持现状；
  3. **执行中新发现并经用户确认**：服务端原本在非末局结算后立刻开下一局（`round_over` 从不持久化，小结屏在真实对局里从不出现，R1 的结算截图全是 mock fixture）。本轮改为：非末局结算后停在 `round_over` 小结屏，任意玩家点「下一局」（`begin`）才开新局。

## 2. 修复清单（对照 R2 计划）

| # | 项 | 实现 |
|---|---|---|
| P0-1 | 冲屏大字永久残留 | `party-table.css`：`.pt-slam-fx`/`.pt-ghost-big` 基态 `opacity:0` + 补 `pt-slam-in` 关键帧（scale 2.4→0.94→1.04→1，rotate −8°→−4°，900ms）；`PartySlam.tsx`：只在播放窗口内挂载（过期 text 不再常驻）；`UnoRoundResult.tsx`：`slamText` 初值 `''`，match_over 播「冠军诞生！」（phrase 档小字） |
| P0-2 | 结算按钮坞被聊天按钮压住 | `.pt-result-actions` 改为底部居中（`left:50%; transform:translateX(-50%)`），双视口一致。**与契约 §4.2「右下角」不符**——因右下角与固定聊天 FAB 碰撞，见 §6 Q1 |
| P1-3 | draw4 截图一直是错帧 | fixture 的 `pendingPenalty` 去掉多出的 `sourcePlayerId`（严格解析 5 键形状）；每帧新增断言：draw4 帧校验 `data-color="blue"` 且弃牌堆有 `[data-face="draw4"]`；结算帧校验 `.pt-slam-fx` 已卸载或 opacity 0 |
| P1-4 | 我的贴纸被裁切/压手牌 | 桌面端去掉继承自 `.pt-sticker` 的 `translate(-50%,-50%)`（左缘不再出屏），改 `rotate(-2deg)`；手机端 `bottom: 140px → 210px`（与手牌区顶缘留 ~11px 净距，e2e 实测断言守住） |
| P1-5 | 卡牌尺寸令牌化 | `.pt-table .card-fan-container` 定义 `--fan-card-w/--fan-card-h`：桌面 86/127、≤480px 60/89、矮横屏（landscape + max-height 520）44/64；移除 UnoHouseStage / BellClashGamePage 的显式 `cardWidth`。**副作用**：Ding 手牌高度 112→127（宽不变），见 §6 Q6 |
| P1-6 | 对比度 | 4× `var(--gp-text-muted, …)`（该令牌从未定义，实际 4.05:1）→ `var(--gp-muted)`（7.73:1）；`.pts.zero` `var(--pt-green)` → `var(--gp-green-dark)`（8.28:1）；UNO! 徽章底 `var(--pt-red)` → `var(--gp-coral-dark)`（奶油字 7.20:1） |
| P2-7 | 飞行卡牌不可见 | `deriveStageEvents` 的 `cardPlayed` 事件带上 `card: next.topDiscard`；飞行层渲染实体 `PartyCard`（出牌=牌面、摸牌=背面），新增 `.stage-flight__ghost .uno-flight-card` 样式（奶油底 + 3px 墨边 + 硬阴影）；飞行时长对齐契约 §5：440→520ms / 360→460ms |
| P2-8 | 按钮类名不存在 | `gp-button` → `gp-btn` / `gp-btn--primary`（共 6 处：操作坞 5 + 结算页 1） |
| P2-9 | 结算动效缺关键帧 | 新增 `@keyframes pt-flip-in`（rotateY 90°→0，逐张错峰 90ms）、`pt-pop`（胜者徽章）、结算行 `--row-i` 错峰入场（行入场改为挂载后加 `in` 类才真正过渡）；minimal/off 档全部关闭 |
| P2-10 | 死代码 | 删 `ringLayout.ts` + `unoRingLayout.test.ts`；删 `sweepColor`/`COLOR_SWEEP_MS`（换色由 PartyCloth 泼色接管）；uno.css 删 15 族死选择器（`.uno-house-stage*`、`.uno-house-banner*`、`.uno-house-player*`、`.uno-house-draw-pile*`、`.uno-direction-compass*`、`.uno-discard-halo*`、`.uno-house-scores*`、`.uno-shout-*`、`.uno-tabletop-arena`、`.uno-deck-pile-wrap`、`.uno-house-card-img`、`.uno-house-pile-badge`、`.uno-house-discard-color-badge`、`.uno-house-actions*`、`.uno-house-color-picker`，共 −411 行）；3 处孤儿媒体块包回 `@media (max-width: 480px)`；`ambientMotion.ts` / `tabletop-game-motion.css` 失效选择器同步 |
| 连线 | lastRound 全链路 | 服务端 types/schemas/rules（`round_over`/`match_over` 才下发，快照含 `remainingHands ?? 全员空数组` 兜底）、`module.ts viewVersion: 2`；客户端 `types.ts`（`HOUSE_PUBLIC_KEYS` + `parseHouseLastRound` 复用 parseCard）、`viewRegistry` 键 → `:2`；`UnoHouseStage` 把 `view.lastRound?.remainingHands` 传给结算页；胜者判定优先用 `finisherPlayerId`（替代 0 分启发式） |
| 流程 | round_over 驻留 | `settleRound` 非末局：停 `round_over`、清计时器字段；`begin` 动作在 `round_over` 时推进到下一局（新 108 张、上局出完者先手），其它阶段幂等 |

隐私不变量保持：`round_playing` 期间 `lastRound === null`（rules.test.ts 断言守住）。

## 3. 机器门（与视觉判定分栏）

| 门 | 结果 | 说明 |
|---|---|---|
| `npm run typecheck` | 0 | 修复了 1 处**既有**报错（echo-judge `readonly TabletopAction[]` 上 push，来自并行工作流，行为中性修复） |
| `npm run lint` | 0 | 同上：修了 1 处既有未用常量（landlord `TRICK_POP_MS`）、1 处既有 `no-undef`（capture 脚本）；wits-wagers 的 2 处由并行工作流自行修复 |
| `npm test`（清代理环境） | UNO 范围全绿 | house 40/40、客户端解析 4/4、ambientMotion 6/6；**既有失败 4 项全部在狼人杀工作流**（`driver：werewolf 稳定基线…` 800 步不收束 + measure-loc 基线锁定 × 3），本轮未触碰其文件 |
| `npm run compliance:d1` | PASS | |
| `npm run build` | 0 | dist 已同步（chunk 体积警告为既有） |
| e2e `uno-house.spec.ts` | 4/4 pass | 干净窗口单跑 |
| e2e `uno-legacy.spec.ts` | 2/2 pass | 干净窗口单跑（legacy 未受影响） |
| e2e `cards-trio-capture.spec.ts` UNO 截图组 | 1/1 pass | 12 张截图落盘（含新增 match-result ×2）；draw4/25 张/结算帧断言生效 |
| e2e `game-viewport-contract` / `motion-contract` / `bell-clash-tabletop` | **受干扰未复验** | 并行会话循环抢占 3178 端口，三次整套件运行均被污染（失败大面积波及狼人杀/榴莲/首页等无关页面，单跑即复过）。其中 viewport-contract UNO 块的新断言曾在受干扰运行中抓到 2 个真问题（贴纸底缘超手牌区顶缘 4.4px、比例测量被旋转包围盒带偏），均已修复（210px / offsetWidth 量布局盒），**修复后未复验**；用户决定（2026-09-28）：免跑，看图后再补 |

已知环境问题（非代码回归）：`llmConnectionTest` 在本机代理（127.0.0.1:7897）下 502，清代理后 20/20 通过。

## 4. 新增/收紧的 e2e 断言

- capture：draw4 帧校验颜色与弃牌面（防"解析被拒后截到旧帧"复发）；hand25 校验无横向溢出且 25 张全部落位；结算帧等冲屏卸载后采集静止画面并校验 slam 不残留
- viewport-contract UNO：贴纸左缘不被裁切（双视口）；手机端贴纸底缘 < 手牌区顶缘；手牌高宽比 ≈1.48±0.05（用 `offsetHeight/offsetWidth` 量布局盒，避免扇形旋转撑大包围盒）
- 新增 `uno-match-result`（match_over 总榜）截图位

## 5. 截图清单（before/after 同视口对照）

基线目录：`docs/superpowers/reports/2026-08-15-game-ui-refresh/baseline/`（after）
对照目录：`docs/plans/2026-09-26-cards-trio-visual/before-r2/`（before）

| 画面 | before（绝对路径） | after（绝对路径） |
|---|---|---|
| 对局 桌面 | D:\项目\docs\plans\2026-09-26-cards-trio-visual\before-r2\uno-play-1280x800.png | D:\项目\docs\superpowers\reports\2026-08-15-game-ui-refresh\baseline\uno-play-1280x800.png |
| 对局 手机 | before-r2\uno-play-390x844.png | baseline\uno-play-390x844.png |
| +4 罚牌 桌面 | before-r2\uno-play-draw4-1280x800.png | baseline\uno-play-draw4-1280x800.png |
| +4 罚牌 手机 | before-r2\uno-play-draw4-390x844.png | baseline\uno-play-draw4-390x844.png |
| 16 张手牌 桌面 | before-r2\uno-hand16-1280x800.png | baseline\uno-hand16-1280x800.png |
| 16 张手牌 手机 | before-r2\uno-hand16-390x844.png | baseline\uno-hand16-390x844.png |
| 25 张手牌 桌面 | before-r2\uno-hand25-1280x800.png | baseline\uno-hand25-1280x800.png |
| 25 张手牌 手机 | before-r2\uno-hand25-390x844.png | baseline\uno-hand25-390x844.png |
| 本局结算 桌面 | before-r2\uno-round-result-1280x800.png | baseline\uno-round-result-1280x800.png |
| 本局结算 手机 | before-r2\uno-round-result-390x844.png | baseline\uno-round-result-390x844.png |
| 整场结算 桌面 | （新增，无 before） | baseline\uno-match-result-1280x800.png |
| 整场结算 手机 | （新增，无 before） | baseline\uno-match-result-390x844.png |

**基线变更，等待用户确认。**

事实性描述（不做评价，2026-09-28 抽样读图）：
- 手机对局（uno-play-390x844）：红桌布 + 圆盘（牌堆「剩 42 张」+ 红 7 弃牌）+ 5 个对手贴纸（含两个红色 UNO! 徽章）；阶段牌「轮到你」；「当前：红」色签 + 倒计时环；我的贴纸「小鱼干 7」居中在手牌上方（不再压手牌区）；底部 7 张扇形手牌 +「摸牌 / UNO!」+ 聊天 FAB 无遮挡。**观察项**：圆盘左上方有一个游离的黑色「UNO!」气泡，与任何贴纸不贴合（疑似已喊玩家的气泡文本定位偏移）。
- 手机结算（uno-round-result-390x844）：左上「第 2/3 局 · 本局结束」；胜者徽章「可可 出完了！本局 0 分」（胜者取自 lastRound.finisherPlayerId）；计分板 6 行，剩牌列逐张显示真实牌面（2/2/1/4/0/5 张）；「下一局」底部居中，与右侧聊天 FAB 并排无遮挡；无「UNO!」冲屏残留。**观察项**：表头「名次」两字在 22px 列宽里折行。

## 5.1 用户第一轮看图后追加（2026-09-28）

用户原话：「挺好的，但是唯一的我觉得可以优化的点就是，横屏的，类似于桌面端的那种。他的那些玩家是正常围着桌子的，但是在竖屏的手机视角下。就没有那么贴合，或者说没有那么契合」

- 处理：`PartySeatRing` 手机竖屏参数收紧——纵向半径 ry 244→190、张角 spread 72°→80°（rx 150、centerY 40% 不变；桌面参数不动）。改动为共享组件，Ding 手机端同样生效。
- 重采集：cards-trio-capture 3/3 pass，UNO/Ding/斗地主全部截图刷新（斗地主内容不受影响，仅文件时间戳更新）。
- 事实描述（after `uno-play-390x844.png`）：5 个对手贴纸贴着圆盘上沿与两肋围合，顶部贴纸不再远离圆盘；Ding 手机端（`bell-clash-idle-390x844.png`）同样贴合。
- 视觉判定：**待用户看图**（before = `../before-r2/uno-play-390x844.png`）。

## 5.2 用户第二轮看图后追加（2026-09-28）

用户原话：「这个牌的剩余数量，不要用这个纯黑的，感觉不好看，而且不容易分辨它是个牌的剩余数量的感觉。换一个icon。或者单独绘制一个就行，然后这个倒计时放的这个位置也不太好，尤其是竖屏的情况下」

- **牌数图标**：`.pt-sticker__n::before` 由纯黑方块改为「奶油牌面 + 右上错位底牌」的层叠小牌（CSS 双阴影绘制，无新增图片资源）；手机端同比例缩小。共享组件，Ding 贴纸同步生效。
- **倒计时环**：从 `.pt-hud`（圆盘正下方）拆出，UNO 舞台内钉到桌面右上角（`.uno-turn-ring`：奶油圆底 + 3px 墨边 + 硬阴影；手机 12px/2.75rem，桌面 20px/3.25rem），竖屏不再挤压席位区，桌面不与任何元素碰撞。紧迫态（≤10s 变珊瑚红）沿用全局令牌。
- **附带揪出并修复**：active 态（`.pt-sticker--active`，优先级 0,2,0）会把我的贴纸的 `transform` 覆盖回 `translate(-50%,-50%)`，导致轮到我时贴纸左缘重新被裁切（桌面实测复现）。已为 active 态单独下压正确的变换（桌面 `scale(1.1) rotate(-2deg)`、手机 `translateX(-50%) scale(1.1) rotate(-2deg)`）。
- 验证：build(0)；cards-trio-capture 3/3 pass；桌面裁剪实测我的贴纸完整可见、倒计时居右上角。
- 视觉判定：**待用户看图**（`uno-play-390x844.png` / `uno-play-1280x800.png`）。

## 5.3 用户第三轮看图后追加（2026-09-28）

用户原话（附局部截图）：「这个UNO标是不是太多了」——剩 1 张牌的玩家同时挂红色 UNO! 角标（`.pt-sticker--one::after`）和黑色 UNO! 说话泡，语义重复。

- 处理：删 `UnoHouseStage` 里 `unoCalled → bubbleText 'UNO!'` 的分支，角标常显保留；说话泡只留给瞬时事件（「漏报！」警告 / 当前玩家「思考中...」）。
- 验证：build(0)；capture UNO 组 1/1 pass；`uno-play-390x844.png` 中游离黑泡已消失，每名玩家至多一个 UNO! 角标。
- 视觉判定：**待用户看图**。

## 5.4 用户第四轮看图后追加（2026-09-28）

用户原话：「行，还可以。但是有一个问题啊，就是顶部应该每个游戏都有的那个。蓝也就是标题和那个选项的那几个栏，这个游戏好像没有布置上，整上」

- 处理：UNO 对局舞台补上顶栏元素——左上标题签（沿用 `pt-round-tag`：UNO 房规模式 · 第 x/3 局 · 个人赛）+ 顶部操作区 `.uno-top-actions`（规则说明图标按钮，BookOpen 图标，48/44px 触控面积），排在右上角倒计时环左侧；点击打开 `GameDrawer` 规则抽屉（基本玩法 + 房规要点：+2/+4 叠加、+4 质疑、喊 UNO 与漏抓罚则）。全屏派对舞台不套 TabletopOvalShell（会推翻已定稿的全出血视觉），以派对桌语言实现同等功能。
- 说明：其它游戏的标准顶栏来自 `TabletopOvalShell`（标题 + kicker + 菜单按钮）；Ding 的 `pt-top-bar` JSX 存在但无对应样式，实际不可见——UNO 本次是首个真正生效的派对风顶栏，Ding 侧待用户需要时同法补上。
- 验证：typecheck(0)；build(0)；capture UNO 组 1/1 pass；双视口截图确认标题签、规则按钮、倒计时环三者无重叠。
- 视觉判定：**待用户看图**。

## 6. 待用户裁决（计划 §7 默认项 + 执行新发现）

| # | 问题 | 本轮默认 | 状态 |
|---|---|---|---|
| Q1 | 结算按钮坞位置 | 底部居中（契约写右下，但右下与固定聊天 FAB 碰撞） | 待用户看图 |
| Q2 | 无「看总榜」按钮 | match-result 帧直接展示总榜 | 待用户看图 |
| Q3 | match_over「返回大厅」实际发 `begin`（当前为幂等空转） | 保持，标签语义待裁决 | 待用户看图 |
| Q4 | `--pt-out` 曲线对齐方向稿 `cubic-bezier(.22,1,.36,1)` | 未改（party-table 已有同名令牌，值待核对） | 待用户看图 |
| Q5 | viewVersion 1→2 旧端 fail-closed 重同步 | 客户端与服务端同发版，已接受 | 已确认 |
| Q6 | Ding 手牌随令牌化变高（112→127，宽 86 不变） | 共享令牌的有意对齐 | 待用户看图 |
| Q7 | 旧 `.uno-house-discard` 规则（76–98px 宽 clamp + 深色阴影盒）仍作用于新舞台弃牌堆 | 按计划白名单保留 | 待用户看图 |

## 7. 视觉判定

全部画面：**待用户看图**。

## 8. 并行工作流干扰记录（事实陈述）

本轮执行期间检测到另一工作流正在同时修改 wits-wagers / werewolf / echo-judge / landlord 文件（`WitsTableStage.tsx` 在 lint 两次运行之间被外部修改）。为保证门禁可运行，本轮对 3 处白名单外的既有破坏做了行为中性的最小修复（echo-judge 类型标注、landlord 未用常量删除、capture 脚本 eslint 注释），均已在 §3 标注。e2e 曾因双方共用 3178 端口冲突重跑。
