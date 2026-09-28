# 伪人测试 · 视觉落地交接计划（B 老式法庭）

日期：2026-09-26　编写：强模型（定稿）　执行：便宜 / 快速模型　验收：用户看图

> 分工（DESIGN-DIRECTION §6.7）：本计划写到**执行模型不需要做任何新的视觉决定**的程度。遇到计划没写到的视觉问题，**停下来，把问题列给用户**，不要自己发挥（C14）。

---

## 0. 开工前必读（按顺序，只读这些）

1. `D:\项目\AGENTS.md` 中「视觉验收规范」一节（第 25–57 行）。
2. `D:\项目\docs\DESIGN-DIRECTION.md` 的 §2（已确认 / 否定过）与 §5（打击感）。
3. 本文件全文。
4. 像素参照稿（浏览器直接双击打开，顶部工具条可切 桌面 / 手机、6 / 9 人、审判长 / 旁听席视角）：

| 画面 | 参照稿 | 状态 |
|---|---|---|
| ① 立案（选题 + 选身份） | `docs/ui-preview/echo-judge/directions/S1-setup.html` | 待用户看图 |
| ② 轮流作答（主画面） | `docs/ui-preview/echo-judge/directions/B-courtroom.html` | **用户已确认（2026-09-26）** |
| ③ 审判（指认） | `docs/ui-preview/echo-judge/directions/S3-judgment.html` | 待用户看图 |
| ④ 宣判（每轮结算 + 终局） | `docs/ui-preview/echo-judge/directions/S4-verdict.html` | 待用户看图 |

公用：`_shared.css`（骨架）、`B-courtroom.css`（法庭表皮，**所有颜色、尺寸、圆角、阴影以它为准**）、`_kit.js` / `_shared.js`（演示用假数据和动画，**不要照搬进生产**，只看效果和时长）。

> ①③④ 若用户看图后提出修改，先改参照稿、用户再确认，再动生产代码。

---

## 1. 视觉契约（design-spec §11.2 六节）

### 1.1 设计方向

- 世界：**木质老法庭**。顶部是高高的木制审判席，审判长坐在上面，手边一把木槌；中央证人席上摊着一份卷宗（考题）；其余人坐在左右两排旁听长椅上；地板是木条。
- 表皮：**浅色粗墨边**（3px `#292722` 墨线 + 硬投影 `0 5px 0 #292722`）。
- 平面，无 3D。对标：榴莲的奶油纸感 + 狼人杀左右席位。
- 与现状的关系：现在是「侧栏 + 判词台」的通用双栏，要改成**法庭构图**（审判席在上、长椅左右、卷宗居中）。旧契约 `docs/plans/2026-09-22-game-ui-uplift/contracts/echo-judge.md` 的构图作废，但它的 §2 阶段机、§3.3 对比度、§7 动效门控仍有效。

### 1.2 状态模型（驱动画面的服务端字段）

来源：`packages/games/echo-judge/server/views.ts`、`rules.ts`。客户端类型在 `packages/client/src/game/echo-judge/types.ts`。

| 字段 | 画面 |
|---|---|
| `phase` = `judge_setup` / `answering` / `judgment` / `game_over` | 决定中央卷宗区显示 ①②③ 哪一种；`game_over` 显示 ④ 终局 |
| `judgeId` | 谁坐审判席（顶部深色卡），其余人按 `players` 顺序从审判长下家起分左右两排 |
| `round` / `players.length` | 左上告示牌下「第 N / M 轮」 |
| `me.pendingTopicChoices`（仅审判长、仅 judge_setup） | ① 三份卷宗 |
| `me.role` / `me.triggerWord` | 底栏黑色身份条（「你是伪人 · 暗号「雨伞」」），可点遮挡 |
| `question` | ②③ 卷宗正文 |
| `currentSpeakerId` / `answeredCount` / `allAnswered` | ② 发言人高亮、话筒位置、进度条 |
| `lastVerdict`（T0 新增） | ④ 中途宣判的唯一数据源 |
| `accusations` / `caughtImpostors` / `escapedImpostors` | 只在 `judgment` / `game_over` 下发；中途轮次**不要**用它们做宣判（见下方时序说明） |
| `scores` | 席位右侧衬线大数字；④ 分数滚动 |
| `deadlineAt` | 右上倒计时环；`judge_setup` 与 `game_over` 为 null → **环隐藏** |
| `reveal`（仅 `game_over`） | ④ 终局：全员身份 + 暗号 + 回答 |

**隐私红线（C18）**：
- 身份与暗号**终局前不公开**。中途宣判能公开到什么程度由用户定（§6 第 1 条）；无论哪种，**暗号只能在 `game_over` 用 `reveal.triggerWords` 显示**。
- ③ 审判长点选的临时名单只存在审判长本地 state，**旁听席看不到**（参照稿「你在旁听席」视角只显示"审判长正在斟酌"）。
- ① 其他人选了什么身份，任何人都看不到（包括审判长）。

**重要时序与一个现存缺陷（T0 处理，需用户先拍板）**：
- `accuse` 之后服务端**立刻**进下一轮 `judge_setup`（或 `game_over`），没有展示窗口。
- views.ts 只在 `judgment` / `game_over` 下发 `accusations/caughtImpostors/escapedImpostors`，而 `judge_setup` 下这三项是 null。于是**本轮的宣判结果在中途轮次根本到不了客户端**：下一帧就是 null。
- 反过来，下一轮进入 `judgment` 时，`caughtImpostors/escapedImpostors` 仍是**上一轮**的旧值（rules.ts 只重置了 `accusations`）。所以现在的「抓获的伪人：」其实显示的是上一轮的结果，晚了一整轮。
- 结论：④ 宣判要在中途轮次播，服务端必须新增一个「上轮判决」字段（见 T0）。现有 `stage/deriveStageEvents.ts` 的 `verdictDelivered` 触发条件（`accusations` null → 数组）在 `answering → judgment` 时就会误触发，T0 一并改为基于新字段。
- 规则原文 `RULES_ORIGINAL.md` 写「终局统一披露」，但公开的分数变化本来就能反推谁是伪人（被抓 −1、逃脱 +2）。**中途宣判是否点名公开身份，是用户的决定**，见 §6 待确认。

### 1.3 色值

只用令牌 + `B-courtroom.css` 里已有的值。**不新增色值**。映射：

| 参照稿变量 / 字面量 | 用途 | 生产写法 |
|---|---|---|
| `--ink #292722` | 墨线、正文 | `--game-ink` |
| `--muted #575147` | 次要文字 | `--game-muted` |
| `--card #fffdf7` | 席位卡、底栏 | `--game-surface` |
| `#fffaf0` | 卷宗纸 | `--game-paper` |
| `--wall #efe2c6` + 竖纹 `#eadbbd/#e3d2b1` | 法庭墙面 | 新增游戏局部变量 `--ej-wall*`，写在 `.ej-court` 上 |
| `--wood #c98a4f` / `--wood-d #9a5f2e` | 审判席、地板、木槌 | `--ej-wood` / `--ej-wood-d` |
| `#fde0c6` | 卷宗页签、发言人名字底、被指认席位底 | `--game-soft`（sunset 主题已有此值） |
| `--accent #c9562a` | 考题书名号、审判长状态字 | 用 `--game-dark #a83f19`（对比度合格，旧契约 §3.3） |
| `--coral #c23616` | 「指认」章、被抓章、扣分 | `--game-coral` |
| `#2f5d8a` | 「人类」章、逃脱章 | 局部变量 `--ej-human` |
| `#2f7a4f` | 加分数字 | 局部变量 `--ej-plus` |
| `#3b3a36` | 审判席上的审判长卡、身份条、逃脱伪人席位底 | 局部变量 `--ej-dark` |
| `--yellow #f7c84b` | **只用于**：唯一主按钮、当前发言人外框、话筒 token、「你」徽章 | `--game-yellow` |

C8：画面上不得出现第二块大面积黄色。

### 1.4 关键画面（每个都要在 1280×800 与 390×844 下还原）

公共骨架（四个画面都一样，参照 `B-courtroom.html`）：

- 背景：墙面竖纹 + 底部 190px 木地板（手机 250px）；墙正中淡淡的天平剪影（`.stage-art`，opacity .14，手机隐藏）。
- 左上：卡纸告示牌「伪人测试」（衬线 38px，奶油底 + 墨线 + 硬投影，旋转 −2°），下方小字「第 2 / 6 轮 · 阶段名」。
- 右上：倒计时环 72px（手机 58px），墨线描边；最后 10 秒变红并滴答放大。
- 顶部居中：木审判席（440×92，手机全宽 ×50），审判长深色卡骑在席顶，席面刻「审 判 席」，右侧木槌。
- 左右：旁听长椅，每侧一列席位卡（宽 232px）；手机改为上下两条，每条 4 格网格（上条在审判席下，下条在底栏上方）。
- 中央：证人席 = 卷宗区（左右各让出 290px）。
- 底部：底栏（奶油卡 + 墨线），左：黑色身份条；中：两行说明；右：主按钮。

席位卡：头像剪影（统一人形，按玩家色填充）+ 名字（800 15px）+ 状态小字 + 右侧衬线分数；左上角圆形座位号章；「你」黄色小徽章。手机：竖排、名字 12px、分数移到右上角 13px。

**① 立案（judge_setup）**，参照 `S1-setup.html`
- 审判长视角：卷宗区上方小字「挑一份卷宗立案 · 翻开后全员开始轮流口述」；下方三份卷宗并排（手机竖排三行），每份带页签「卷宗 · 甲/乙/丙」（页签色依次 `--game-soft` / `#dfe9d6` / `#e6ddf2`——**这两个新色需用户确认，确认前三张都用 `--game-soft`**），内容：分类小字 + 18px 衬线题目 + 右下「立这一案 →」。三张分别旋转 −2° / 0 / 2°，悬停上浮 6px。
  - 点击：另两张淡出下沉 → 选中那张在原地展开成大卷宗 → 盖红色「立 案」章（2.2 倍缩到 1 倍） → 木槌敲一下 + 轻屏震。然后服务端进 `answering`。
  - 底栏：说明「你是本轮审判长 / 挑一份卷宗，或自己出题…」+ 次按钮「自己出题」（现有 `start_round` 动作）。**本阶段没有黄色按钮**（点卷宗即提交）。
- 旁听席视角：卷宗区上方虚线框「封」章 +「审判长 老王 正在挑卷宗…… 开庭前你可以随时改身份」；下方两张大身份卡「当人类」「当伪人」二选一（选中 = 黄色外框；伪人卡选中后变深色底、头像变红，并弹出黄色暗号卡「暗号「雨伞」」，翻面动画 360ms）。底栏身份条随选择实时变。
- 环隐藏。

**② 轮流作答（answering）**，参照 `B-courtroom.html`（已定稿，逐像素照做）
- 卷宗：页签「卷宗 · 第 N 案」，小字「审判长 X 的考题」，30px 衬线题目（书名号用 `--game-dark`），「证人席：<名字>」，右下淡红「口 述」章。
- 卷宗下方：大数字「1/5」+ 已作答 + 分段进度条（每段一人，已说 = 该玩家色，当前 = 黄色脉动）。
- 当前发言人席位：黄色 4px 外框 + 上浮放大 + 状态「发言中 🎙」。已说完的席位 62% 透明度。
- 交棒演出：黄色话筒 token（44px 圆）从旧发言人席位抛物线飞到新发言人（560ms，峰值放大 1.5 倍并旋转 −20°），落地时新席位弹一下，**同时木槌敲一下**。
- 主按钮：只在「轮到你」时出现黄色「我说完了」。审判长的「推进到下一位」是次按钮（墨线描边，非黄）。

**③ 审判（judgment）**，参照 `S3-judgment.html`
- 全屏四角压暗（径向渐变，中心透明，边缘 `rgba(41,39,34,.28)`）。
- 卷宗：「全员已口述」+ 22px 题目；审判长视角下方「已指认 N 人」（N 为 34px 红色衬线）+ 被点名字小标签；提示「点旁听席上的人来指认，再点一次取消。抓对一个伪人 +1，冤枉一个人类 −1。」
- 审判长点旁听席的席位卡 = 切换指认：被指认的卡变 `--game-soft` 底、微倾、右上角贴红色「指认」小章（弹入 280ms）。**取消现有的 `SeatTargetPicker` 列表**，改为直接点席位。
- 底栏（审判长）：次按钮「没人是伪人」（= `accuse` 空数组）+ 黄色主按钮「宣判 · 指认 N 人」（0 人时禁用）。
- 旁听席视角：卷宗里显示深色条「审判长 老王 正在斟酌……谁被点了你看不到」（三个黄点跳动）；木槌持续举起放下（1.6s 循环）；底栏无按钮，身份条仍在。
- 进度条全满。环 30 秒。

**④ 宣判（每轮结算；终局同一演出后停留）**，参照 `S4-verdict.html`（三种情形都要能播：抓对 + 冤枉、全抓到、没指认）
时间线（总长 ≤ 2.4s，可「跳过」直接到最终态）：
1. 0ms：木槌敲下 + 屏震（260ms）。
2. 380ms 起：被指认者按顺序每 260ms 翻面一张——伪人：卡底 `--game-soft` + 红「伪 人」章；人类：蓝「人 类」章。
3. 接着：没被指认的伪人每 200ms 翻一张——深色底 + 黄字「漏网伪人」+ 蓝「逃 脱」章。
4. 中央弹出结果告示牌（40px 衬线，盖章动画）：「伪人全部落网！」/「抓到 N 个伪人」/「伪人全员潜伏成功」/「明察秋毫」（0 伪人且未指认），下方一行小字说明。
5. 分数：各席位分数滚到新值，右下角挂 `+2` / `−1` 小牌；告示牌下方出现账单卡（每行：名字 · 原因 · 加减分）。
- 中途轮次：演出结束立即进入下一轮 ① 立案（底栏提示「下一轮由 X 当审判长」）。
- 终局（`game_over`）：同一演出后停留，席位全部翻面（用 `reveal.roles`），伪人席位此时才显示暗号；告示牌换成「审判结案 · <胜者> 胜」，下方接现有 `TabletopVictoryBurst` 与结算面板。**暗号只在这里出现。**

### 1.5 动效与音效（四档门控）

| 演出 | default | reduced | minimal | off |
|---|---|---|---|---|
| 话筒交棒飞行 | 560ms 抛物线 | 直接瞬移 + 落点弹一下 | 瞬移 | 瞬移 |
| 木槌敲击（立案 / 交棒 / 宣判） | 360ms | 保留（信息） | 保留 | 静止，仅音效 |
| 屏震 | 260ms | 关 | 关 | 关 |
| 卷宗展开 / 盖章 / 席位翻面 | 同参照稿 | 保留盖章，去翻转 | 直接显示终态 | 直接显示终态 |
| 分数滚动 | `RollingNumber` | 直接跳值 | 直接跳值 | 直接跳值 |
| 审判阶段木槌举放循环 | 1.6s 循环 | 关 | 关 | 关 |

门控走现有 `html[data-motion-level]`；飞行走共享 `FlightLayer`。新增 keyframes 上限 6 个（木槌敲击、盖章、翻面、弹入、举槌循环、脉动），都 ≤ 0.5s（循环类除外，motion-contract 已有豁免写法，照抄 cheese-thief）。音效沿用 `stage/audioCues.ts`，不新增。

### 1.6 验收矩阵

截图目录：`docs/superpowers/reports/2026-08-15-game-ui-refresh/echo-judge-court/`
文件名 `echo-judge-<画面>-<宽x高>.png`，fixture：6 人（阿杰 / 老王（审判长）/ 可可 / 小鱼干 / Momo / 糯米）第 2 轮，另补 9 人各一张。

| 画面 | 视口 | 视角 | 对照物 |
|---|---|---|---|
| setup-judge | 1280×800 / 390×844 | 审判长 | S1-setup.html?v=judge |
| setup-player | 1280×800 / 390×844 | 旁听席（选了伪人） | S1-setup.html?v=player |
| answering | 1280×800 / 390×844 / 9 人 1280×800 | 轮到你 | B-courtroom.html |
| judgment-judge | 1280×800 / 390×844 | 审判长（已点 2 人） | S3-judgment.html?v=judge |
| judgment-player | 390×844 | 旁听席 | S3-judgment.html?v=player |
| verdict | 1280×800 / 390×844 | 演出结束静止帧（抓对 1 + 冤枉 1） | S4-verdict.html?case=mixed |
| game-over | 1280×800 / 390×844 | 终局 | S4-verdict.html 终态 + 现有结算面板 |

---

## 2. 文件白名单（只许改这些）

| 文件 | 改什么 |
|---|---|
| `packages/client/src/game/echo-judge/EchoJudgeGamePage.tsx` | 构图重排；改 `hideSeats` 自绘席位；指认改点席位；宣判演出挂载 |
| `packages/client/src/game/echo-judge/echo-judge.css` | 全部新样式（前缀 `.ej-`） |
| `packages/client/src/game/echo-judge/stage/JudgeBench.tsx` | 改为审判席 + 木槌组件（保留 `striking` 接口） |
| `packages/client/src/game/echo-judge/stage/useEchoJudgeStage.tsx` | 宣判时间线扩展（翻面序列、跳过） |
| `packages/client/src/game/echo-judge/stage/deriveStageEvents.ts` | T0：`verdictDelivered` 改由 `lastVerdict` 触发 |
| `packages/client/src/game/echo-judge/types.ts` | T0：解析 `lastVerdict` |
| `packages/games/echo-judge/server/{types,rules,views}.ts` + `tests/views.test.ts` | **仅 T0**，见 T0 |
| 新建 `packages/client/src/game/echo-judge/stage/CourtSeats.tsx` | 左右长椅 + 席位卡 |
| 新建 `packages/client/src/game/echo-judge/stage/CourtProps.tsx` | 卷宗、盖章、告示牌、身份条等小道具 |
| 新建 `packages/client/tests/echoJudgeStage.test.ts` | 纯函数单测（座位分边、宣判序列、隐私） |
| `docs/plans/2026-09-26-echo-judge-visual/PROGRESS.md` | 进度与证据 |

**不许动**：T0 之外的服务端改动（规则、计分、计时）；`tabletop/`、`shared-ui/` 公共组件；`styles.css`；其他游戏；`EchoJudgeSimStage.tsx`（桌面模拟另起计划）。确需改白名单外文件，先停下写明原因问用户。

---

## 3. 逐步任务

每步：先写 / 更新测试 → 实现 → 跑验证 → 在 PROGRESS.md 记一行（做了什么、命令、退出码）。**一次只做一步。**

### T0 服务端「上轮判决」字段（§6 第 1 条用户拍板后才做；T1–T4 可先做）
- 做（按用户选定的方案 A；若选 B，把 `caught/wrong/escaped` 换成三个人数）：
  - `packages/games/echo-judge/server/types.ts` 的 state、`rules.ts` 的 `settleRound` 与 `views.ts` 的公开视图加 `lastVerdict: { round, judgeId, accusations, caught, wrong, escaped, scoreDelta: Record<id, number> } | null`；`settleRound` 写入，之后一直保留到下一次 `settleRound` 覆盖；老存档兜底 null。
  - schema（`views.ts` 的 zod）、客户端 `types.ts` 解析器同步加字段。
  - `deriveStageEvents.ts`：`verdictDelivered` 改为 `lastVerdict.round` 变化时触发，数据取自 `lastVerdict`；删掉旧的「accusations null → 数组」判断。
  - 进入 `judgment` 时把 `caughtImpostors/escapedImpostors/wrongAccusations` 重置为 `[]`（修掉"晚一轮"）。
- 判据：新增 `packages/games/echo-judge/tests/views.test.ts` 用例——中途轮次 `accuse` 后，下一帧（`judge_setup`）的 PlayerView 与 SpectatorView 都带本轮 `lastVerdict`，且**不含** `triggerWords` / `roles`；`judgment` 阶段 `caughtImpostors` 为空数组；`scoreDelta` 与 `settleRound` 计分一致。客户端单测：`answering → judgment` 不再产生 `verdictDelivered`。
- 这是白名单外的服务端改动，**只在本任务内允许**，文件限于：`packages/games/echo-judge/server/{types,rules,views}.ts`、`packages/games/echo-judge/tests/views.test.ts`，以及白名单内的客户端 `types.ts` / `deriveStageEvents.ts`。

### T1 法庭骨架（不改交互）
- 做：`TabletopShell` 传 `hideSeats`，在 `centerArena` 里自绘 `.ej-court`：墙、地板、天平剪影、告示牌、倒计时环位置、审判席（`JudgeBench` 改造）、左右长椅（`CourtSeats`）、中央卷宗区、底栏仍用 `ActionDock`（只改皮）。席位分边规则：从审判长下家开始的发言顺序，前 ⌈n/2⌉ 在左，其余在右（参照 `_shared.js` 的 `oleft/oright`）。
- 判据：四个阶段都能进，画面结构与 `B-courtroom.html` 一致；1280×800 与 390×844 下无元素重叠、无溢出（写一个 Playwright 几何检查或手动 DOM 检查，结果贴进 PROGRESS）。单测：座位分边函数 6 人 / 9 人 / 审判长在首位 / 在末位。

### T2 ② 轮流作答
- 做：卷宗、进度条、发言人高亮、话筒交棒飞行 + 木槌、底栏按钮逻辑（黄色只给「我说完了」）。
- 判据：与 `B-courtroom.html` 同视口对照；交棒飞行在 `off` 档不飞。

### T3 ① 立案
- 做：审判长三卷宗 + 选中展开盖章；旁听席身份二选一大卡 + 暗号卡；「自己出题」次按钮沿用现有输入逻辑。移除旧侧栏 `ej-role-choice` 与 `IdentityFlipCard` 侧栏（身份信息收进底栏身份条）。
- 判据：与 `S1-setup.html` 两个视角对照；审判长视角看不到任何人的身份。

### T4 ③ 审判
- 做：暗角、点席位指认（本地 state）、「指认」章、底栏两按钮、旁听席等待条 + 举槌循环；删除 `SeatTargetPicker` 用法。
- 判据：与 `S3-judgment.html` 对照；单测：旁听席视角渲染数据里不含审判长的临时选择。

### T5 ④ 宣判 + 终局
- 做：`verdictDelivered` 触发时间线（§1.4 ④ 五步），跳过按钮，账单卡；终局停留 + 暗号只从 `reveal.triggerWords` 取；接 `TabletopVictoryBurst`。
- 判据：三种情形（mixed / all / none）+ 「0 伪人且未指认」都能正确出文案与分数；单测：宣判序列函数输入 `accusations/caught/escaped` 输出翻面顺序与分差，与服务端 `settleRound` 计分一致；非终局时任何输出都不含暗号。

### T6 验收
- 跑 §4 全部命令；按 §1.6 出截图组；写报告（design-spec §11.4 模板，机器门与视觉判定分两张表，视觉结论列留空）。

---

## 4. 验证命令（每步结束都跑前三条）

```bash
npm run typecheck
```
```bash
npm test
```
```bash
npm run build
```
```bash
npx playwright test e2e/echo-judge-tabletop.spec.ts
```
```bash
npx playwright test e2e/visual-audit.spec.ts --grep echo
```

注意：E2E 跑的是 `packages/client/dist`，**改完必须先 `npm run build`**，否则测的是旧 UI。端口 3178 起不来时先查是否有孤儿服务，不要乱杀进程。

---

## 5. 不许做

- 不许自评「视觉通过 / 已对齐 / 精致」；视觉结论只能是「待用户看图」。
- 不许新增色值（§1.3 之外）；不许出现第二块大面积黄色（C8）。
- 不许细边 / 无阴影（浅色必须 3px 墨线 + 硬投影，C2）；大数字必须衬线（C7）。
- 不许把画面做回「居中一张 `.gp-panel` + 四周空白」。
- 不许在终局前显示任何人的暗号；不许让旁听席看到审判长的临时指认；不许让任何人看到别人在 ① 选的身份。
- 不许改服务端规则、计时、视图字段；不许为了演出让服务端等待。
- 不许用 `git stash`、`git add -A`、`--update-snapshots`；只提交白名单内自己改的文件。同目录可能有并行会话，开工前 `git status` 看一眼。
- 参照稿里的演示按钮（「下一位发言（演示）」「模拟审判长选题」「跳到最后 10 秒」）不是产品功能，不要做。
- 页签两个新色（`#dfe9d6` / `#e6ddf2`）在用户确认前不用。

---

## 6. 待用户确认（确认后把答案写回这里，执行模型才动相关任务）

1. **中途宣判公开到什么程度**（影响 T0、T5）：
   - A（参照稿现状）：点名公开——被指认者翻面显示「伪人 / 人类」，漏网伪人也翻出来；暗号仍然终局才公开。
   - B：只公开人数——「抓到 1 个、冤枉 1 个、漏网 1 个」+ 分数变化，不点名翻牌（但分数变化仍能让细心的人反推）。
2. ① 三份卷宗的页签色：三张都用 `#fde0c6`，还是用参照稿里的 米橙 / 浅绿 / 浅紫 三色。
3. ①③④ 三张参照稿的整体认可（②已确认）。

## 7. 交给执行模型的提示词

```text
你接手 D:/项目 的「伪人测试」视觉落地。先只读：
1. D:/项目/docs/plans/2026-09-26-echo-judge-visual/README.md（本计划，全文）
2. 其中 §0 列出的 AGENTS.md 与 DESIGN-DIRECTION.md 指定章节
3. 当前任务对应的参照稿 HTML
然后只做 PROGRESS.md 里下一个未完成的任务（T1→T6 顺序）。先测试、再实现、再跑 §4 命令，把命令和退出码写进 PROGRESS.md。
只改 §2 白名单内的文件。遇到计划没写的视觉选择，停下列问题，不要自己决定。
不得自评视觉通过；每轮回复 ≤ 250 字：做了什么、验证结果、下一步。
```
