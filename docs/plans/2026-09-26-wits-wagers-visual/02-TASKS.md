# 02 · 任务卡（X00–X08）

所有路径以 `D:/项目/` 为根。下文 `WW = packages/client/src/game/wits-wagers`。
每张卡：**白名单**以外的文件不许改；**完成判据**全部满足才可把状态改成 IMPLEMENTED。
X02–X06 都改 `WW/WitsWagersGamePage.tsx` 与 `WW/wits-wagers.css`，严格串行。新画面拆成子组件，别让页面文件继续膨胀。

**所有动效任务都必须遵守 `01-CONTRACT.md` §5.1 的 8 条硬约束。** 每张动效卡的完成判据里都有「跳动检测」一项，方法见 `03-ACCEPTANCE.md` §1.2。

---

## X00 · 基线（不改代码）

- **做**：
  1. `git status --short packages/client/src/game/wits-wagers` 记入 PROGRESS。
  2. 跑 `npm run typecheck`、`npx tsx --test packages/client/tests/witsWagers*.test.ts`，记退出码。
  3. 按 `03-ACCEPTANCE.md` §2 截**改造前**的 before 组（手机联机版 4 画面 × 2 视口；桌面模拟版 2 张），落到 `docs/superpowers/reports/2026-09-26-wits-wagers-visual/before/`。可复用 `e2e/wits-wagers-visual.spec.ts` 的 fixture 注入方式（`e2e/fixtures/wits-wagers.ts`）。
- **白名单**：只写 `docs/plans/2026-09-26-wits-wagers-visual/PROGRESS.md` 与 before 截图目录。
- **完成判据**：PROGRESS 里有 git 状态、两条命令退出码、before 截图绝对路径清单。

---

## X01 · 贵宾厅令牌 + 场景层

- **参照**：`A2-casino-lounge.html` 任意画面的背景（房间、吊灯、光锥、椭圆桌、桌面印字、烟雾）。
- **做**：
  1. `WW/wits-wagers.css`：在 `.ww-game[data-ww-theme="felt-green"]` 写入 `01-CONTRACT.md` §3 全部 `--ww-*` 令牌（替换原有 4 个值）。`walnut` / `midnight` 两段**先不动**（等 Q5）。
  2. 新建 `WW/stage/WitsLoungeScene.tsx`：纯展示，渲染 `room / cone / smoke / table / lamp` 五层，`aria-hidden`、`pointer-events: none`；prop `compact: boolean`（手机：桌面缩小、去掉桌面印字，照方向稿 mobile 规则）。烟雾的呼吸动画在 `reduced` 及以下档停掉。
  3. 新建 `WW/stage/wits-lounge.css`：从方向稿 `<style>` 里「场景」一段移植，字面量色全部换成 §3 令牌。只用断点契约允许的宽度 `380/480/640/768/1024/1280`、高度 `520/620`（方向稿用 `data-size` 切换，正式代码改成媒体查询：`max-width: 640px` 走手机布局）。
  4. `WW/WitsWagersGamePage.tsx`：在 `.ww-game` 最底层挂 `<WitsLoungeScene>`；外壳 `TabletopOvalShell` 继续用，但确认它自带的牌桌底色不会盖住场景（必要时只在 `.ww-game` 作用域覆盖外壳背景）。
- **白名单**：`WW/wits-wagers.css`、新建的 2 个文件、`WW/WitsWagersGamePage.tsx`。
- **完成判据**：typecheck 0；`npx tsx --test packages/client/tests/breakpointContract.test.ts packages/client/tests/classContracts.test.ts` 通过；`grep -n "#[0-9a-fA-F]\{3,8\}" WW/stage/wits-lounge.css` 只命中令牌定义处（组件样式里没有字面量色）。

---

## X02 · 扑克牌 + 筹码组件 + 「分」显示

- **参照**：`A2-casino-lounge.html` ② 排牌（牌面、牌角、作者点、「更低」牌）、① 作答（牌背）、③ 下注（筹码、+N 签、叠放）。
- **用户决定（2026-09-27）**：「改成筹码，显示分」——钞票整套退场，所有金额显示「N 分」。
- **做**：
  1. 新建 `WW/stage/WitsPokerCard.tsx`：props `target: BoardTargetView | null`（null = 背面）、`authorColors: string[]`、`size: 'table' | 'compact'`。实现契约 §4.3 牌面全部细节与 §4.2 牌背；「更低」格（`target.id === 'lower'`）走虚线透明样式。数字用 `targetLabel` / 现有格式化函数，**不自己拼**。
  2. 新建 `WW/stage/WitsChip.tsx`：props `color`、`label`（'A' / 'B' / 座位号）、`extraStake?: number`（>0 时挂「+N」签）、`size`（px）。实现契约 §4.4 筹码：厚度（三层下投影）、边缘白色镶片（`repeating-conic-gradient`）、中心象牙嵌片、衬线字。
  3. 新建 `WW/stage/WitsChipStack.tsx`：一格里的一摞筹码，后一枚压前一枚（`margin-left` 负值，桌面 -18px / 手机 -15px），不换行、不溢出格子、不压牌面。
  4. `WW/stage/WitsTableStage.tsx`：用 `WitsPokerCard` 替换 `WitsAnswerCard`，用 `WitsChipStack` 替换 `WitsNoteStack` 的桌面用法；槽位结构改为「赔率牌 + 扑克牌 + 底部筹码摞」（契约 §4.3）。背面牌堆改为扇形（契约 §4.2）。
  5. `WW/stage/WitsFlightLayer.tsx`：`kind: 'note'` 的飞行物渲染为 `WitsChip`，`kind: 'card'` 渲染为 `WitsPokerCard` 背面。`FlightSpec` 结构不变。
  6. 旧 `WitsAnswerCard` / `WitsNoteStack` / `WitsBanknote` / `WitsBankTray`：X07 之后若无引用再删；本卡不删。
  7. **「分」显示**（照下表逐项改，不多不少）：
     | 位置 | 现在 | 改成 |
     |---|---|---|
     | `WW/types.ts` | `formatMoney(points)` 返回 `¥N×100` | **新增** `formatPoints(points)`：返回 `N 分`，千分位用 `toLocaleString('zh-CN')`（`formatPoints(25)` → `25 分`，`formatPoints(1234)` → `1,234 分`）。`formatMoney` / `breakdownNotes` / `YUAN_PER_POINT` / `NOTE_DENOMINATIONS` **先保留不删**（X07 最后清理） |
     | `WW/seats.ts` | 余额与结算增减用 `formatMoney` | 换成 `formatPoints`；增减写成 `+5 分` / `-2 分` / `持平` |
     | `WW/BetEditor.tsx` | 「我的钱 / 已押出 / 还能押」+ `formatMoney`；加注显示 `(+¥400)` | 文案照 A2 托盘：「可用 N」「余额 M」；加注显示 `+4`（筹码上的小签，不带单位） |
     | `WW/stage/useWitsWagersStage.ts` | 飞行用 `breakdownNotes` 把金额拆成若干张钞票 | 一次下注 / 收付 = **一枚筹码**飞（带 `+N` 签），不再按面值拆张；`FlightSpec.notes` 字段保留类型兼容，传 `[]` 或删掉引用皆可，但 `kind` 仍用 `'note'`（避免动 `deriveStageEvents` 测试） |
     | `WW/drawers/WitsSettingsDrawer.tsx` | 动效档说明写「钞票飞行」 | 改成「筹码飞行」 |
     | `WW/ResultPanel.tsx` game_over 分支 | 金额若用 ¥ | 换成 `formatPoints`；**其余一概不动**（用户：总排名画面先保持现状） |
     | `packages/client/tests/witsWagersView.test.ts` | 断言 `formatMoney` / `breakdownNotes` | **保留原断言**（函数还在）；**新增** `formatPoints` 断言：`0 → '0 分'`、`25 → '25 分'`、`1234 → '1,234 分'`、`-3 → '-3 分'` |
     桌面模拟版（`WitsWagersSimStage.tsx`）的 ¥ 文案在 X07 改，本卡不碰。
- **白名单**：新建 3 个组件 + `WW/stage/wits-lounge.css`、`WW/stage/WitsTableStage.tsx`、`WW/stage/WitsFlightLayer.tsx`、`WW/wits-wagers.css`，以及第 7 条表里列出的 6 个文件。
- **完成判据**：typecheck 0；`npx tsx --test packages/client/tests/witsWagers*.test.ts` 通过（含新增 `formatPoints` 断言）；② ③ 画面 1280×800 与 390×844 下：6 个格子一排 / 3 列都放得下，任何一格的筹码摞不超出格子、不盖住牌面（方法见 `03-ACCEPTANCE.md` §1.2 第 2 条）；`grep -rn "¥\|钞票" packages/client/src/game/wits-wagers --include=*.tsx | grep -v WitsWagersSimStage | grep -v "stage/WitsBanknote\|stage/WitsNoteStack\|stage/WitsBankTray"` 无结果（注释除外）。

---

## X03 · 席位卡（左右围坐 / 手机 3×2）

- **参照**：`A2-casino-lounge.html` 各画面的席位卡。
- **做**：
  1. 新建 `WW/stage/WitsSeatCard.tsx`：props `seat: PlayerSeat` 扩展字段（见第 3 条）+ `phase` + `isMe`。实现契约 §4.1 全表（座位章用 `WitsChip`）。结算态的计数、徽章、名次、皇冠由 props 驱动，**组件本身不跑演出**（演出在 X06 编排）。
  2. 新建 `WW/stage/WitsSeatRail.tsx`：桌面左 3 右 3（7–8 人见 Q1，先按「左 ⌈n/2⌉ 右 ⌊n/2⌋」写，标 TODO 并在 PROGRESS 记一条），错落位置照方向稿（中间一张外凸 8px）；手机题目下 3×2 网格。
  3. `WW/seats.ts`：`buildSeats` 返回值**新增**只读字段（不改旧字段含义）：`seatNo`、`color`、`hasSubmitted`、`delta`、`authorBonus`、`rank`、`scoreBefore`、`scoreAfter`。全部从已有 `view` 字段派生。补单测到 `packages/client/tests/witsWagersView.test.ts`。
  4. `WW/WitsWagersGamePage.tsx`：`TabletopOvalShell` 传 `hideSeats`，席位改由 `WitsSeatRail` 渲染在 `.ww-game` 里。
- **白名单**：新建 2 个组件、`WW/seats.ts`、`WW/stage/wits-lounge.css`、`WW/WitsWagersGamePage.tsx`、`packages/client/tests/witsWagersView.test.ts`。
- **完成判据**：typecheck 0；`witsWagersView.test.ts` 通过；1280×800 与 390×844 下 6 人全部可见、无需滚动（C10）；长昵称被省略号截断，卡片高度与其他卡一致；`answering` 阶段席位卡 DOM 里没有任何估数。

---

## X04 · ① 作答 + ② 排牌 画面

- **参照**：`A2-casino-lounge.html` ① ②。
- **做**：
  1. 新建 `WW/stage/WitsQuestion.tsx`：kicker + 衬线题目 + 单位；`settlement` 变体缩成一行灰字。
  2. `WW/GuessPanel.tsx`：只换皮成契约 §4.2 的输入框（黄铜细边、衬线大数字、单位、提示语）；**提交逻辑、校验、`MIN_GUESS` / `MAX_GUESS` 不动**。主按钮「交出答案」。
  3. 排牌阶段底部文字改为「排牌中，马上开始下注…」（替换现有 `ww-phase-block__lead` 文案）。
  4. 演出（在 `WW/stage/useWitsWagersStage.ts` 现有事件上改外观，不改事件判定）：背面牌落桌、我交牌飞入牌堆 + FLIP 让位、排牌逐张翻入 + 赔率牌弹出。时长与四档照契约 §5.2。
- **白名单**：新建 `WitsQuestion.tsx`、`WW/GuessPanel.tsx`、`WW/stage/useWitsWagersStage.ts`、`WW/stage/WitsTableStage.tsx`、`WW/stage/wits-lounge.css`、`WW/WitsWagersGamePage.tsx`。
- **完成判据**：typecheck 0；`npx tsx --test packages/client/tests/witsWagersStageEvents.test.ts` 通过；`npx playwright test e2e/motion-contract.spec.ts` 通过；跳动检测 ① ② 两个画面 0 条；同一视口黄色主按钮 ≤1。

---

## X05 · ③ 下注画面

- **参照**：`A2-casino-lounge.html` ③。
- **前置**：X02 已完成（筹码组件与「分」显示）。
- **做**：
  1. `WW/BetEditor.tsx`：换皮成契约 §4.4 托盘（可用 / 余额、两枚筹码、目标面值 + 赔率、步进器）。**选筹码、点牌放置、加注上限、保存、二次确认的逻辑全部不动**（`betDraft.ts` 不许改）。
  2. 他人筹码摞按 `publicBets` 渲染；我的筹码只在托盘里，放置后飞到目标格（沿用现有 `place / move / pickUp / restake` 事件，换成 `WitsChip` 外观 + FLIP 让位）。
  3. 可点击的格子在 `interactive` 时悬停上浮 3px + 黄铜描边（用 `translate`，不用 `transform`）。
- **白名单**：`WW/BetEditor.tsx`、`WW/stage/WitsTableStage.tsx`、`WW/stage/useWitsWagersStage.ts`、`WW/stage/WitsChipStack.tsx`、`WW/stage/wits-lounge.css`、`WW/WitsWagersGamePage.tsx`。
- **完成判据**：typecheck 0；`npx tsx --test packages/client/tests/witsWagersBetDraft.test.ts packages/client/tests/witsWagersStageEvents.test.ts` 通过；`npx playwright test e2e/wits-wagers.spec.ts` 通过（选择器因 DOM 变化失效时**改选择器不改断言意图**，在 PROGRESS 列出）；跳动检测 ③ 0 条。

---

## X06 · ④ 揭晓结算画面

- **参照**：`A2-casino-lounge.html` ④（点「▶ 播放演出」看完整节奏）。
- **默认**：Q6（排名表去留）未答复前按 A2 做（无排名表）。**game_over 分支保持现状**（用户 2026-09-27：「总排名画面先保持现状」），本卡只做 settlement。
- **做**：
  1. 新建 `WW/stage/WitsAnswerPlaque.tsx`：黄铜牌匾 + 答案计数（`tabular-nums` + `min-width`）+ 来源小字。
  2. 胜出揭示：`winningTargetIds` 里的格子加 `win`（升起放大、绶带、扫光），其余加 `lose`（压暗）。等距双胜两个格子都高亮。
  3. 筹码回收：所有桌上筹码飞回主人的座位章（押中高抛、押错低掠），参数照契约 §5.2。
  4. 逐个计分：从最低分到最高分，驱动 `WitsSeatCard` 的计数、徽章、作者签；全部完成后显示名次章与第一名皇冠。沿用 `useWitsWagersStage` 的 `displayScores` 机制，不要另起一套分数状态。
  5. `WW/ResultPanel.tsx`：settlement 分支去掉现有账本列表（分数改在席位卡上显示），只保留「下一轮」主按钮与必要的推进逻辑；**game_over 分支原样保留**。
  6. 演出总时长必须收在 `deadlineAt` 内（现有 `fitToDeadline` 机制），超时就压缩间隔。
- **白名单**：新建 `WitsAnswerPlaque.tsx`、`WW/ResultPanel.tsx`、`WW/stage/useWitsWagersStage.ts`、`WW/stage/WitsTableStage.tsx`、`WW/stage/WitsSeatCard.tsx`、`WW/stage/wits-lounge.css`、`WW/WitsWagersGamePage.tsx`。
- **完成判据**：typecheck 0；`npx tsx --test packages/client/tests/witsWagers*.test.ts` 通过；`npx playwright test e2e/wits-wagers.spec.ts e2e/wits-wagers-recovery.spec.ts` 通过（结算演出中途刷新不重播、不卡住）；跳动检测 ④ 只允许两类记录：计数结束时数字的 `scale` 弹跳、第一名卡片的 `scale` 回弹；结算后 6 个席位卡的分数等于 `revealed.ledger[].scoreAfter`。

---

## X07 · 桌面模拟版接入

- **参照**：同 A2；桌面模拟版没有单独方向稿，**只换组件，不改三栏布局**（见 Q9）。
- **做**：
  1. `WW/WitsWagersSimStage.tsx`：中栏毡面挂 `WitsLoungeScene`；牌换 `WitsPokerCard`，筹码 / 钞票换 `WitsChip` / `WitsChipStack`（「自由道具、不校验不结算」的语义不变，只换外观）。
  2. 左右两栏（我的猜测、工具、日志）只换令牌与字体，不改结构和按钮。**文案按「分」改**：「我的猜测与钞票」→「我的猜测与筹码」；「我的钞票」→「我的筹码」；余额用 `formatPoints`；提示「1 分 = ¥100，输赢自己算自己记」→「输赢自己算自己记」；规则说明「钞票：± 按钮自己加减，1 分 = ¥100。」→「筹码：± 按钮自己加减。」
  3. X02 列出的旧组件若全仓无引用，删除之；`types.ts` 里的 `formatMoney` / `breakdownNotes` / `YUAN_PER_POINT` / `NOTE_DENOMINATIONS` 若全仓（含测试）只剩 `witsWagersView.test.ts` 引用，一并删除函数和对应旧断言；有其他引用就保留并在 PROGRESS 记原因。
- **白名单**：`WW/WitsWagersSimStage.tsx`、`WW/wits-wagers.css`、`WW/stage/wits-lounge.css`、`WW/types.ts`（仅删除上述 4 个导出）、`packages/client/tests/witsWagersView.test.ts`（仅删除对应旧断言）、X02 列出的旧组件（仅删除）。
- **完成判据**：typecheck 0；`npx tsx --test packages/client/tests/witsWagers*.test.ts` 通过；`npx playwright test e2e/game-viewport-contract.spec.ts` 中 `wits-wagers-sim` 用例通过；`grep -rn "¥\|钞票" packages/client/src/game/wits-wagers` 无结果（注释除外）；`grep -rn "WitsAnswerCard\|WitsNoteStack\|WitsBanknote\|formatMoney\|breakdownNotes" packages/client` 结果与 PROGRESS 记录一致。

---

## X08 · 截图组 + 报告 + 构建

- **做**：
  1. 按 `03-ACCEPTANCE.md` §1 全跑机器门，记命令与退出码。
  2. `npm run build`（e2e 跑的是构建产物，必须先构建）。
  3. 按 §2 截 after 组，落到 `docs/superpowers/reports/2026-09-26-wits-wagers-visual/after/`，与 before 同名同视口。
  4. 按 §3 模板写 `docs/plans/2026-09-26-wits-wagers-visual/REPORT.md`。
- **白名单**：截图目录、`REPORT.md`、`PROGRESS.md`、`packages/client/dist/**`（构建产物）。
- **完成判据**：机器门全绿（或无关存量失败已记名称）；after 截图数 = §2 清单数（截不到的写原因）；REPORT 的「用户结论」列全部为空。状态改为 IMPLEMENTED，**不许**写 USER_CONFIRMED。
