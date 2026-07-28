# 会话进度日志

## 2026-07-26 会话 1：SPEC 审查 + 项目初始化 + M0 PoC

- 审查桌面 SPEC-v1.1-optimized.md，发现 8 处边界缺口，全部补入原文并新增附录 D。
- 建立 D:\项目：task_plan.md / findings.md / progress.md / README.md。
- 编写 poc/m0：sqlite-poc.mjs、ws-poc.mjs、package.json、README.md（Termux 真机清单）。
- 本机 PoC 结果（Windows / Node 24.13.1 / SQLite 3.51.2）：
  - sqlite-poc：11 项全部通过（WAL、外键、千行事务、回滚、崩溃重开、在线 backup()、
    VACUUM INTO、完整性检查）；单行事务延迟 avg 4.41ms / p95 4.72ms。
  - ws-poc：20 并发连接 × 10 消息回显 200 条，优雅关闭并释放端口。
  - 修正一处脚本错误：在线备份应使用模块级 `backup(db, path)` 而非 `db.backup()`。
- Phase 0 剩余：用户在 ARM64 Termux 真机执行 poc/m0/README.md 清单 → 冻结 DG-01/DG-02。
- 下一步：Phase 1（M1 工程骨架），不依赖真机结果可先行。

## 2026-07-27 会话 2：M1 工程骨架（Phase 1 完成）

- 技术基座：Node 24 type stripping 直跑 .ts（零构建）+ `tsc --noEmit` 严格检查 +
  `node --test` + zod + `node:sqlite` + `ws`；跨包引用靠 workspaces symlink +
  exports 指向 .ts 源，tsc 侧用 paths 映射。
- 四包落地：shared（envelope/17 错误码/zod schema）、server（persistence 迁移器 +
  十张表、core 串行队列 + create_room 命令链 + 幂等回执、gateway HTTP/WS/Origin/限流、
  boot 日志脱敏/地址检测/二维码/优雅停止）、client（Vite+React 最小骨架）、
  games/undercover（manifest 占位）。
- 验证：typecheck ✓、lint ✓、测试 39/39 ✓、client build ✓；真实启动冒烟：迁移、
  双网卡地址检测、二维码、/health/live|ready 200、静态托管 dist 均正常。
- 修复一处测试置错：用了协议外类型 `start_game`（被 envelope 枚举拒为
  INVALID_MESSAGE），改用合法的 `game_action` 验证 ACTION_NOT_ALLOWED。
- 下一步：Phase 2（M2 房间闭环：join/leave/踢人/转让/聊天/重连/幂等全链）。

## 2026-07-27 会话 3：M2 房间闭环（Phase 2 完成）

- shared：join/resume/leave/room_command（discriminatedUnion 白名单）/chat_send/resync
  的 zod schema + roomCodeSchema 归一化 + ChatMessageView。
- executor 扩展：`bumpSeq:false`（聊天不推 roomSeq 仍落幂等回执）、
  `executeInternal`（无 requestId 的系统命令；返回 null 表示无变更不推 seq）。
- core/commands 新增：joinRoom（密码/重名/容量/最小空位/非 LOBBY 降级观战/房主空缺接任）、
  resumeRoom（哈希比对/KICKED 统一 INVALID_RESUME_TOKEN/超时 RESERVATION_EXPIRED）、
  leaveRoom（LOBBY 删行释放昵称；IN_GAME 转断线保留；房主离开立即转让）、
  roomCommand（kick/transfer/update_config/close + 审计）、chat（独立游标 + ≤100 补发）、
  presence（断线标记/自动转让/空置标记）。
- gateway 全接线：会话接管（session_replaced + 关闭码 4002）、踢人断开（4001）、
  关房断开（4003）、断线标记广播、房主 30s 转让计时器（resume 取消）、
  聊天/加入限流、expectedSeq → STALE_CLIENT_STATE+currentSeq、resync 只读直查。
- 测试 +18（room.test.ts 命令层 10 + gatewayM2.test.ts 集成 8），CI 全绿 57/57。
- 修复：① 测试助手先等 open 再挂 message 监听会错过 welcome 首帧；
  ② resume 过期路径内 UPDATE 会被事务回滚，改为不落库（到期清扫属 M4）；
  ③ pickNextHost 同毫秒 joined_at 平局不确定，加 seat 次序键；
  ④ 删除 M1 冒烟遗留的旧 schema data/platform.db（无部分昵称索引，迁移器不重跑 v1）。
- 下一步：Phase 3（M3 谁是卧底：词库/状态机/视角隔离/开局原子性）；
  client 仍为骨架，房间 UI 随 M3 一并推进。

## 2026-07-27 会话 4：M3 完成（Phase 3 收尾）

- 服务端 M3 在前序会话已落地（词库、状态机、视角白名单、对局会话、gateway 集成、
  19+8 个测试），本会话收尾客户端 UI 与文档同步。
- 客户端 UI（packages/client/src/）：
  - connection/：ConnectionContext 单例 WS + 自动重连退避 + envelope 分发器 +
    六态（connecting/connected/reconnecting/synced/seat_expired/server_recovering）+
    requestId 幂等回执 + roomSeq 期望校验 + STALE_CLIENT_STATE 自动 resync。
  - app/ConnectPage：昵称 + 创建/加入房间双模式 + 可选密码 + 观战。
  - room/RoomPage：成员列表（在线/断线/房主/席位）、房间码+复制、聊天（公屏+
    系统消息）、房主操作栏（开始/踢人/转让/终止/关闭/返回大厅）、离开房间。
  - game/：GamePage 按 phase 分发；WordRevealView（pointerdown 显示/pointerup
    遮挡 + visibilitychange/blur 立即遮挡）；SpeakingView（顺序高亮+倒计时+
    我已说完）；VotingView（候选卡片，runoff 仅 runoffCandidates，已投整列禁用）；
    VoteResultView（lastVoteSummary 摘要 + tally）；GameOverView（胜方+两词
    揭示+全员角色+房主返回大厅）。
  - shared-ui/useCountdown：基于 deadlineAt + 服务端时钟校正。
  - styles.css：移动优先（320px 可用、44×44 触摸目标、safe-area、倒计时颜色+
    数字双信号、错误文案可读）。
  - App.tsx 重写为状态路由（无 react-router，无状态管理库）。
- 词库复核：原 119 组补到 120，新增"台风/龙卷风"（自然类），WORD_BANK_VERSION
  1→2，words.test.ts invariant 测试无需调整（断言 >=100 与 >=1）。
- 验证：Node 24.13.1 下 typecheck ✓、lint ✓、test 94/94 ✓（含 gameSession/
  gatewayGame/module/words/room/gatewayM2/protocol/executor/queue/persistence/
  gateway/boot 全部套件）、build ✓（61 模块 285KB JS+12KB CSS）、启动冒烟 ✓
  （/health/live|ready 200、静态托管 dist 200、二维码输出正常）。
  注：本机 PATH 中默认 node 为 v22.16.0（不支持原生 TS type stripping），
  需用 "C:\Program Files\nodejs\node.exe"（v24.13.1）运行测试与 dev:server。
- M3 退出标准：AC-05 秘密视角（gatewayGame 三类视角不泄密）、AC-06 发言推进、
  AC-07 普通投票、AC-08 平票加赛、AC-09 胜负判定、AC-17 掉线超时退出，
  全部由自动化测试覆盖通过。
- 下一步：Phase 4（M4 持久化恢复：每动作原子提交、计时器持久化、启动恢复、
  崩溃注入测试）。

## 2026-07-28 会话 5：M4 完成（Phase 4 持久化恢复）

- 启动恢复（packages/server/src/core/recovery.ts）：
  - 重置非 CLOSED 房间成员 connection_status 为 DISCONNECTED_RESERVED（KICKED 保留）。
  - 校验 module_id、state_schema_version、snapshot_json 可解析性；失败 → ABORTED +
    系统聊天 + 房间 POST_GAME，不写 game_results。
  - 通过校验的会话进入 RECOVERING，按 deadlineAt ASC 逐个补执行到期计时器
    （复用 consumeDueTimer，独立事务）。
  - 补执行完毕后 RECOVERING → ACTIVE；返回 RecoverySummary 供日志记录。
- 恢复期并发控制：applyGameAction 对 RECOVERING 会话返回 RECOVERY_IN_PROGRESS；
  TimerRunner 的 consumeDueTimer 接受 ACTIVE/RECOVERING 会话。
- 启动接线：app.ts 在 migrate 之后、timerRunner.start() 之前同步执行
  runStartupRecovery，确保接受新连接前对局已恢复。
- 崩溃注入测试（packages/server/tests/recovery.test.ts）新增 10 个用例：
  - AC-15a/b/c/d：看词/发言/投票/结算阶段崩溃后已确认操作保留、到期计时器正确补执行。
  - AC-16：跨 deadline 重启，计时器按顺序只执行一次。
  - 快照损坏 / 模块未注册 → ABORTED + 系统提示；成员状态重置；
    恢复期 game_action 返回 RECOVERY_IN_PROGRESS；下游计时器链式推进。
- 验证：Node 24.13.1 下 typecheck ✓、lint ✓、test 104/104 ✓（新增 10 个恢复测试），
  dev:server 启动冒烟 ✓（恢复日志输出正常，/health/ready 200）。
  注：本机 PATH 默认 node 仍为 v22.16.0，需用 "C:\Program Files\nodejs\node.exe"
  运行测试与 dev:server。
- M4 退出标准：AC-15/AC-16 自动化通过，RPO=0（已确认动作不丢失），
  RTO 同步完成远低于 60 秒。
- 下一步：Phase 5（M5 发布候选：UI 打磨、PWA、Termux 文档、性能/安全测试、
  真实聚会验收）。
