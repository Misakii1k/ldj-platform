# 完成 M3（谁是卧底）Spec

## Why

M3 的服务端部分（GameModule 纯函数、对局会话、gateway 集成、计时器接线、3 类视角白名单、19+8 个测试）已实际落地但未在 `progress.md`/`task_plan.md` 中标记完成；客户端游戏 UI 仍停留在 M1 骨架，无法支撑真实开局。本变更收尾 M3：补齐客户端 UI、补齐词库复核确认、同步进度文档，使里程碑达到 SPEC §15 退出标准（AC-05~09、AC-17 自动化通过）。

## What Changes

- 客户端：把 M1 骨架扩展为完整的房间 + 游戏流程
  - 连接管理器：处理 welcome / ack / error / room_seq / game_state / game_event / chat_batch / room_snapshot / session_replaced / disconnect 等服务端消息，幂等回执、roomSeq 校验、STALE_CLIENT_STATE 后自动 resync
  - 路由视图：连接页 → 大厅（创建/加入房间）→ 房间页（成员列表、聊天、房主操作：开始游戏 / 踢人 / 转让 / 改配置 / 关房）→ 游戏页 → 结算页 → 返回大厅
  - 游戏页：按当前 phase 渲染（word_reveal 按住看词 + 失焦自动遮挡 / speaking 当前发言者高亮 + 倒计时 + 我已说完 / voting 候选人卡片 + 已投/未投进度 + 不能投自己/已淘汰/已投过 / runoff_voting 仅候选人可选 / vote_result 上轮结算摘要 / game_over 胜负 + 揭示所有角色与词语 + 返回大厅）
  - 秘密信息展示（§7.2）：词语默认遮挡、按住显示、页面失焦/visibilitychange 立即遮挡、不出现在标题/URL/日志
  - 连接反馈（§7.3）：connecting / connected / reconnecting / synced / seat_expired / server_recovering 六态
  - 移动优先（§7.1）：320 CSS px 可用，点击目标 ≥44×44，安全区适配，倒计时视觉变化（§7.4 颜色非唯一信号）
- 文档：同步 `progress.md`（新增"会话 4：M3 完成"条目）与 `task_plan.md`（Phase 3 改为 complete）
- 词库复核：检查 [words.ts](file:///d:/项目/packages/games/undercover/server/words.ts) 中 120 组词对的合法性（两词不重复、反向去重、无空、无敏感词），若需调整则同步 `WORD_BANK_VERSION`；不要求外部用户复核（DG-04 在 M5 真实聚会前完成即可）
- 验证：在 Node 24 环境下跑通 `npm run ci`（typecheck + lint + 全部测试含 M3 新增的客户端无新增 lint 错误），AC-05~09、AC-17 由自动化测试覆盖

## Impact

- Affected specs: SPEC §6（谁是卧底游戏规格）、§7（客户端与交互要求）、§15（里程碑 M3）
- Affected code:
  - [packages/client/src/App.tsx](file:///d:/项目/packages/client/src/App.tsx)（重写为路由式应用）
  - `packages/client/src/`（新增 connection/、app/、room/、game/、shared-ui/ 等子目录）
  - [packages/client/package.json](file:///d:/项目/packages/client/package.json)（可能新增 react-router-dom 等依赖；最小化原则下可仅用内部状态切换）
  - [progress.md](file:///d:/项目/progress.md)、[task_plan.md](file:///d:/项目/task_plan.md)、[README.md](file:///d:/项目/README.md)（状态同步）
  - [packages/games/undercover/server/words.ts](file:///d:/项目/packages/games/undercover/server/words.ts)（仅当复核发现问题时）

## ADDED Requirements

### Requirement: 客户端游戏界面

系统 SHALL 提供移动优先的浏览器界面，支持玩家完成创建/加入房间、聊天、开始与进行"谁是卧底"对局、查看结算与返回大厅的完整闭环。

#### Scenario: 创建并加入房间

- **WHEN** 用户在连接页输入昵称并提交
- **THEN** 客户端连接 WebSocket，发送 `create_room` 或 `join_room`（带房间码）
- **AND** 收到 `room_snapshot` 后切换到房间页，展示成员列表、房主标记、房间码与二维码

#### Scenario: 房主开始游戏

- **WHEN** 房主在房间页点击"开始游戏"按钮（4-12 名在线玩家）
- **THEN** 客户端发送 `room_command` payload `{ command: 'start_game' }`
- **AND** 收到 `room_snapshot`（status=IN_GAME）后所有玩家切换到游戏页 word_reveal 阶段

#### Scenario: 看词阶段

- **WHEN** 玩家进入 word_reveal 阶段
- **THEN** 界面显示"按住查看你的词"按钮，按下时显示自己词语、松开立即遮挡
- **AND** 页面失焦（visibilitychange=hidden）时立即遮挡
- **AND** 玩家点击"我已看完"发送 `game_action { type: 'confirm_word' }`
- **AND** 全员确认或 30 秒超时后服务端推进到 speaking

#### Scenario: 发言阶段

- **WHEN** 处于 speaking 阶段
- **THEN** 界面按 `speakingOrder` 高亮当前发言者、显示倒计时
- **AND** 当前发言者显示"我已说完"按钮（点击发送 `finish_speech`）；非当前发言者该按钮禁用

#### Scenario: 投票阶段

- **WHEN** 处于 voting 阶段
- **THEN** 界面显示存活玩家候选卡片（不包含已淘汰者）
- **AND** 玩家不能投自己（按钮置灰）、不能改投（已投后整列禁用并提示"已投票"）
- **AND** 加赛阶段（runoff_voting）只显示 `runoffCandidates` 作为可选项

#### Scenario: 结算与返回大厅

- **WHEN** 收到 `game_state` 且 `phase=game_over`
- **THEN** 显示胜方阵营、揭示所有玩家角色与本局两个词
- **AND** 房主显示"返回大厅"按钮（发送 `room_command { command: 'return_to_lobby' }`）

### Requirement: 连接状态反馈

系统 SHALL 在客户端明确展示 connecting / connected / reconnecting / synced / seat_expired / server_recovering 六种状态，同步未完成时禁用会改变状态的按钮。

#### Scenario: 会话被接管

- **WHEN** 客户端收到 `session_replaced` 或被以 4002 关闭
- **THEN** 显示"席位已被其他设备接管"并禁用所有交互

#### Scenario: 房间序号过期

- **WHEN** 客户端收到 `error` code=STALE_CLIENT_STATE
- **THEN** 自动发送 `resync` 请求，并展示"正在重新同步"

## MODIFIED Requirements

### Requirement: 进度文档同步

`progress.md` SHALL 新增"会话 4：M3 完成"条目，记录：客户端 UI 落地范围、词库复核结果、CI 测试数量、M3 退出标准达成情况、下一步指向 M4。`task_plan.md` 的 Phase 3 SHALL 改为 complete 状态并勾选所有子项。`README.md` 的"当前状态"SHALL 更新为"Phase 3 完成，下一步 M4 持久化恢复"。

## REMOVED Requirements

无删除项。
