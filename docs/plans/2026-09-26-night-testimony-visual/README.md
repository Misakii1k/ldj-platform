# 谁是狱警（囚徒之夜）· 视觉落地交接计划（C 牛皮纸档案室）

日期：2026-09-26　编写：强模型（定稿）　执行：便宜 / 快速模型　验收：用户看图

> 分工（DESIGN-DIRECTION §6.7）：本计划写到**执行模型不需要做任何新的视觉决定**的程度。遇到计划没写到的视觉问题，**停下来，把问题列给用户**，不要自己发挥（C14）。
> 代码里游戏 id 是 `night-testimony`，显示名在本计划的画面里统一写「谁是狱警？」（与参照稿一致）。

---

## 0. 开工前必读（按顺序，只读这些）

1. `D:\项目\AGENTS.md` 中「视觉验收规范」一节（第 25–57 行）。
2. `D:\项目\docs\DESIGN-DIRECTION.md` 的 §2（已确认 / 否定过）与 §5（打击感）。
3. 本文件全文。
4. 像素参照稿（浏览器直接双击打开，顶部工具条可切 桌面 / 手机、5 / 6 人、视角 / 结局）：

| 画面 | 参照稿 | 状态 |
|---|---|---|
| ① 出题（抽审讯单） | `docs/ui-preview/night-testimony/directions/S1-pick.html` | 待用户看图 |
| ② 问答盖章（主画面） | `docs/ui-preview/night-testimony/directions/C-kraft-archive.html` | **用户已确认（2026-09-26）** |
| ③ 投票（贴封条） | `docs/ui-preview/night-testimony/directions/S2-vote.html` | 待用户看图 |
| ④ 开票（拆档案袋） | `docs/ui-preview/night-testimony/directions/S3-reveal.html` | 待用户看图 |
| ⑤ 狱警猜罪 + 终局 | `docs/ui-preview/night-testimony/directions/S4-guess.html` | 待用户看图 |

公用：`_shared.css`（骨架）、`C-kraft-archive.css`（档案室表皮，**所有颜色、尺寸、圆角、阴影以它为准**）、`_kit.js` / `_shared.js`（演示用假数据和动画，**不要照搬进生产**，只看效果和时长）。
备选方向 `A-midnight-cells.html`、`B-interrogation-board.html` 是用户保留的备选，**不要删、不要实现**。

> ①③④⑤ 若用户看图后提出修改，先改参照稿、用户再确认，再动生产代码。

---

## 1. 视觉契约（design-spec §11.2 六节）

### 1.1 设计方向

- 世界：**监狱档案室的办公桌（俯视）**。深绿桌面 + 台灯光圈；中央夹板上是打字机打出的审讯单；右上角一叠已归档的旧审讯单；每位玩家是一只**牛皮纸档案袋**，沿桌面底部排开（带页签、囚号、YES 章余量）。
- 核心动作都是「办公用品」：回答 = 盖章，投票 = 贴封条，开票 = 拆档案袋，猜罪 = 贴罪行标签。
- 表皮：**浅色粗墨边**（3px 墨线 + 硬投影），桌面是唯一的深色大面积（绿，不是黑）。
- 平面，无 3D。对标：Balatro 的"道具即界面"、奶酪大盗的卡纸感。
- 旧契约 `docs/plans/2026-09-22-game-ui-uplift/contracts/night-testimony.md` 的构图作废；阶段机与动效门控仍参考。

### 1.2 状态模型（驱动画面的服务端字段）

来源：`packages/games/night-testimony/server/views.ts`、`rules.ts`。客户端类型 `packages/client/src/game/night-testimony/types.ts`。

| 字段 | 画面 |
|---|---|
| `phase` = `question` / `vote` / `game_over`（`deduction` 在枚举里但当前规则不进入） | 决定显示哪一画面 |
| `currentQuestion === null` 且 `phase=question` | ① 出题；`me.pendingCardChoices` 只下发给出题人 |
| `currentQuestionerId` | 出题人档案袋变淡紫色（`asker`） |
| `currentQuestion.text / answers` | ② 审讯单正文与盖章格 |
| `questionIndex` / `questionLimit` / `maxYesPerPlayer` | 「第 3 / 5 份审讯单」；「满 3 个 YES 章立刻投票」 |
| `playerYesCounts` | 档案袋底部 3 格 YES 余量 |
| `history` | 右上旧审讯单一叠（每张：Q 号、题目、答 YES 的人的小章）；③ 结案汇总表 |
| `revealedIdentities` | 自告者档案袋变灰、写「已自告 · <罪行>」，不能被投 |
| `votedPlayerIds` / `me.hasVoted` | ③ 档案袋上「已投」 |
| `accusedId` / `wardenRevealed` | ④ 被抽出的档案袋 / 证件种类 |
| `guessingInProgress` / `availableGuessCrimes` / `extraCrime` | ⑤ 猜罪标签池（= 所有囚犯罪行 + 1 张干扰） |
| `me.isWarden` / `me.crime` | 底栏牛皮纸罪行条（狱警显示「你是狱警」） |
| `deadlineAt` | 右上倒计时环；null 时隐藏 |
| `reveal`（仅终局） | ⑤ 终局核对（真罪行、狱警猜测） |

**隐私红线（C18）**：
- **② 作答期间，别人的 YES / NO 不能显示**，只能显示「已盖章」（参照稿里格子写「已盖章」、背面朝上），全员盖完才同时翻开。
  - ⚠ 现状：服务端 `currentQuestion.answers` 实时下发每个人的答案，现有客户端 `nt-progress__mark` 也直接显示 YES/NO。画面按"同时翻开"做，**客户端在全员答完前一律不渲染答案**。服务端是否跟着收紧（答完前只下发"谁已答"），由用户决定，见 §6。
- ③ 投票只公开「谁已投」，**投给谁、票数都不公开**（服务端也不下发票数）。④ 开票画面**不出现任何票数**。
- ⑤ 猜罪期间囚犯的真实罪行**不能出现在画面上**，只有提交后逐袋核对时才露出。
  - ⚠ 现存缺陷：抓到狱警后服务端已进 `game_over` + `guessingInProgress=true`，此时 `reveal.crimes` 已经下发（views.ts 只判断 `phase==='game_over'`）。已另开修复任务「Fix night-testimony crimes leaking before guessing」；**T5 依赖它先合入**。
- 平票：服务端取最先达到最高票的人，画面不单独表现平票。

### 1.3 色值

只用令牌 + `C-kraft-archive.css` 已有值，不新增。映射：

| 参照稿值 | 用途 | 生产写法 |
|---|---|---|
| `#292722` / `#575147` | 墨线、正文 / 次要字 | `--game-ink` / `--game-muted` |
| `#fffdf7` | 底栏、告示牌 | `--game-surface` |
| `#fffaf0` + 淡紫横格线 `rgba(121,96,165,.18)` | 审讯单、旧单、标签纸 | `--game-paper` + 局部 `--nt-rule` |
| `#5f7f6b → #557462` + 竖纹 | 桌面 | 局部 `--nt-desk-a/-b` |
| 台灯光 `rgba(255,247,215,.35)` | 光圈 | 局部 `--nt-lamp` |
| `#d9b27c → #cfa46b`，深 `#b98a4f`，字 `#5b4527` | 档案袋、罪行条 | 局部 `--nt-kraft` / `--nt-kraft-d` / `--nt-kraft-ink` |
| `#cfc3e4 → #b9a9d6`，字 `#4e3777` | 出题人档案袋 | 局部 `--nt-asker` / `--nt-asker-ink` |
| `#7960a5` | Q 编号 | `--game-accent`（本游戏 accent） |
| `#c23616` | YES 章、封条、✘、YES 余量已用格 | `--game-coral` |
| `#2f5d8a` | NO 章 | 局部 `--nt-no` |
| `#2f7a4f` | ✔、「已投」、囚犯胜 | 局部 `--nt-ok` |
| `#2e3440 / #4b5263` | 狱警工作证、翻开后的狱警档案袋 | 局部 `--nt-warden` |
| `#e9e4d8 → #d8d1c1` | 已自告档案袋 | 局部 `--nt-exposed` |
| `#f7c84b` | **只用于**：「你」的档案袋外框、唯一主按钮（⑤ 提交猜罪、④ 进入猜罪）、选中标签外框 | `--game-yellow` |

注意 ② 的主按钮是「盖 NO」（奶油底蓝字）+「盖 YES」（珊瑚红底白字），**不是黄色**，照参照稿。③ 主按钮「贴封条」也是珊瑚红。

### 1.4 关键画面

公共骨架（参照 `C-kraft-archive.html`）：
- 桌面背景 + 台灯光圈（中心偏左上 46% 40%）。
- 左上：告示牌「谁是狱警？」（衬线 36px，奶油卡纸 + 墨线 + 硬投影，旋转 −3°），下方浅色小字「第 3 / 5 份审讯单」。
- 右上：倒计时环 72px（手机 56px）。
- 底部：档案袋一排（桌面每只 172px，6 人 158px，居中；手机 3 列两行）。档案袋：左上页签、左上角圆形座位号、右上 Courier 囚号 `#007`、证件照（人形剪影，玩家色，贴在白底小卡上并歪 −3°）、名字、状态、底部 3 格 YES 余量。「你」= 黄色 4px 外框。
- 最底：底栏（奶油卡）：左 = 牛皮纸罪行条（「你的罪行 · 偷吃外卖」，可点遮挡），中 = 两行说明，右 = 按钮。

**① 出题**，参照 `S1-pick.html`
- 出题人：审讯单位置换成三张空白审讯单并排（手机竖排），分别旋转 −3° / 1° / 3.5°，每张：牛皮纸分类小签（如「现场痕迹」）+ 19px 衬线题目 + Courier 单号 `No.003-A`。悬停上浮 8px。点击：另两张下落淡出，选中那张弹一下 + 屏震，进入 ②。
- 其他人：同位置一张虚线框空单，一支笔在写（循环），大字「老王 正在挑审讯单……」。
- 出题人档案袋淡紫 + 状态「出题人 · 挑单中 ✎」。旧审讯单一叠照常显示。环 90 秒（超时服务端代选第一张）。

**② 问答盖章**，参照 `C-kraft-archive.html`（已定稿，逐像素照做）
- 夹板审讯单（620px，旋转 −1°，顶部金属夹）：Courier 行「审讯单 No.003 · 提问人：老王」、30px 衬线问题、每人一个盖章格（90×64，虚线；已答 = 实线 +「已盖章」；翻开 = YES 红框 −6° / NO 蓝框 4°，带 2.2→1 盖章动画）、底部「2/5 已盖章 · 全员盖完同时揭开」+ 右侧「满 3 个 YES 章立刻投票」。
- 自己作答：盖章格从自己档案袋飞到审讯单（520ms 抛物线）。
- 全员答完：所有格子同时翻开 + 屏震 → 答 YES 的人，一枚红章从格子飞到他档案袋的 YES 余量格（依次间隔 90ms）+ 档案袋上浮并盖「YES」章 → 900ms 后这张审讯单缩进右上旧单一叠（旧单从上方落入）。
- 底栏：「盖 NO」「盖 YES」两个按钮；答完后禁用。另有次按钮「自告罪行」（现有 `self_expose`，墨线描边小按钮，放在罪行条右侧）。

**③ 投票**，参照 `S2-vote.html`
- 审讯单位置换成「结案汇总」表：每行一问，每列一人，YES 红字 / NO 蓝字半透明。旧单一叠隐藏。
- 点档案袋 = 选中目标（上浮倾斜）；不能投的（自己、已自告）写「不能投」、鼠标禁用。
- 点「给 X 贴封条」：一条红封条从自己档案袋飞到目标，落下后横贴在目标袋上（「嫌 疑」白字，−8°），屏震。**只有自己的屏幕上看得到这条封条**；其他人只看到你的档案袋状态多了「· 已投」。
- 底栏：次按钮「自告罪行」（手机只写「自告罪行」）+ 珊瑚红主按钮「贴封条」。环 90 秒。

**④ 开票**，参照 `S3-reveal.html`（两种结局都要：抓到狱警 / 抓错人）
1. 桌面中央上方：每位玩家一张选票（只写投票人名字，顶部色条 = 玩家色，**没有投向、没有票数**），按座次每 240ms 落下一张。
2. 被抽出者的档案袋从底部飞到桌面中央并放大（360×230），袋子页签写「X 的档案」，袋上横贴红封条；原位置的档案袋变 30% 透明。
3. 封条被撕飞（向右上甩出），里面的证件向上滑出 90px：
   - 囚犯档案（奶油底）：「囚犯档案 · 可可 · 深夜扰民 · 不是狱警」→ 然后**真狱警的档案袋自己翻开**（深色底、黄字「狱警」、上浮）→ 告示牌「狱警 老王 独胜」。
   - 狱警工作证（深色底，黄字「狱警 · 老王」）→ 告示牌红字「抓到狱警了！但他还有一次翻盘……」→ 黄色主按钮「进入猜罪 →」（仅演示用；生产由服务端直接进 ⑤，按钮换成 2 秒后自动进入）。
- 投票超时无人投票 = 狱警直接胜：跳过 1–3，直接翻开狱警档案袋 + 告示牌。

**⑤ 猜罪 + 终局**，参照 `S4-guess.html`（两个视角 × 两种结果）
- 狱警视角：中央告示牌「给每只档案袋贴上罪行」+ 浅色说明「全贴对你就翻盘独胜；有一张是多出来的干扰项」+ 一排罪行标签（`availableGuessCrimes`，奶油纸 + 墨线，交替倾斜）。每只囚犯档案袋底部多一个虚线标签位「贴罪行」。操作：点标签 → 点档案袋（或先点档案袋再点标签），标签从标签池飞到档案袋贴上（440ms）；贴过的标签在池里变灰；点已贴的袋子可以换。已自告的囚犯标签**预贴且锁定**（灰底实线）。狱警自己的档案袋深色、无标签位。黄色主按钮「提交猜罪（3/4）」，未贴满禁用。
- 囚犯视角：中央虚线框「狱警 老王 正在给大家的档案袋贴罪行……只要他贴错一张，囚犯就赢」；档案袋标签位写「待贴」。无按钮。
- 提交后（两个视角相同）：每 360ms 核对一只袋子 + 屏震：对 = 绿圈 ✔；错 = 红圈 ✘ + 下方小红字「实为 深夜扰民」。最后告示牌：「囚犯联盟胜！狱警贴错了 1 张」（绿）/「狱警 老王 翻盘独胜！」（深色）。然后接现有 `TabletopVictoryBurst` 与结算面板。
- 本阶段不计时（环隐藏）。

### 1.5 动效与音效（四档门控）

| 演出 | default | reduced | minimal | off |
|---|---|---|---|---|
| 盖章格飞行 / 红章飞行 / 封条飞行 / 标签飞行 | 440–560ms 抛物线 | 瞬移 + 落点弹一下 | 瞬移 | 瞬移 |
| 盖章（2.2→1） | 380ms | 保留 | 直接终态 | 直接终态 |
| 全员同时翻开 + 屏震 | 翻开 + 240ms 屏震 | 翻开，无屏震 | 直接终态 | 直接终态 |
| 审讯单归档（落入旧单一叠） | 420ms | 淡入 | 直接终态 | 直接终态 |
| 开票：选票落下 / 抽档案袋 / 撕封条 / 证件滑出 | 同参照稿（总长约 3s） | 保留顺序，去位移 | 直接终态 | 直接终态 |
| 猜罪核对逐袋 | 每袋 360ms | 保留节奏 | 一次全显 | 一次全显 |
| 出题人的笔（循环） | 1.2s 循环 | 关 | 关 | 关 |

门控走 `html[data-motion-level]`，飞行走共享 `FlightLayer`，音效沿用 `stage/audioCues.ts`，不新增。新增 keyframes 上限 6 个（盖章、弹贴、抽出、翻面、落入、笔），单次 ≤ 0.5s（循环类照 cheese-thief 的豁免写法）。

### 1.6 验收矩阵

截图目录：`docs/superpowers/reports/2026-08-15-game-ui-refresh/night-testimony-archive/`
文件名 `night-testimony-<画面>-<宽x高>.png`。fixture：5 人（阿杰 / 小鱼干（你）/ 可可 / 老王（狱警）/ Momo），第 3 问，历史 Q1、Q2 同参照稿；另补 6 人各一张。

| 画面 | 视口 | 视角 | 对照物 |
|---|---|---|---|
| pick-asker / pick-other | 1280×800 / 390×844 | 出题人 / 其他人 | S1-pick.html?v=asker / other |
| answering | 1280×800 / 390×844 / 6 人两档 | 轮到你 | C-kraft-archive.html |
| answering-flipped | 1280×800 / 390×844 | 全员答完翻开静止帧 | 同上，点「盖 NO」后 |
| vote | 1280×800 / 390×844 | 已贴封条 | S2-vote.html |
| reveal-caught / reveal-wrong | 1280×800 / 390×844 | 静止帧 | S3-reveal.html?case=caught / wrong |
| guess-warden / guess-inmate | 1280×800 / 390×844 | 贴到一半 | S4-guess.html?v=warden / inmate |
| game-over | 1280×800 / 390×844 | 核对完成（猜错一张） | S4-guess.html 终态 |

---

## 2. 文件白名单（只许改这些）

| 文件 | 改什么 |
|---|---|
| `packages/client/src/game/night-testimony/NightTestimonyGamePage.tsx` | 构图重排；`hideSeats` 自绘档案袋；各阶段内容；按钮 |
| `packages/client/src/game/night-testimony/night-testimony.css` | 全部新样式（前缀 `.nt-`） |
| `packages/client/src/game/night-testimony/stage/TestimonyBoard.tsx` | 改为「夹板审讯单」组件 |
| `packages/client/src/game/night-testimony/stage/TestimonyNote.tsx` | 改为「旧审讯单」小卡 |
| `packages/client/src/game/night-testimony/stage/useNightTestimonyStage.tsx` | 演出时间线（翻开、归档、开票、核对） |
| `packages/client/src/game/night-testimony/stage/deriveStageEvents.ts` | 如需补事件（如「全员答完」），不改现有事件语义 |
| 新建 `packages/client/src/game/night-testimony/stage/ArchiveFiles.tsx` | 档案袋席位一排 |
| 新建 `packages/client/src/game/night-testimony/stage/ArchiveProps.tsx` | 盖章格、封条、选票、证件、罪行标签、告示牌 |
| 新建 `packages/client/tests/nightTestimonyStage.test.ts` | 纯函数单测 |
| `docs/plans/2026-09-26-night-testimony-visual/PROGRESS.md` | 进度与证据 |

**不许动**：服务端 `packages/games/night-testimony/**`（隐私修复走另一个任务）；`tabletop/`、`shared-ui/`；`styles.css`；其他游戏；`NightTestimonySimStage.tsx`；备选方向稿 A / B。

---

## 3. 逐步任务

每步：先写 / 更新测试 → 实现 → 跑验证 → 在 PROGRESS.md 记一行（做了什么、命令、退出码）。**一次只做一步。**

### T1 档案室骨架
- 做：`TabletopShell` 传 `hideSeats`，`centerArena` 自绘 `.nt-desk`：桌面、台灯光、告示牌、倒计时环、底部档案袋一排（`ArchiveFiles`）、右上旧单一叠、中央内容区；底栏 `ActionDock` 换皮 + 牛皮纸罪行条。
- 判据：五个画面都能进；1280×800 与 390×844、5 / 6 人下无重叠无溢出（DOM 几何检查结果贴进 PROGRESS）。单测：档案袋状态函数（出题人 / 你 / 已自告 / 已投 / YES 余量）。

### T2 ② 问答盖章
- 做：夹板审讯单、盖章格、飞行、**全员答完前不渲染任何人的答案**、同时翻开、红章飞向 YES 余量、归档进旧单一叠；底栏两按钮 + 自告次按钮。
- 判据：与 `C-kraft-archive.html` 同视口对照；单测：`answers` 未满时渲染数据里没有 yes/no（只有"已答"布尔）。

### T3 ① 出题
- 做：三张审讯单三选一 + 选中动画；其他人的"正在挑"等待画面。
- 判据：与 `S1-pick.html` 两视角对照；非出题人视图里不出现候选题目。

### T4 ③ 投票
- 做：结案汇总表（由 `history` 生成）、点档案袋选目标、封条飞行 + 只在自己屏幕贴封条、「已投」标记、不能投的状态。
- 判据：与 `S2-vote.html` 对照；单测：自己、已自告不可选；他人屏幕不显示任何人的投向。

### T5 ④ 开票 + ⑤ 猜罪 + 终局（**依赖隐私修复任务先合入**）
- 做：选票落下 → 抽档案袋 → 撕封条 → 证件；抓错 / 抓到两分支 + 无人投票分支；猜罪标签池、贴标签飞行、已自告锁定、提交后逐袋核对、终局告示牌 + `TabletopVictoryBurst`。
- 判据：与 `S3-reveal.html` / `S4-guess.html` 对照；单测：猜罪期间（`guessingInProgress`）渲染数据里没有任何囚犯真罪行；核对结果与 `reveal.wardenGuesses` / `reveal.crimes` 一致。

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
npx playwright test e2e/night-testimony-tabletop.spec.ts
```
```bash
npx playwright test e2e/visual-audit.spec.ts --grep night
```

E2E 用 `packages/client/dist`，改完先 build。端口 3178 起不来先查孤儿服务。

---

## 5. 不许做

- 不许自评「视觉通过 / 已对齐 / 精致」；视觉结论只能是「待用户看图」。
- 不许新增色值（§1.3 之外）；黄色只用于 §1.3 列出的地方（C8）。
- 浅色元素必须 3px 墨线 + 硬投影（C2）；大数字衬线（C7）。
- 不许在全员答完前显示任何人的 YES / NO；不许显示票数或投向；不许在核对前显示囚犯真罪行。
- 不许改服务端规则、计时、视图字段（隐私修复走另一个任务）。
- 不许删或实现备选方向稿 A / B。
- 参照稿里的演示按钮（「模拟出题完成」「一键演示提交」「演示：猜错一张」「跳到最后 10 秒」）不是产品功能。
- 不许 `git stash`、`git add -A`、`--update-snapshots`；只提交白名单内自己改的文件；开工前 `git status` 看有没有并行会话的改动。

---

## 6. 待用户确认（确认后把答案写回这里）

1. **作答时别人的答案要不要在服务端也藏起来**：画面上已经按"全员盖完同时揭开"做；但现在服务端实时下发每个人的 YES/NO，懂行的人从网络数据里能提前看到。要不要另开任务让服务端答完前只下发"谁已答"？（不影响本计划执行。）
2. ①③④⑤ 四张参照稿的整体认可（②已确认）。
3. ④ 抓到狱警后：参照稿是按钮「进入猜罪 →」，生产计划改成 2 秒后自动进入——是否同意。

---

## 7. 交给执行模型的提示词

```text
你接手 D:/项目 的「谁是狱警（night-testimony）」视觉落地。先只读：
1. D:/项目/docs/plans/2026-09-26-night-testimony-visual/README.md（本计划，全文）
2. 其中 §0 列出的 AGENTS.md 与 DESIGN-DIRECTION.md 指定章节
3. 当前任务对应的参照稿 HTML
然后只做 PROGRESS.md 里下一个未完成的任务（T1→T6 顺序；T5 等隐私修复合入后再做）。先测试、再实现、再跑 §4 命令，把命令和退出码写进 PROGRESS.md。
只改 §2 白名单内的文件。遇到计划没写的视觉选择，停下列问题，不要自己决定。
不得自评视觉通过；每轮回复 ≤ 250 字：做了什么、验证结果、下一步。
```
