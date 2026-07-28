# Tasks

## 任务依赖说明

- Task 1（连接层）是所有客户端任务的基础
- Task 2（房间页）依赖 Task 1
- Task 3（游戏页）依赖 Task 2
- Task 4（结算 + 返回大厅）依赖 Task 3
- Task 5（移动端打磨 + 可访问性）依赖 Task 4
- Task 6（词库复核）可与 1-5 并行
- Task 7（CI 验证）依赖 1-6 全部完成
- Task 8（文档同步）依赖 7

## 任务列表

- [x] Task 1: 实现客户端 WebSocket 连接层
  - 在 `packages/client/src/connection/` 下创建 `ConnectionContext.tsx`：单例 WebSocket、自动重连退避、消息分发器
  - 实现 envelope 收发：welcome / ack / error / room_seq / game_state / game_event / chat_batch / room_snapshot / session_replaced 处理
  - 维护连接六态：connecting / connected / reconnecting / synced / seat_expired / server_recovering
  - 实现 requestId 幂等回执表 + roomSeq 期望值校验；STALE_CLIENT_STATE 时自动发送 `resync`
  - 暴露 `useConnection()` / `useSend()` hooks 给上层视图
  - 验证：单元测试覆盖消息分发与重连退避（用 vitest 或纯 React Testing Library，不引入额外依赖则用纯函数抽出可测逻辑）

- [x] Task 2: 实现连接页与房间页
  - `packages/client/src/app/ConnectPage.tsx`：昵称输入、加入已有房间（房间码）、创建新房间（房名/密码可选）
  - `packages/client/src/room/RoomPage.tsx`：成员列表（在线/断线标记、房主图标、席位角色）、房间码与二维码展示、聊天区（公屏 + 系统消息）、房主操作栏（开始游戏 / 踢人 / 转让 / 改配置 / 关房）
  - 聊天输入框在同步未完成时禁用发送但保留草稿
  - 验证：手动启动 dev 服务冒烟（创建 → 加入 → 聊天 → 离开）

- [x] Task 3: 实现游戏页（word_reveal / speaking / voting / runoff_voting / vote_result）
  - `packages/client/src/game/GamePage.tsx`：根据 `phase` 渲染子视图
  - `WordRevealView.tsx`：按住显示词语（pointerdown 显示、pointerup 隐藏）、visibilitychange/blur 立即遮挡、"我已看完"按钮（已确认则置灰）
  - `SpeakingView.tsx`：speakingOrder 列表 + 当前发言者高亮 + 倒计时（基于 deadlineAt）、当前发言者可点击"我已说完"
  - `VotingView.tsx`：候选玩家卡片（voting 显示所有存活者，runoff_voting 只显示 runoffCandidates），不能投自己/已淘汰者，已投后整列禁用
  - `VoteResultView.tsx`：展示 lastVoteSummary（淘汰者/平票/无人淘汰/加赛平票）+ 5 秒倒计时提示
  - 验证：本地起服务+多浏览器实例跑通一局到 game_over 前夕

- [x] Task 4: 实现结算页与返回大厅
  - `GameOverView.tsx`：胜方阵营大字 + 所有玩家角色与两词揭示 + 房主"返回大厅"按钮
  - 房间 status=POST_GAME 时仍保留成员与房主关系（已由服务端保证）
  - 验证：跑完一局后点返回大厅，房间页应可重新开始游戏

- [x] Task 5: 移动端打磨与可访问性
  - 320 CSS px 宽度下可操作（用 Chrome DevTools 设备模拟 iPhone SE）
  - 关键按钮 ≥44×44 CSS px，按钮间距防误触
  - 安全区 / 软键盘适配（投票按钮不被键盘遮挡）
  - 倒计时颜色 + 数字双信号（§7.4 不只靠颜色）
  - 错误文案可读（不只显示错误码）
  - 验证：手动设备模拟走查

- [x] Task 6: 词库复核
  - 读 [packages/games/undercover/server/words.ts](file:///d:/项目/packages/games/undercover/server/words.ts) 全部 120 组词对
  - 检查：两词不得相同、去空白后非空、反向重复只保留一组（如 包子/馒头 与 馒头/包子 不重复）、无明显敏感词
  - 若发现问题：修正词对，必要时 bump `WORD_BANK_VERSION`
  - 验证：补充 words.test.ts 中已有 invariant 测试仍通过；如有新增/删除则更新测试

- [x] Task 7: CI 全量验证
  - 在 Node 24 环境运行 `npm run typecheck`（含 client tsconfig）
  - 运行 `npm run lint`
  - 运行 `npm run test`：确认服务端 gameSession / gatewayGame / module 测试全绿，shared/server 测试无回归
  - 运行 `npm run build`：client 构建无错误
  - 真实启动冒烟：`npm run dev:server` + 浏览器访问，跑通 创建→加入→开始→一局→结算→返回大厅 全流程
  - 验证：上述 5 项均通过；记录最终测试总数

- [x] Task 8: 同步进度文档
  - [progress.md](file:///d:/项目/progress.md)：新增"## 2026-07-27 会话 4：M3 完成（Phase 3 收尾）"条目，记录客户端 UI 范围、词库复核结论、CI 测试数、AC-05~09/17 达成情况、下一步 M4
  - [task_plan.md](file:///d:/项目/task_plan.md)：Phase 3 标题改为 `### Phase 3：M3 谁是卧底 — complete（2026-07-27）`，所有子项勾选 `[x]`，退出标准追加实际测试数
  - [README.md](file:///d:/项目/README.md)："当前状态"改为"Phase 3 完成，下一步 M4 持久化恢复"
  - 验证：diff 自查无遗漏字段

# Task Dependencies

- Task 2 依赖 Task 1
- Task 3 依赖 Task 2
- Task 4 依赖 Task 3
- Task 5 依赖 Task 4
- Task 7 依赖 Task 1-6 全部完成
- Task 8 依赖 Task 7
- Task 6 可与 Task 1-5 并行
