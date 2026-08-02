# M5 性能与安全测试任务列表

> 状态复核：2026-08-02。历史产物“文件已存在”不等于当前验收完成；以下按当前工作树可复现结果标记。

## 任务依赖

- Task 1（性能压测脚本）独立
- Task 2（性能冒烟测试）依赖可建房的受准入测试夹具或等效测试入口
- Task 3（当前安全复审）独立，可与 Task 1 并行
- Task 4（P0 缺陷修复）依赖 Task 3 发现
- Task 5（验证）依赖 Task 1–4

## 任务

- [ ] Task 1: 完成性能压测脚本 `packages/server/scripts/perf.mjs`
  - [x] 文件存在，可启动服务端子进程并轮询 `/health/ready`
  - [x] 已实现 12 路 WebSocket（4 名玩家 + 8 名观战者）并添加 8 个规则机器人、尝试三局的流程
  - [x] 已实现客户端侧 send → ack 延迟、RPS、压测进程 RSS 与 stdout/JSON 报告代码
  - [ ] 在当前 D1 准入状态下成功完成三局；当前无 `playable` 游戏，建房会被拒绝
  - [ ] 补齐服务端进程内存增长与服务端 CPU 采集；当前脚本没有这两项指标，不能声称已验证 NFR-005/NFR-006
  - [ ] 成功运行并产出 `perf-report.json`；2026-08-02 当前工作树未发现报告
  - [ ] 成功运行后确认子进程与端口清理
  - 失败标准至少包括：p95 > 200ms、服务端崩溃、三局未完成；内存/CPU 阈值需在补齐相应采集后启用。

- [x] Task 2: 完成 `packages/server/tests/perf.smoke.test.ts` 冒烟回归
  - [x] 文件存在且根 `npm test` glob 会收录
  - [x] 代码覆盖 4 人 + 2 规则机器人一局及关键阶段自动动作
  - [x] 代码中的堆增长阈值为 `< 10MB`、测试超时为 30 秒
  - [x] 2026-08-02 当前工作树单独运行 1/1 通过（约 8.6 秒）；测试使用受准入夹具，生产 `create_room` 未放宽

- [ ] Task 3: 对当前工作树执行 §14.1 安全复审
  - [x] `docs/security-audit.md` 保存了 2026-07-29 历史时点只读审计及逐项证据
  - [x] 文档已明确历史 1 KiB 上限此后变为当前 16 KiB（16 × 1024 bytes）
  - [ ] 复核后续新增/修改的设置写入、模型目录、连接诊断及安全上游路径，并更新当前结论
  - [ ] 重新确认 WS 输入/鉴权/限流、密码哈希、日志脱敏、SQL 注入、XSS、目录穿越和错误信息泄漏

- [ ] Task 4: 修复当前复审发现的 P0 缺陷
  - 2026-07-29 历史审计当时未发现 P0；当前工作树尚未完整复审，因此不能据此标记当前 P0 修复完成。

- [ ] Task 5: 验证
  - [x] `npm run typecheck`
  - [x] `npm run lint`
  - [x] `npm run test`（包内测试 365/365、D1 扫描器契约测试 4/4）
  - [ ] `node packages/server/scripts/perf.mjs` 三局跑通、指标达标并输出 `perf-report.json`
  - [ ] 当前安全复审章节齐全，每项有结论
  - [ ] 所有当前 P0 缺陷修复并回归通过

## 已验证的专项结果（不等同全量质量门）

- 2026-08-02：`packages/server/tests/gatewaySettings.test.ts` 单独运行 30/30 通过。
- 2026-08-02：`packages/server/tests/settings.test.ts` 单独运行 31/31 通过。
- 2026-08-02：`packages/server/tests/perf.smoke.test.ts` 使用受准入测试夹具单独运行 1/1 通过；生产 `create_room` 仍拒绝未准入游戏。
