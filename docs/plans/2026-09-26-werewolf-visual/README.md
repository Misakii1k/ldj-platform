# 狼人杀 · 剧场视觉改造（AI 法官模式）交接计划

更新：2026-09-26。**本目录是执行规范，不代表已实现。** 设计已由用户定稿，执行模型只照做，不做任何新的视觉决定。

## 你从哪里开始

1. 读本文件 → `PROGRESS.md`（找第一个 TODO 任务）→ 该任务在 `02-TASKS.md` 里的一节。
2. 每个视觉任务**先在浏览器里打开对应的定稿方向稿**，它就是像素参照：
   - 起一个静态服务：`npx vite docs/ui-preview --port 5193 --strictPort`，访问 `http://localhost:5193/werewolf/directions/index.html`
   - 或直接双击 `D:/项目/docs/ui-preview/werewolf/directions/*.html`
3. 契约（长什么样、用哪些字段、动效四档）在 `01-CONTRACT.md`；验收（命令、截图组）在 `03-ACCEPTANCE.md`。
4. 开工提示词在 `04-START-PROMPT.md`。

## 定稿方向稿（像素参照，全部位于 `D:/项目/docs/ui-preview/werewolf/directions/`）

| 画面 | 文件 | 用户确认 |
|---|---|---|
| 白天发言（席位 + 发言者 + 交麦） | `A2-box-wings.html` | 2026-09-26「继续」 |
| 入夜 / 夜间行动（狼 / 预 / 女巫 / 守卫 / 闭眼 五视角） | `N-night.html` | 2026-09-26「挺好的」 |
| 投票 / 唱票 / 放逐 / 遗言 / 平票加赛 | `V-vote.html` | 2026-09-26「就这么做吧」 |
| 发身份 / 终局揭晓（好人胜 / 狼人胜） | `R-reveal.html` | 2026-09-26「就这么做吧」 |

方向稿共用样式：`_shared.css`（剧场台口、红幕、脚灯、追光、倒计时环、发言者）、`_ticket.css`（包厢栏 + 剧场票根卡）。方向稿里的工具栏（顶部灰条）只是演示用，**不进正式代码**。

## 范围

- **做**：`AI 法官模式` 玩家端 `WerewolfStage`（`packages/client/src/game/werewolf/ui/WerewolfStage.tsx` 及其子组件、CSS）。
- **不做**（后续另开计划）：真人主持·玩家端 `moderator/PlayerCardView.tsx`、真人主持·法官控制台 `moderator/ModeratorHostConsole.tsx`。它们只需在 W01 移除森林主题时保证不报错、不白屏。
- **不改**：服务端规则、协议字段、`presentation.ts` 已有字段的语义、法官语音逻辑（`useJudgeVoice` / `judgeVoice*`）、私聊。可以在 `presentation.ts` **新增**纯派生字段（见任务卡），不得改已有字段。

## 固定的工作方式

- 一次只领一个任务，按 `PROGRESS.md` 顺序；W02–W07 都改 `WerewolfStage.tsx`，**禁止并行**。
- 每个任务改动的文件不超过任务卡白名单；需要扩大范围时停下，在 `PROGRESS.md` 记原因，交回用户。
- 遇到方向稿没画、本计划也没写的画面细节（例如某个少见阶段的文案），**停下列问题交回用户**，不要自行设计（`DESIGN-DIRECTION.md` C14）。
- 先改、再跑机器门、再出截图组。机器门全绿 ≠ 视觉通过；视觉只由用户看图判定（`AGENTS.md` 视觉验收规范）。报告里视觉项只能写 `待用户看图` / `用户已确认（日期）` / `用户驳回（原话）`。
- 看不到截图（读图超时）就写"我没有看到画面"，不得凭 DOM 推断好看与否。

## 完成的定义

`PROGRESS.md` 状态只能取 TODO / IN_PROGRESS / IMPLEMENTED / BLOCKED / USER_CONFIRMED。
机器门全绿且截图组已产出 → IMPLEMENTED；只有用户看图说合格 → USER_CONFIRMED。

## 文件

- `01-CONTRACT.md`：视觉契约（`docs/design-spec.md` §11.2 六节）。
- `02-TASKS.md`：W00–W08 任务卡（文件白名单、步骤、完成判据）。
- `03-ACCEPTANCE.md`：机器门命令、截图组清单、报告模板、"不许做"清单。
- `04-START-PROMPT.md`：复制给执行模型的提示词。
- `PROGRESS.md`：唯一状态表，执行者更新。
