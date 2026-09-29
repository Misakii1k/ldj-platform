# 一智千金 · 深夜赌场贵宾厅视觉改造 · 交接计划

更新：2026-09-26。**本目录是执行规范，不代表已实现。** 设计已由用户选定方向，执行模型只照做，不做任何新的视觉决定。

> 状态说明：用户选定 A 方向、要求出 A2 修订稿，A2 已交付但**尚未说「定稿」**。按用户要求「在我绝大多数确定的差不多的情况下就这么做吧」先写本计划。还没拍板的小点列在 `PROGRESS.md`「待用户确认」，**执行模型开工前先看那一节**。2026-09-27 用户已答复两个关键问题：**钞票改成筹码、金额显示「分」**；**七轮结束的总排名画面保持现状**。目前没有阻塞任务的问题，其余各项按默认值做。

## 你从哪里开始

1. 读本文件 → `PROGRESS.md`（先看「待用户确认」，再找第一个 TODO 任务）→ 该任务在 `02-TASKS.md` 里的一节。
2. 每个视觉任务**先在浏览器里打开定稿方向稿**，它就是像素参照：
   - 直接双击 `D:/项目/docs/ui-preview/wits-wagers/directions/A2-casino-lounge.html`
   - 或起静态服务 `npx vite docs/ui-preview --port 5194 --strictPort`，访问 `http://localhost:5194/wits-wagers/directions/A2-casino-lounge.html`
   - 顶部工具条切 ①–④ 四个画面、桌面 / 手机两种尺寸，「▶ 播放演出」重播。**工具条只是演示，不进正式代码。**
3. 长什么样、用哪些字段、动效四档写在 `01-CONTRACT.md`；命令和截图组写在 `03-ACCEPTANCE.md`。
4. 开工提示词在 `04-START-PROMPT.md`。

## 定稿方向稿（像素参照）

| 文件 | 作用 | 用户确认 |
|---|---|---|
| `A2-casino-lounge.html` | **唯一像素参照**：作答 / 排牌 / 下注 / 揭晓结算四个画面 × 1280×800 / 390×844 | 待用户看图（A 方向已选定；A2 修订范围由用户指定） |
| `A-casino-lounge.html` | A2 的 before，只用来对照，**不照抄** | 2026-09-26「我喜欢A和c」「先用A」 |
| `C-auction-house.html` | 用户要求**保留、不制作**，日后可能更换或融合。**本计划不实现它的任何元素** | 2026-09-26「C的方案先给我留着，不制作」 |
| `B-game-show.html` | 不采用 | — |
| `_shared.js` / `_shared.css` | 方向稿共用：假数据、规则计算、演出工具。演出节奏与动效写法可参考，**代码不直接搬进产品** | — |

用户在 A 里明确要保留的：**真筹码、象牙扑克牌、左右围坐的席位、吊灯 + 绿毡氛围**。

## 范围

- **做**：
  - 手机联机版：`packages/client/src/game/wits-wagers/WitsWagersGamePage.tsx` 及其子组件（`stage/*`、`GuessPanel`、`BetEditor`、`ResultPanel`、`seats.ts`、`wits-wagers.css`）。
  - 桌面模拟版：`WitsWagersSimStage.tsx` 换用同一套牌、筹码、场景组件（X07）。
- **不改**：服务端规则与视图（`packages/games/wits-wagers/server/**`）、协议字段、`types.ts` 里已有类型和函数的语义、赔率与账本算法、`betDraft.ts` 的规则、`useWitsWagersController.ts` 的收发逻辑、抽屉的功能（规则 / 历史 / 设置可以换皮，不改功能）。
- **不做**：C 稿的竖向价签阶梯、拍品卡、画架、木槌；B 稿任何元素；平台大厅。

## 固定的工作方式

- 一次只领一个任务，按 `PROGRESS.md` 顺序。X02–X06 都会改 `WitsWagersGamePage.tsx` 与 `wits-wagers.css`，**禁止并行**。
- 只改任务卡白名单里的文件；需要扩大范围就停下，在 `PROGRESS.md` 写原因，交回用户。
- 方向稿没画、本计划也没写的画面细节（比如 7 人局、8 个槽位、game_over 总排名、观战者），**停下列问题交回用户**，不自行设计（`docs/DESIGN-DIRECTION.md` C14）。已知缺口已经列在 `PROGRESS.md`「待用户确认」。
- 顺序：先改 → 跑机器门 → 出截图组。机器门全绿 ≠ 视觉通过；视觉只由用户看图判定（`AGENTS.md` 视觉验收规范）。报告里的视觉项只能写 `待用户看图` / `用户已确认（日期）` / `用户驳回（原话）`。
- 看不到截图（读图超时）就写「我没有看到画面」，不许凭 DOM 推断好不好看。
- 开工前 `git status` 确认没有其他会话在改同一批文件（项目记忆：并行会话会 reset 掉你的改动；禁止用 `git stash` 做基线对比）。

## 完成的定义

`PROGRESS.md` 状态只能取 TODO / IN_PROGRESS / IMPLEMENTED / BLOCKED / USER_CONFIRMED。
机器门全绿且截图组已产出 → IMPLEMENTED；只有用户看图说合格 → USER_CONFIRMED。

## 文件

- `01-CONTRACT.md`：视觉契约（`docs/design-spec.md` §11.2 六节）+ 动效硬约束。
- `02-TASKS.md`：X00–X08 任务卡（白名单、步骤、完成判据）。
- `03-ACCEPTANCE.md`：机器门命令、截图组清单、报告模板、「不许做」清单。
- `04-START-PROMPT.md`：复制给执行模型的提示词。
- `PROGRESS.md`：唯一状态表 + 待用户确认，执行者更新。
