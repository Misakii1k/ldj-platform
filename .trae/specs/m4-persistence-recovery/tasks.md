# Tasks

## 任务依赖说明

- Task 1（recovery.ts 核心）是所有后续任务的基础
- Task 2（consumeDueTimer 状态放宽）独立但被 Task 1 依赖
- Task 3（applyGameAction 错误码）独立
- Task 4（app.ts 接线）依赖 Task 1
- Task 5（崩溃注入测试）依赖 Task 1-4 全部完成
- Task 6（CI 验证）依赖 Task 5
- Task 7（文档同步）依赖 Task 6

## 任务列表

- [ ] Task 1: 实现 `core/recovery.ts` 启动恢复模块

  - 创建 `packages/server/src/core/recovery.ts`
  - 导出 `runStartupRecovery(db, executor, logger): RecoverySummary`
  - 步骤 1：`UPDATE room_members SET connection_status = 'DISCONNECTED_RESERVED' WHERE connection_status NOT IN ('KICKED','DISCONNECTED_RESERVED')`（在事务内，仅非 CLOSED 房间成员）
  - 步骤 2：查询所有 `status IN ('PREPARING','ACTIVE','RECOVERING')` 的 game_sessions
    - 对每个会话：检查 `getGameModule(module_id)` 是否存在
    - 检查 `module.manifest.stateSchemaVersion === session.state_schema_version`（不匹配时尝试 `module.migrateSnapshot`，无则失败）
    - 尝试 `JSON.parse(session.snapshot_json)`
    - 任一失败：`UPDATE game_sessions SET status = 'ABORTED'` + `UPDATE rooms SET status = 'POST_GAME'` + 插入系统聊天 + 不写 game_results
    - 全部通过：`UPDATE game_sessions SET status = 'RECOVERING'`
  - 步骤 3：循环查询 `timers WHERE status = 'pending' AND deadline_at <= now ORDER BY deadline_at ASC LIMIT 1`，调用 `executor.executeInternal` + `consumeDueTimer`，直到无到期计时器
  - 步骤 4：`UPDATE game_sessions SET status = 'ACTIVE' WHERE status = 'RECOVERING'`
  - 返回 `{ roomsProcessed, sessionsRecovered, sessionsAborted, timersFired }`
  - 验证：单元测试覆盖各分支（模块缺失、schema 不匹配、快照损坏、正常恢复）

- [ ] Task 2: 放宽 `consumeDueTimer` 会话状态过滤

  - 修改 [packages/server/src/core/game/timerRunner.ts](file:///d:/项目/packages/server/src/core/game/timerRunner.ts)
  - `consumeDueTimer` 内的查询 `WHERE id = ? AND status = 'ACTIVE'` 改为 `WHERE id = ? AND status IN ('ACTIVE','RECOVERING')`
  - 验证：现有 gameSession.test.ts 中的 TimerRunner 测试仍通过；RECOVERING 会话的计时器可被消费

- [ ] Task 3: `applyGameAction` 在 RECOVERING 时抛 RECOVERY_IN_PROGRESS

  - 修改 [packages/server/src/core/game/session.ts](file:///d:/项目/packages/server/src/core/game/session.ts) 的 `applyGameAction`
  - 当前：`if (!session || session.status !== 'ACTIVE')` 统一抛 `ACTION_NOT_ALLOWED`
  - 改为：
    - `if (!session)` → `ACTION_NOT_ALLOWED`（无对局）
    - `if (session.status === 'RECOVERING')` → `RECOVERY_IN_PROGRESS`
    - `if (session.status !== 'ACTIVE')` → `ACTION_NOT_ALLOWED`（PREPARING/FINISHED/ABORTED）
  - 验证：现有测试无回归；新增恢复期测试覆盖 RECOVERY_IN_PROGRESS 路径

- [ ] Task 4: 在 `app.ts` 接线启动恢复

  - 修改 [packages/server/src/app.ts](file:///d:/项目/packages/server/src/app.ts) 的 `createApp`
  - 在 `migrate(db)` 之后、`new RoomCommandExecutor` 之后、`timerRunner.start()` 之前调用 `runStartupRecovery(db, executor, logger)`
  - 记录日志 `logger.info('recovery_completed', summary)`
  - 验证：现有 boot.test.ts / gateway.test.ts 启动冒烟无回归；新增测试验证恢复被调用

- [ ] Task 5: 崩溃注入测试 `tests/recovery.test.ts`

  - 新增 `packages/server/tests/recovery.test.ts`
  - 使用 `node:os.tmpdir()` + `randomUUID` 生成临时 db 文件路径，测试后清理
  - 辅助函数 `crashAndRestart(dbPath, executor)`：closeDb → openDb → migrate → runStartupRecovery
  - 测试用例：
    1. word_reveal 崩溃重启：confirm_word 保留、到期 reveal 计时器补执行 → speaking
    2. speaking 崩溃重启：finish_speech 保留、speakingOrder/currentSpeakerIndex 正确
    3. voting 崩溃重启：cast_vote 保留、到期投票计时器补执行并结算
    4. vote_result 崩溃重启：到期展示计时器补执行 → 下一轮 speaking 或 game_over
    5. 跨 deadline 重启（多计时器到期）：按 deadlineAt 顺序补执行、每个只执行一次
    6. 快照 JSON 损坏：会话 ABORTED + 系统聊天 + POST_GAME + 无 game_results
    7. 伪造 module_id：会话 ABORTED + 系统聊天
    8. 恢复后成员 connection_status 全部 DISCONNECTED_RESERVED（KICKED 不变）
    9. 恢复期 game_action 返回 RECOVERY_IN_PROGRESS（手动构造 RECOVERING 会话）
    10. 补执行产生的下游到期计时器继续补执行（链式推进）
  - 验证：10 个测试全绿；AC-15/AC-16 由用例 1-5/10 覆盖

- [ ] Task 6: CI 全量验证

  - 在 Node 24 环境运行 `npm run typecheck`
  - 运行 `npm run lint`
  - 运行 `npm run test`：确认 recovery.test.ts 全绿，原有 94 测试无回归
  - 真实启动冒烟：`npm run dev:server`，确认恢复日志输出、/health/ready 200
  - 验证：上述 4 项均通过；记录最终测试总数

- [ ] Task 7: 同步进度文档

  - [progress.md](file:///d:/项目/progress.md)：新增"## 2026-07-28 会话 5：M4 完成（Phase 4 持久化恢复）"条目，记录恢复流程实现范围、崩溃注入测试覆盖、CI 测试数、AC-15/16 达成情况、下一步 M5
  - [task_plan.md](file:///d:/项目/task_plan.md)：Phase 4 标题改为 `### Phase 4：M4 持久化恢复 — complete（2026-07-28）`，所有子项勾选 `[x]`，退出标准追加实际测试数
  - 验证：diff 自查无遗漏字段

# Task Dependencies

- Task 2 独立（可先做）
- Task 3 独立（可先做）
- Task 1 依赖 Task 2（recovery 需要 consumeDueTimer 接受 RECOVERING）
- Task 4 依赖 Task 1
- Task 5 依赖 Task 1-4 全部完成
- Task 6 依赖 Task 5
- Task 7 依赖 Task 6
