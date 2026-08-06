# D3 迁移与兼容门实施结果

## 范围

本轮按已批准计划 `docs/superpowers/plans/2026-08-04-d3-migration-compatibility.md` 完成 D3：

- 把 `uno_legacy_platform_v1` 与 `undercover_classic_v1` 迁移到版本化兼容契约 `GameModuleV2`（engine contract v2）。
- 斗地主与狼人杀继续走原 `GameModule` 路径，未迁移。
- 在现有 `snapshot_json` / `events_json` JSON 列内写版本化信封，**未新增数据库 migration**。
- 严格 config/action/state/view 解析、快照摘要、显式迁移、确定性恢复、公共/私有事件分流、`roomSeq` 全链路、`expectedSeq` 并发检查与幂等、有界重连/resync、服务端与客户端严格 envelope/视角解析。
- D1 冻结内部视角 JSON 字节不变；D1 fixture 哈希未变；目录准入与权利状态不变（`internal_prototype` / `blocked_rights` 原样）。

本包**不包含** D4 标准视角字段、统一桌面、UNO 新平台规则、卧底白板/异步裁判、第三游戏验证或任何 `playable`/权利变更。

## 环境

| 项 | 值 |
| --- | --- |
| Node.js | v24.13.1 |
| npm | 11.8.0 |
| TypeScript | 5.9 |
| 工作树 | `main`，全部改动保持未提交（按要求不创建/切换分支、不暂存/提交/推送/stash/reset/clean） |

## 交付物与证据

### Task 0 冻结证据链

- `docs/superpowers/plans/2026-08-04-d3-migration-compatibility.md`（已落盘）。
- UNO/卧底 `baseline.test.ts` 新增 SHA-256 字节门：
  - UNO `e29db1cc2a9ac3e9bf38ea39ce75bcae1aeab66ebd8f491f4cdc8758701da9e6`
  - 卧底 `38b011909f2945140a3007cfefb052cc47dfcbccc270869bdf3ec5897508ae68`
  - 本次运行重算与冻结值一致（见质量门）。

### Task 1–3 契约与迁移

- `packages/shared/src/game/versionedContract.ts`：`GameModuleV2`、`PrivateGameEvent`、`normalizeLegacyReduceResult`、`isVersionedGameModule`、`assertPrivateGameEvents`（非空、去重、接收者属于参局玩家）。
- 注册表改为 `ErasedGameModule | AnyGameModuleV2` 联合；`undercoverVersionedModule` / `unoVersionedModule` 注册，斗地主/狼人杀保持 legacy。
- 卧底 V2：`undercover_classic_v1 / contract 2 / view 1`，strict 视角 schema、不变量、D1 全动作 dual-run。
- UNO V2：`uno_legacy_platform_v1 / contract 2 / view 1`，strict config/action/state/view schema，拒绝未知键/非法 `declaredColor`/缺失 `cardId`，旧 raw state 缺 `lastPlayed` 走显式迁移，108 张唯一性等不变量，D1 全动作 dual-run。

### Task 4 快照/事件信封

- `stateDigest.ts`：canonical JSON（键排序、拒绝 NaN/undefined/循环引用）SHA-256。
- `snapshotEnvelope.ts`：`engineContractVersion/gameId/rulesetId/schemaVersion/createdAtSequence/stateDigest/rngState/state`，严格校验身份、摘要、序号、RNG cursor。
- `eventEnvelope.ts`：public/private events、effects、effect receipts、resultCandidate、RNG before/after、next-state digest、`roomSeq`。
- `applySessionAction` 在单事务内完成解信封→parse/invariants→reduce→事件信封→effects→新快照；V2 每次 accepted action 校验信封 cursor 与 `rng_state_json` 一致。

### Task 5 启动恢复、重放与 effect 校验

- `versionedRecovery.ts`：`replayVersionedTrailingEvents` 对落后于 `last_seq` 的快照确定性重放，逐事件比较 public/private events、effects、result、RNG before/after、digest，并幂等对账 timer/chat receipts（缺失重建、冲突失败关闭、不覆盖无法证明一致的记录）。
- `recovery.ts` 增加 V2 分派：快照序号 > `last_seq` 失败关闭；V2 恢复期补执行计时器占用真实下一 `roomSeq` 并同步推进 `rooms.seq`；legacy 狼人 v1/v2/v3→v4 迁移路径语义未变。
- 新增 4 项 D3 恢复测试（trailing 重放重建缺失 receipt、摘要/对账不一致失败关闭、timer receipt 冲突失败关闭、快照序号超前失败关闭）。

### Task 6 roomSeq 与公共/私有事件分流

- `GameActionOutcome` 携带已提交 `roomSeq`、public/private events、`rulesetId`/`viewVersion`；direct/start/timer/bot 全链路统一经 `WsGateway.applyGameOutcome`。
- `game_state`/`game_event` 广播携带 envelope `roomSeq`；`game_event` 附带 `moduleId/rulesetId/viewVersion`。
- 私有事件按 `recipients` 定向发送，`recipients` 永不进入 wire；观战者与非目标玩家只收公开事件。
- 恢复期补执行写入真实 `roomSeq`（此前为 0）。

### Task 7 并发检查与幂等

- `game_action.expectedSeq` 在事务 handler 内与 `tx.roomSeq - 1` 比较，stale 返回 `STALE_CLIENT_STATE` + `currentSeq`，零写入（state/events/timers/rooms.seq 不变）。
- executor 的 receipt 查询先于 stale 检查：同 `requestId` 重试（含过期 expectedSeq）返回首次 ACK。
- `command_receipts` 落盘前做安全投影：`publicEvents/privateEvents/events/systemChats` 清空，秘密事件不再进入幂等回执。
- 覆盖：立即重试、进程重启后重试、UNO 终局 `play_card` 重试只保留一条 result/事件/状态。

### Task 8 有界重连/resync

- `resume_room`/`resync` 可选携带 `{sessionId, viewVersion}`（协议向后兼容）。
- 缺口阈值 50：小缺口 + 视角身份一致 → 按序补发公开事件（不重放私有事件）+ 最新兼容视角；大缺口/会话变化/视角版本变化/历史不连续 → 只回完整最新视角。
- 所有恢复包以权威 `room_snapshot` + 带 `roomSeq` 的 `game_state` 建立一致基线。
- 客户端拒绝旧 `room_snapshot`/`game_state`，权威跳号快照直接建立基线不再重复 resync。
- 真实 WS 覆盖：玩家小缺口、观战者、视角版本不匹配、>50 大缺口。

### Task 9 严格 envelope 与版本化视角

- 客户端 `parseServerEnvelope`：协议版本/消息类型/requestId/roomSeq/serverNow 严格校验，替代 `JSON.parse as ServerEnvelope`。
- `game_state` 外层判别符：`moduleId + rulesetId + engineContractVersion + viewVersion + role`（已由服务端下发）。
- `viewRegistry.ts` 按判别符映射严格解析器；未知版本/ruleset 失败关闭；legacy 斗地主/狼人杀保持兼容透传。
- UNO 客户端严格 parser（精确字段、卡牌/颜色/角色形状、`me` 语义）；卧底 parser 收紧（精确键、观战不得携带 `me`、未知键拒绝、保留隐藏 `null`）。
- 未通过运行时验证的视角触发 resync 且不覆盖旧视角。

### Task 10 契约、隐私、恢复与机器人验收矩阵

- `packages/shared/tests/helpers/versionedGameContract.ts`：通用 identity/初始/纯函数断言，UNO/卧底 contract 测试复用。
- `packages/server/tests/helpers/fullGameDriver.ts` + `fullGameMatrix.test.ts`：
  - UNO 与卧底纯规则机器人完整局收束：结果恰写一次、无残留 pending 计时器。
  - 两款游戏每个 accepted 动作后“文件 SQLite 关闭→重开→启动恢复”，恢复结果与不中断 oracle 逐字段比较一致并继续打完。
  - 最大步数上限 + 虚拟时间推进，卡死即失败。

## 质量门

| 门 | 结果 |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS，tsx 部分 463/463 + mjs 部分 4/4 = 467/467 |
| `npm run compliance:d1`（build 前） | PASS |
| `npm run build` | PASS（vite 7.3.6，1897 modules） |
| `npm run compliance:d1`（build 后） | PASS |
| `git diff --check` | PASS（无空白错误） |

### 冻结哈希

- UNO fixture SHA-256：`e29db1cc2a9ac3e9bf38ea39ce75bcae1aeab66ebd8f491f4cdc8758701da9e6`（与冻结值一致）
- 卧底 fixture SHA-256：`38b011909f2945140a3007cfefb052cc47dfcbccc270869bdf3ec5897508ae68`（与冻结值一致）

### 审计

- 无 `package.json`/`package-lock.json` 变更（未新增依赖）。
- 无 `migrations.ts`/migrator 变更（未新增数据库 migration）。
- 目录准入与权利状态不变：无任何游戏 `playable`；`internal_prototype`/`blocked_rights` 原样。
- `werewolf_legacy_platform_v2` 本包未改（狼人 dirty 项全部来自先前已批准的 open-kill/月相桌工作）。
- 本包未引入 D4 UI/规则文件；客户端新增为解析基础设施（`undercover/types.ts`、`uno/types.ts`、`viewRegistry.ts`、`envelopeReducer` 严格解析）。

## 明确延期项（不属于 D3）

- D4 标准视角字段、统一桌面、视觉重做（未来 UI 工作统一走 `oil-frontend`）。
- `uno_platform_house_v1`、卧底白板模式、异步裁判。
- 斗地主/狼人杀迁移到 V2。
- 第三游戏验证、模块生成器、完整开发工具链。
- 任何 `playable`、权利审批或发布准入变更。

D3 通过后仅进入“申请并规划 D4”状态；未自动开始新 UNO 规则、卧底白板/异步裁判、统一桌面、第三游戏或七款新游戏。
