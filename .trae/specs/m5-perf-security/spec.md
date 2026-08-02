# M5 子任务 5.3：性能与安全测试

## Why

M5 发布候选要求在发布前完成性能压测验证 NFR-001~009，并按 §14.1 安全检查清单审计输入校验、CORS、密码哈希、日志脱敏、WS 鉴权（[task_plan.md](../../../task_plan.md) 子任务 5.3）。

本规格记录立项时的缺口。**截至 2026-08-02 的当前状态**：压测脚本、性能冒烟测试和一份 2026-07-29 历史时点安全审计已经存在；冒烟测试已通过受准入测试夹具完成 1 局 4 人 + 2 机器人短时对局，生产 `create_room` 仍严格拒绝未准入游戏。但三局长压测尚未产出报告，脚本也尚未采集要求中的服务端内存增长与 CPU，当前工作树的完整安全复审仍未执行，因此尚未构成完整发布验收证据。

需要在发布前补齐这些验证，并修复当前复审发现的 P0 缺陷。

## What Changes

- **新增** `packages/server/scripts/perf.mjs`：性能压测脚本，模拟 12 人 + 8 机器人三局完整对局
- **新增** `packages/server/tests/perf.smoke.test.ts`：冒烟级性能回归（短时低并发，验证脚本可运行 + 关键路径无内存泄漏）
- **新增** `docs/security-audit.md`：按 §14.1 检查清单逐项审计结果
- **修复** 子任务发现的 P0 缺陷（待审计后回填具体修复项）

## Impact

- **Affected specs**：M5 子任务 5.3
- **Affected code**：
  - 新增：`packages/server/scripts/perf.mjs`、`packages/server/tests/perf.smoke.test.ts`、`docs/security-audit.md`
  - 可能修复：审计发现的 P0 缺陷涉及的代码（依赖审计结果）
- **依赖**：建议在 `m5-settings-finish` 完成后进行，以便测试覆盖最新设置端点；也可并行起，安全审计时一并复核 settings 端点
- **不包含**：真实聚会验收（5.4，需用户参与）

## ADDED Requirements

### Requirement: 性能压测脚本

系统 SHALL 提供自动化压测脚本验证 NFR-001~009。

#### Scenario: 12 人 + 8 机器人三局

- **WHEN** 运行 `node packages/server/scripts/perf.mjs`
- **THEN** 脚本启动服务端、模拟 12 人 + 8 机器人连接三局完整对局，采集延迟、RPS、内存、CPU，输出报告到 stdout 与 `perf-report.json`

#### Scenario: NFR 指标达标

- **WHEN** 压测完成
- **THEN** 关键指标满足：单条消息端到端延迟 p95 < 200ms（NFR-003）、内存增长 < 50MB（NFR-005）、CPU 平均占用 < 50%（NFR-006）

#### Scenario: 冒烟级回归

- **WHEN** 运行 `npm test`
- **THEN** `perf.smoke.test.ts` 跑 1 局短时低并发对局，验证脚本可运行且无内存泄漏（heap snapshot 对比）

### Requirement: 安全审计清单执行

系统 SHALL 按 SPEC §14.1 检查清单逐项审计并记录结果。

#### Scenario: 输入校验

- **WHEN** 审计输入校验
- **THEN** 所有外部输入（WS 消息、HTTP 请求体、环境变量）通过 zod schema 校验；超长/恶意 payload 被拒

#### Scenario: CORS 与 Origin 校验

- **WHEN** 审计 CORS
- **THEN** WS 握手校验 Origin；HTTP 静态资源不开放 CORS；非白名单 Origin 被拒（§9.5）

#### Scenario: 密码哈希

- **WHEN** 审计密码处理
- **THEN** 房间密码使用慢哈希（bcrypt/scrypt/argon2 或等效 PBKDF2）；不在日志/快照/数据库明文存储

#### Scenario: 日志脱敏

- **WHEN** 审计日志
- **THEN** 日志不输出 API 密钥、玩家手牌、身份词；输出结构化 JSON 便于审计

#### Scenario: WS 鉴权

- **WHEN** 审计 WS 鉴权
- **THEN** 每条命令校验 seatId + resumeToken；越权操作返回 FORBIDDEN；踢出会话使用 SESSION_REPLACED 关闭码

#### Scenario: 限流

- **WHEN** 审计限流
- **THEN** 加入/聊天限流生效（M2 已实现）；设置相关 JSON 端点 16 KiB（16 × 1024 bytes）body 上限生效

#### Scenario: 审计记录

- **WHEN** 审计完成
- **THEN** `docs/security-audit.md` 记录每项的检查方法、结果、证据（代码引用）、修复项（如有）

### Requirement: P0 缺陷修复

系统 SHALL 修复本子任务发现的 P0 缺陷。

#### Scenario: P0 全部修复

- **WHEN** 审计完成
- **THEN** 所有标记为 P0 的缺陷已修复，并通过回归测试

## MODIFIED Requirements

### Requirement: M5 子任务 5.3 完成定义

只有三局压测及性能指标验证、当前工作树安全复审、当前 P0 闭环和全量质量门都有可复现证据后，才能在 [task_plan.md](../../../task_plan.md) 中把 5.3 标为完成；现状仍为 `in_progress`。

## REMOVED Requirements

无。
