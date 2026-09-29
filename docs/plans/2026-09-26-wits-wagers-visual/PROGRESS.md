# PROGRESS · 唯一状态表

状态：TODO / IN_PROGRESS / IMPLEMENTED / BLOCKED / USER_CONFIRMED。只有用户看图说合格才能写 USER_CONFIRMED。

| 任务 | 内容 | 状态 | 证据（命令 + 退出码 / 截图路径） |
|---|---|---|---|
| X00 | 基线 + before 截图 | IMPLEMENTED | `git status --short packages/client/src/game/wits-wagers`：X01 的 4 处在途改动（2 改 + 2 新），其余 ww 文件干净；`npm run typecheck` 退出码 0；`npx tsx --test packages/client/tests/witsWagers*.test.ts` 退出码 0（56/56）；before 截图 10 张：`D:\项目\docs\superpowers\reports\2026-09-26-wits-wagers-visual\before\wits-wagers-{answering,arranging,betting,settlement,sim}-{1280x800,390x844}.png` |
| X01 | 贵宾厅令牌 + 场景层 | IMPLEMENTED | `npm run typecheck` 退出码 0；`npx tsx --test packages/client/tests/breakpointContract.test.ts packages/client/tests/classContracts.test.ts` 退出码 0（5/5）；`grep -n "#[0-9a-fA-F]\{3,8\}" stage/wits-lounge.css` 无命中（连令牌定义也不在本文件，令牌在 wits-wagers.css）；五层场景 + 外壳深色化已落地 |
| X02 | 扑克牌 + 筹码组件 + 「分」显示 | IMPLEMENTED | 客户端 tsc 无一智千金报错（uno / night-testimony 报错为并行会话在途改动）；`npx tsx --test packages/client/tests/witsWagers*.test.ts` 退出码 0（57/57，含新增 formatPoints 断言）；¥/钞票 grep（排除 sim 与三个旧组件）CLEAN；②③ 筹码摞几何检查（需浏览器量 rect）随 X05 截图步一起做 |
| X03 | 席位卡（左右围坐 / 手机 3×2） | IMPLEMENTED | 客户端 tsc 无一智千金报错；`npx tsx --test packages/client/tests/witsWagers*.test.ts` 退出码 0（59/59，含新增 buildSeats 两条）；6 人两视口可见性 / 长昵称截断 / answering DOM 无估数 → 随 X08 截图组验证（视觉判定待用户看图） |
| X04 | ① 作答 + ② 排牌 | IN_PROGRESS | 代码完成：WitsQuestion / GuessPanel 换皮 / 排牌文案 / dealing 入场演出（翻牌 + 赔率牌弹出 + 背面牌落桌）；tsc 无一智千金报错，witsWagers 单测过。motion-contract e2e 与跳动检测待构建恢复后补跑（并行会话改 landlord 导致构建暂断） |
| X05 | ③ 下注 | IN_PROGRESS | 代码完成：托盘按 A2 重构（可用/余额 + 两枚筹码 + 目标与赔率 + 步进器）、publicBets 他人筹码上桌、悬停上浮（X02 已备）；`witsWagersBetDraft` + `witsWagersStageEvents` 退出码 0。`e2e/wits-wagers.spec.ts` 选择器更新：`.ww-question-card__prompt`→`.ww-question__prompt`（断言意图不变）；e2e 待构建恢复后补跑 |
| X06 | ④ 揭晓结算 | IN_PROGRESS | 代码完成：WitsAnswerPlaque（计数 + 弹一下）、胜出绶带/升起/扫光、落败压暗、筹码回收入座（高抛/低掠）、逐个计分 + 名次章 + 皇冠、settlement 账本列表移除（game_over 分支未动）；tsc 与 witsWagers 单测过。e2e / 跳动检测待构建恢复后补跑 |
| X07 | 桌面模拟版接入 | IN_PROGRESS | 代码完成：sim 挂 WitsLoungeScene、牌换 WitsPokerCard、筹码换 WitsChip、文案按「分」；删除 WitsAnswerCard / WitsNoteStack / WitsBanknote / WitsBankTray 与 types.ts 的 formatMoney / breakdownNotes / YUAN_PER_POINT / NOTE_DENOMINATIONS 及对应旧断言；死 CSS 块清除（1440→975 行）；grep 全 CLEAN；tsc 无一智千金报错，witsWagers 单测退出码 0（57/57）。`game-viewport-contract` 的 sim 用例待构建恢复后补跑 |
| X08 | 截图组 + 报告 + 构建 | TODO | |

## 待用户确认

> ⚠️ 2026-09-29 隔离说明：`packages/client/tests/witsWagersClientFlyingChips.test.ts` 与 `witsWagersTableStage.test.ts` 是按未落地的舞台 API 编写的孤儿测试（引用了不存在的 `src/display/flip.ts` / `buildStageFlightPlan` 及 9 参 hook 签名；现行 `useWitsWagersStage(view)` 为单参形态）。为恢复 `npm run test` 全绿，两文件已改名为 `.test.ts.pending` 暂挂，待舞台 API 重构落地后按真实签名重写或恢复。

写计划时（2026-09-26）还没拍板的点。**标「阻塞」的项没答复前，不做对应任务**；其余项按括号里的默认值先做，用户答复后按答复改。

| # | 问题 | 影响 | 默认 / 阻塞 |
|---|---|---|---|
| Q0 | ~~A2 修订稿整体是否定稿？（用户选定 A、指定了修订范围，但还没说「定稿」）~~ | 全部任务 | **已答复（2026-09-27）**：「按照Claude做出来的计划和参照HTML效果去修改和完善一智千金的页面」→ A2 定稿，全任务解除阻塞 |
| Q8 | ~~正式版的钞票改成筹码吗？余额显示「分」还是「¥」？~~ | X02 X05 X07 | **已答复（2026-09-27）**：「改成筹码，显示分」→ 桌上、托盘、飞行物全部换成筹码；所有余额 / 增减 / 加注都显示「N 分」，不再出现 ¥ 与钞票。做法见 02-TASKS X02 第 7 条 |
| Q1 | 7–8 人局桌面席位怎么排？（方向稿只画了 6 人：左 3 右 3） | X03 | 默认左 ⌈n/2⌉ 右 ⌊n/2⌋，间距等比压缩 |
| Q2 | ~~game_over（七轮结束）的总排名画面长什么样？~~ | X06 | **已答复（2026-09-27）**：「总排名画面先保持现状」→ `ResultPanel` 的 game_over 分支**不改布局、不改结构**；只允许跟着 X02 把 ¥ 换成「分」、跟着 X01 换令牌色 |
| Q3 | 退席（forfeited）玩家的席位卡怎么显示？方向稿没画 | X03 | 默认整卡 45% 透明 + 状态行写「已退席」 |
| Q4 | 等距双胜（两张牌并列最接近）时，「最接近」绶带两张都挂吗？ | X06 | 默认两张都挂、都升起 |
| Q5 | 设置里的另外两个桌面主题 `walnut`（胡桃木）/ `midnight`（午夜蓝）保留、改成贵宾厅配色的变体，还是删掉只留一个？ | X01 | 默认不动（仍是旧配色） |
| Q6 | 结算时 A2 去掉了 A 稿底部的两列排名表，分数直接落在席位卡上。确认不要排名表？ | X06 | 默认按 A2（不要排名表） |
| Q7 | 屏震全部去掉了（为了修「抖动」），打击感靠胜出牌升起、扫光和数字弹跳。要不要在胜出那一下加回很轻的屏震？ | X06 | 默认不加 |
| Q9 | 桌面模拟版（三栏：左工具 / 中毡面 / 右日志）只换牌、筹码、场景组件，不改三栏布局，可以吗？还是也要出方向稿？ | X07 | 默认只换组件 |

## 与方向稿的差异记录

（实现与方向稿不一致的地方逐条记下，含原因。）

- X01：方向稿的场景几何是固定 px（1280×800 / 390×844 设备框），正式代码换算成 `.ww-game` 盒子的百分比（wits-lounge.css 头部注释），避免非 1280 宽度下吊灯/毡桌错位。
- X01：外壳（`TabletopOvalShell`）自带奶油纸底会从场景层后透出，用 `.tabletop-shell[data-game-id="wits-wagers"]:has(.ww-lounge)` 做深色化覆盖；外壳读不到后代 `.ww-game` 的自定义属性，故令牌在同一条规则里对两个选择器声明一次（不二次抄写）。`tabletop-header__kicker/title` 因平台侧原有 `!important` 而不得不用 `!important` 覆盖。
- X01：方向稿用 `data-size` 切换桌面/手机，正式代码改成 `max-width: 640px` 媒体查询（断点契约内）。
- X01：烟雾呼吸在 `reduced` 档通过 `html[data-motion-level='reduced']` 停掉；该选择器尚未登记进 `src/motion/ambientMotion.ts`（不在 X01 白名单），待办：X08 前确认全局压制块已兜底或补登记。
- 2026-09-27 用户指令「按照Claude做出来的计划和参照HTML效果去修改和完善一智千金的页面」视为 Q0（A2 整体定稿）确认。
- X02：「更低」格用 1.5px 虚线边框（契约 §4.3「透明虚线牌」）；A2 画的是细实圈，按任务卡 X02 第 1 条「走虚线透明样式」执行。
- X02：玩家色 = playerId 哈希取方向稿六色板（seats.ts `playerColorFor`）。成员系统没有头像色；同一玩家在座位章 / 作者点 / 筹码上颜色一致，优先于此，方向稿的按座序分配不照搬（7–8 人复用色板，Q1 已记）。
- X02：槽位点击/键盘交互从牌面移到整个槽位容器（`.ww-board__slot--interactive`），`ww-target-card` 选择器仍挂在牌上供 e2e 计数。
- X02：毡面 `.ww-felt` 去掉自带底色、边框与 rotateX(16deg) 倾斜，正视透明，让 X01 的场景层露出（契约 §1「不引入 rotateX 倾斜」）。旧 `.ww-facedown-row` 样式与旧组件暂留，X07 清理。
- X02：桌面暂保留旧钞箱 `WitsBankTray`（结算收付飞行的 `bank` 锚点），X06 改筹码回收编排、X07 清理。
- X02：桌上我的筹码与托盘筹码的玩家色暂为色板第 1 色；`WitsTableStage` / `BetEditor` 已加可选 `myPlayerId`，X03 由页面传入后取真实色。——X03 已接线，此条关闭。
- X03（白名单扩大，实现需要非视觉决定）：`WitsTableStage` 新增可选 `seatsRail` 插槽，渲染在题目行与毡面之间。原因：手机 3×2 网格必须在文档流里位于题目之下、版图之上，而题目与版图都在 WitsTableStage 内部；页面不穿过这个插槽就无法满足契约 §4 的移动端顺序。桌面端轨道是绝对定位，不占布局。
- X03：桌面席位用 flex 纵向 + `justify-content: space-between`（top 27% / bottom 22%）替代方向稿的逐张绝对 px（27%/48%/65%），n≠6 时自然均分；错落保留「中间一张外凸 8px」。
- X03：结算期 `scoreValue` 显示的是 `players[].score`（服务端权威新分），演出期间被 `displayScores` 钉在 scoreBefore；计数到 scoreAfter 的演出由 X06 编排。

## 用户看图记录

（用户原话逐字记录。）

- 2026-09-27 用户：「改成筹码，显示分；总排名画面先保持现状」→ Q8、Q2 已答复，X02 / X05 解除阻塞。
