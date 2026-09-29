# before 截图组 · 待父会话串行采集

按 `docs/plans/2026-09-26-werewolf-visual/02-TASKS.md` W00 第 3 步与 `03-ACCEPTANCE.md` §2，
本目录应放 11 画面 × 2 视口（`1280x800` / `390x844`）的**改造前**截图。

文件名：`werewolf-<画面>-<宽x高>.png`。

**未采集原因**：本执行会话被明确禁止运行 `npx playwright test` 与 `npm run build`
（`packages/client/dist` 与端口 3178 由父会话串行占用），截图需要 Playwright 驱动构建产物。

状态：**before 截图待父会话串行采集**。

画面清单（与 after 一一对应）：

| # | 文件名片段 | 局面 |
|---|---|---|
| 1 | `deal` | role_reveal，你的牌已翻开（女巫） |
| 2 | `night-wolf` | night，你是狼人，已选 4 号未确认 |
| 3 | `night-witch` | night，你是女巫，4 号被刀 |
| 4 | `night-sleep` | night，你是村民，狼人行动中 |
| 5 | `speech` | discussion，5 号发言，你是下一位 |
| 6 | `speech-self` | discussion，轮到你发言 |
| 7 | `vote` | voting，你已选 4 号未确认 |
| 8 | `count` | vote_result，唱票结束 |
| 9 | `exile` | vote_result，4 号被放逐（撕票后） |
| 10 | `finale-village` | game_over，好人胜 |
| 11 | `finale-wolves` | game_over，狼人胜 |
