# D3 迁移与兼容门实施计划

**目标：** 仅迁移 `uno_legacy_platform_v1` 与 `undercover_classic_v1` 到版本化兼容契约，并证明规则、视角、快照、恢复、序列、重连、机器人、幂等和完整局回放兼容。

**执行约束：** 逐项 TDD；不创建或切换分支，不暂存、提交、推送、stash、reset 或 clean；保留现有未提交 D2 与狼人杀改动；不修改任何产品准入或权利状态。

## 架构边界

- UNO/卧底通过并行 `GameModuleV2` 路径迁移；斗地主和狼人杀继续使用 legacy `GameModule`。
- D3 在现有 JSON 持久化列中承载版本化信封，不新增数据库 migration。
- 冻结的 inner player/spectator view JSON 保持不变，ruleset、contract 与 view version 放在 `game_state` 外层。
- legacy 恢复分支保留；D3 会话使用严格摘要、schema、不变量、RNG 与相邻迁移校验。
- 不新增 D4 标准视角字段、统一桌面、新规则、第三游戏或新游戏。

## 实施任务

1. 冻结 D1 fixture SHA-256，并记录当前工作树。
2. 新增版本化 `GameModuleV2` 契约、公共/私有事件与 legacy 适配器。
3. 先迁移 `undercover_classic_v1`，复用现有 strict schemas 与 reducer，双跑 D1 oracle。
4. 迁移 `uno_legacy_platform_v1`，新增 strict config/action/state/view schemas 和不变量，显式处理旧 `lastPlayed`。
5. 在 `snapshot_json` / `events_json` 内加入 contract、ruleset、sequence、digest、RNG、effects 与 result 元数据。
6. 增加 V2 启动恢复：摘要和版本校验、相邻迁移、trailing-event 重放、effect/timer 对账、失败关闭。
7. 贯通 direct/timer/bot/recovery 的 `roomSeq`，公共事件广播、私有事件按接收者定向。
8. 给 `game_action` 增加 expectedSeq 检查，保持 requestId 幂等回执优先。
9. 实现小缺口公开事件补发、大缺口或 view 版本变化完整视角恢复，并拒绝旧消息覆盖新状态。
10. 严格解析服务端 envelope、UNO/卧底版本化视角；D1 所有逐步视角必须通过真实客户端 parser。
11. 建立通用契约、恢复和完整局驱动，覆盖进程重启、WebSocket 重连、隐私、exactly-once 与 BotRunner 收束。
12. 运行 typecheck、lint、全量 test、build、构建前后 D1 compliance、fixture hash 与 `git diff --check`，形成结果报告。

## 最终验收

- 两款游戏服务器执行路径均为 V2，ruleset identity 固定。
- D1 fixture 字节和 SHA-256 不变。
- 历史 raw snapshot 显式升级；同版本快照也严格验证。
- trailing event、timer remount、进程重启、重连与乱序消息均确定性通过。
- stale game action、重复 requestId、终局结果 exactly-once 通过。
- player/spectator view 与 public/private event 无泄漏。
- 两款游戏均通过平台 BotRunner 有界完整局。
- 全量质量门通过，catalog、admission、rights 与 `werewolf_legacy_platform_v2` 不变。

D3 完成后只进入 D4 申请与规划阶段，不自动开始 D4 或七款新游戏。
