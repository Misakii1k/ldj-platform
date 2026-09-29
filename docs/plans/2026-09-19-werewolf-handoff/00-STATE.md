# 00 · 交接现场与证据边界

## 已核对的环境

- 目录：D:/项目；分支 main；HEAD 21c2daf4fea968bd0bf4f4dfa86e80b226002c22。
- Windows / PowerShell / Node 24。命令从 D:/项目 执行。
- 工作区已有大量修改（涉及多游戏、美术、E2E 等），不是本交接的全部产物。不得按文件出现在 diff 中就宣称是自己实现的。
- 当前实际注册自动规则集：werewolf_legacy_platform_v2、werewolf_platform_open_kill_v1；真人主持：werewolf_moderator_v1。以 D:/项目/packages/server/src/core/game/registry.ts 为准，不相信 V2 module.ts 中“未注册”的旧注释。
- 本轮只新增交接文档/证据，未继续修改业务实现。

## 已存在但尚不能称为完成的代码

|领域|核实到的内容|尚缺|
|---|---|---|
|私聊协议|D:/项目/packages/shared/src/protocol/messages.ts 的 chat_send 增加可选 toPlayerId，ChatMessageView 增加可选收件人|前端使用、隔离回归、请求重放/失败验收|
|数据库|D:/项目/packages/server/src/persistence/migrations.ts 已有 version 9 private-room-chat，使用 up 字段，新增 nullable to_player_id 与索引|旧库升级、旧消息保持公共、幂等迁移测试|
|私聊服务|D:/项目/packages/server/src/core/commands/chat.ts 校验收件人；listChatAfter 先过滤再 LIMIT；默认 viewer=null 只读公共|真实多连接、补发、目标离房、跨局、机器人上下文测试|
|WS|D:/项目/packages/server/src/gateway/ws.ts 将 toPlayerId 传入 handler，实时逐连接过滤，resync 传 viewer|全入口复核及 E2E|
|时间线|D:/项目/packages/shared/src/game/werewolfTimeline.ts 已建并从 shared 导出|只是类型草案，没有 engine/moderator/client 接入，不能算流程完成|

已存在的 rules.ts/module.ts 修改包括 day_announcement 时长、wolfDelta、守卫空守处理等。这些不是新权威时间线实现，保留而非重写。

## 实际代码缺口（已定位）

- D:/项目/packages/client/src/game/GameChatDrawer.tsx 已有公共聊天抽屉，但 GamePage.tsx 当前未挂载它；只有单草稿/单未读游标；发送时先清草稿再失败恢复，需改为 ACK 后清除。
- D:/项目/packages/client/src/game/werewolf/WerewolfGamePage.tsx 的演出构建链需显式只传公共消息；不能让收到私聊的玩家把私聊转成舞台内容。
- D:/项目/packages/client/src/game/werewolf/ui/WerewolfStage.tsx 顶栏仍是 A/B/C；自己维护主题和本地 Date.now 倒计时；仍有客户端补播夜晚及屏蔽白天视图的逻辑。
- D:/项目/packages/client/src/shared-ui/useCountdown.ts 在每次 render 用 serverNow - Date.now 重算偏移，可能令校正后的当前时间固定；不是稳定接收时采样。
- D:/项目/packages/client/src/game/werewolf/ui/GameOverReveal.tsx 用 name 找席位，重名会错配，需改 playerId。
- D:/项目/packages/client/src/shared-ui/useTabletopMenu.ts 退出/解散失败仍在 finally 清会话，集成设置时应修复失败反馈，不能显示假成功。
- D:/项目/packages/shared/src/game/werewolfModeratorTypes.ts 目前只含 begin/eliminate_player/revive_player/end_game，没有主持节奏控制。
- 两个自动引擎仍以整夜操作/整夜超时为主；D:/项目/packages/games/werewolf/server/judgeVoiceWrapper.ts 仅延长旧整夜时限，不能替代权威角色时序。
- 主样式实际路径是 D:/项目/packages/client/src/game/werewolf/werewolf-native.css，不在 ui 子目录。

## 截图与视觉证据

以下是 2026-09-19 16:37–16:38 捕获的最新候选基线，已记录哈希：

- D:/项目/output/playwright/werewolf-live-20260919-A-desktop.png
- D:/项目/output/playwright/werewolf-live-20260919-B-desktop.png
- D:/项目/output/playwright/werewolf-live-20260919-C-desktop.png
- D:/项目/output/playwright/werewolf-live-20260919-C-mobile.png

本次图片读取工具没有返回图像，因此没有声称对上述截图做过视觉签收。小模型开工 T00 必须实际查看，并核对当前运行页；若与最新页面不同，重新捕获，不使用 8 月截图替代。
本包锁定代码结构、配色和参数，不能凭文字规范承诺像素级零偏差。

## 验证与进程

- 本次 npm run typecheck 已实际返回退出码 0；日志：baseline-typecheck.log / baseline-typecheck.exit.txt。
- 本次选择执行 protocol、persistence、gatewayM2 旧测试，结果见 baseline-tests.log / baseline-tests.exit.txt 及 04-PROGRESS.md。它们不证明新增私聊隔离或新流程已通过。
- 原计划的“61 项通过”是历史基线，不能冒充本轮结果。
- 本次未构建、未新开浏览器、未启动游戏开发服务；单元/集成测试可能短暂创建自有内存服务，由测试回收。
- 原有游戏服务进程在核对时是 PID 34736，命令 node packages/server/src/index.ts；这不是本轮创建，不得关闭。PID 会变，执行者必须核实自己启动时的 PID/启动时间/命令行。
- 不得杀全部 node/chrome。后续 Start-Process 辅助服务必须 WindowStyle Hidden，记录拥有的进程后精确清理。
