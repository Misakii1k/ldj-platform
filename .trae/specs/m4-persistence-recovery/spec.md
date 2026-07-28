# M4 持久化恢复 Spec

## Why

SPEC §10.3/§10.4/§15 要求 MVP 达到"已确认操作 RPO=0、进程重启后 ≤60 秒恢复"。
当前代码已实现每动作原子提交（executor + session.ts 在同事务内写 events/snapshot/timers/results/receipt），但**启动恢复流程缺失**：

- `app.ts` 启动时只做 `integrityCheck + migrate + timerRunner.start()`，未重置成员连接状态、未校验快照、未显式进入/退出 RECOVERING。
- `consumeDueTimer` 的查询 `status = 'ACTIVE'` 排除了 RECOVERING 会话，导致恢复期无法补执行到期计时器。
- `applyGameAction` 在会话 RECOVERING 时只抛通用 `ACTION_NOT_ALLOWED`，未用协议已定义的 `RECOVERY_IN_PROGRESS`，客户端无法进入 `server_recovering` 态。
- 缺少跨进程重启的崩溃注入测试（AC-15/AC-16）。

本变更补齐启动恢复流程、错误映射与崩溃注入测试，使里程碑达到 SPEC §15 退出标准（AC-15/AC-16 通过，RPO=0、RTO≤60s）。

## What Changes

- 新增 `packages/server/src/core/recovery.ts`：
  - `runStartupRecovery(db, executor, logger)`：启动恢复主流程（§10.4 全部 7 步）
    1. 重置所有非 CLOSED 房间的 `room_members.connection_status` 为 `DISCONNECTED_RESERVED`（保留 `reserved_until`，不信任上一进程的连接标记）
    2. 遍历每个活动对局（PREPARING/ACTIVE/RECOVERING）：
       - 模块未注册 → 标记 ABORTED + 插入系统聊天"对局因服务升级无法恢复，已终止"
       - `stateSchemaVersion` 与当前模块不匹配且无 `migrateSnapshot` → ABORTED + 系统聊天
       - 快照 JSON 解析失败 → ABORTED + 系统聊天
       - 通过校验 → 标记 RECOVERING
    3. 按 `deadlineAt ASC` 顺序逐个补执行到期计时器（每个独立事务，§10.4.5/§10.4.6）
    4. 全部到期计时器补执行完毕后，将所有 RECOVERING 会话标记 ACTIVE（§10.4.6）
    5. 返回恢复摘要（房间数/会话数/已终止数/已补计时器数）供日志输出
- 修改 `packages/server/src/core/game/timerRunner.ts`：
  - `consumeDueTimer` 的会话查询从 `status = 'ACTIVE'` 改为 `status IN ('ACTIVE','RECOVERING')`，使恢复期可补执行
- 修改 `packages/server/src/core/game/session.ts`：
  - `applyGameAction` 在会话 `status === 'RECOVERING'` 时抛 `RECOVERY_IN_PROGRESS`（替代通用 `ACTION_NOT_ALLOWED`），让客户端正确进入 `server_recovering` 态
- 修改 `packages/server/src/app.ts`：
  - 在 `migrate` 之后、`timerRunner.start()` 之前调用 `runStartupRecovery`，记录恢复摘要日志
- 新增 `packages/server/tests/recovery.test.ts`：
  - 使用临时文件 db（非 :memory:），模拟"写若干动作 → 关闭 db → 重新打开 → 跑恢复"的崩溃注入
  - 覆盖 AC-15（各阶段崩溃后已确认操作不丢失）+ AC-16（跨 deadline 重启后计时器按序补执行且只执行一次）
- 文档：同步 `progress.md`（新增"会话 5：M4 完成"条目）与 `task_plan.md`（Phase 4 改为 complete）

## Impact

- Affected specs: SPEC §10.3（原子提交）、§10.4（启动恢复）、§15（里程碑 M4）、AC-15/AC-16
- Affected code:
  - 新增 [packages/server/src/core/recovery.ts](file:///d:/项目/packages/server/src/core/recovery.ts)
  - 修改 [packages/server/src/core/game/timerRunner.ts](file:///d:/项目/packages/server/src/core/game/timerRunner.ts)（`consumeDueTimer` 会话状态过滤）
  - 修改 [packages/server/src/core/game/session.ts](file:///d:/项目/packages/server/src/core/game/session.ts)（`applyGameAction` 错误码）
  - 修改 [packages/server/src/app.ts](file:///d:/项目/packages/server/src/app.ts)（启动接线）
  - 新增 [packages/server/tests/recovery.test.ts](file:///d:/项目/packages/server/tests/recovery.test.ts)
  - 修改 [progress.md](file:///d:/项目/progress.md)、[task_plan.md](file:///d:/项目/task_plan.md)

## ADDED Requirements

### Requirement: 启动恢复流程

系统 SHALL 在服务启动时、接受新连接之前，对所有非 CLOSED 房间与活动对局执行恢复流程，确保已确认操作不丢失、过期计时器按序补执行。

#### Scenario: 重置成员连接状态

- **WHEN** 服务启动且数据库迁移完成
- **THEN** 所有非 CLOSED 房间的 `room_members.connection_status` 被重置为 `DISCONNECTED_RESERVED`
- **AND** `reserved_until` 字段保持不变
- **AND** KICKED 成员保持 KICKED（不被重置）

#### Scenario: 活动对局进入 RECOVERING 并补执行到期计时器

- **WHEN** 服务启动时存在 ACTIVE 状态的对局且有到期计时器
- **THEN** 会话先被标记为 RECOVERING
- **AND** 到期计时器按 `deadlineAt ASC` 顺序逐个补执行（每个独立事务）
- **AND** 补执行期间玩家 game_action 被拒绝并返回 `RECOVERY_IN_PROGRESS`
- **AND** 全部补执行完毕后会话转为 ACTIVE

#### Scenario: 快照无法恢复时标记 ABORTED

- **WHEN** 活动对局的模块未注册、或 stateSchemaVersion 不匹配且无 migrateSnapshot、或快照 JSON 解析失败
- **THEN** 会话被标记 ABORTED
- **AND** 房间状态转为 POST_GAME
- **AND** 插入一条系统聊天说明恢复失败原因
- **AND** 不写入 game_results（不计战绩，FR-RESULT-002）

#### Scenario: 跨 deadline 重启后计时器只补执行一次

- **WHEN** 服务关闭期间有一个以上计时器到期
- **AND** 服务重启后执行恢复
- **THEN** 每个到期计时器只被补执行一次（status 从 pending → consumed）
- **AND** 补执行顺序与 deadlineAt 一致
- **AND** 补执行产生的新计时器（如 vote_result → 下一轮 speaking 计时器）若也已到期则继续补执行

### Requirement: 崩溃注入测试覆盖

系统 SHALL 通过自动化崩溃注入测试验证 AC-15（进程崩溃后已确认操作不丢失）与 AC-16（过期计时器补执行顺序正确）。

#### Scenario: AC-15 各阶段崩溃恢复

- **WHEN** 在 word_reveal / speaking / voting / vote_result 阶段分别强制关闭数据库
- **AND** 重新打开同一数据库文件并执行恢复
- **THEN** 已确认的 game_action（confirm_word / finish_speech / cast_vote）全部保留
- **AND** 会话状态、快照、事件流水、rng_state_json 与崩溃前一致
- **AND** 到期计时器被补执行，未到期计时器保持 pending

#### Scenario: AC-16 跨 deadline 重启

- **WHEN** 服务关闭时将某计时器 deadline 改为已过去时间（模拟跨 deadline 停机）
- **AND** 重启并执行恢复
- **THEN** 该计时器被补执行一次且仅一次
- **AND** 补执行后产生的下游计时器若也已到期则按序继续补执行
- **AND** 已 cancelled / consumed 的计时器不被重复触发

## MODIFIED Requirements

### Requirement: 计时器消费状态过滤

`consumeDueTimer` SHALL 同时接受 `ACTIVE` 与 `RECOVERING` 状态的会话，以支持恢复期补执行。其他状态（PREPARING/FINISHED/ABORTED）的会话计时器不被消费。

### Requirement: 恢复期间的游戏动作错误码

`applyGameAction` SHALL 在会话 `status === 'RECOVERING'` 时抛 `RECOVERY_IN_PROGRESS`（而非通用 `ACTION_NOT_ALLOWED`），使客户端能进入 `server_recovering` 连接态并展示"服务端正在恢复对局，请稍候"。

### Requirement: 进度文档同步

`progress.md` SHALL 新增"会话 5：M4 完成"条目，记录：恢复流程实现范围、崩溃注入测试覆盖情况、CI 测试数量、AC-15/16 达成情况、下一步指向 M5。`task_plan.md` 的 Phase 4 SHALL 改为 complete 状态并勾选所有子项。

## REMOVED Requirements

无删除项。
