# D6 结果：斗地主平台规则集默认化与严格客户端产品闭环

> 完成日期：2026-08-07。对应计划：`docs/superpowers/plans/2026-08-07-d6-landlord-client-product-plan.md`。
> 基线：`396c20d30e99fbe26949a0b436ceed54b1ebfc3d`（D5 最终提交，D6 G0）。

## 1. 目标与边界

D6 只做已批准的产品闭环：把已接入并准入的 `landlord_platform_v1` 接到真实客户端，并成为斗地主新建房默认规则集；保留 `landlord_legacy_platform_v1` 为显式兼容选项；历史会话按持久化 `ruleset_id` 恢复，绝不被新默认覆盖。产出真实 WS + Chromium 产品证据。

未纳入本阶段（保持原样）：UNO 仍 `blocked_rights`；无 WebRTC/媒体、Docker、发布包、metrics、HTTP 限流、NFR 压测；迁移仍止于 v8、无新 settings 键、D1 双 fixture 与冻结 9 文件零改动。

## 2. 交付内容

### 2.1 严格客户端视角与规则路由（P1）

- 新增 `packages/client/src/game/landlord/types.ts`：`landlord_platform_v1` 严格视角解析器，与服务端 platform schemas 逐字段对齐（`gameId/rulesetId/schemaVersion/phase/players/bottomCards/bids/currentBidderId/landlordId/currentPlayerId/currentTrick/passCount/multiplier/winnerTeam/winnerId/deadlineAt/aborted`）。未知键、非法牌/枚举/牌型、玩家缺 `me`、观战携带 `me` 一律失败关闭。卡片解析精确镜像服务端 schema（普通牌可无花色、王不带花色）。
- `packages/client/src/game/viewRegistry.ts` 注册判别符 `landlord:landlord_platform_v1:1`；landlord 保持混合模块语义——platform V2 会话走严格解析，legacy 会话（无 engine-2 判别符）继续兼容透传。
- `GamePage.tsx` 的 landlord 分支先走 `parseGameView`，解析失败显示统一 fail-closed 状态。
- `catalog.ts` 将 landlord 默认规则集切为 `landlord_platform_v1`，legacy 保留为显式选项。
- `registry.ts` 调整 landlord 模块顺序使 `getDefaultRuleset('landlord')` 返回 platform v1；legacy 显式身份仍经 `LEGACY_RULESET_ALIASES` 与持久化 `ruleset_id` 解析。

### 2.2 默认牌桌与 legacy 兼容（P2）

- `e2e/landlord-platform.spec.ts`：真实 WS + Chromium 宽/窄视口验收——
  - 宽视口：浏览器真实叫 3 分成为地主；断言 engine contract 2 / view 1 / `landlord_platform_v1` / schemaVersion 1；农民看不到底牌与其余玩家手牌数组；地主看到 3 张底牌、20 张手牌、单一本人手牌区；键盘聚焦 + Enter + 真实出牌，服务端权威视角确认 20→19。
  - 窄视口：`startGame()` 走真实目录默认值 → 落定 `landlord_platform_v1`，无页面级水平溢出。
- `e2e/launch-playable.spec.ts`：斗地主建房用例断言首页「规则预设」默认 `landlord_platform_v1` 且保留「Legacy 兼容基线」选项。
- `packages/server/tests/sessionIdentity.test.ts`：新增「默认切换不改写显式 legacy 会话身份」断言；`packages/shared/tests/catalog.test.ts` 更新默认与规则集顺序断言。
- `landlordSession.test.ts`：legacy 专项集成测试改为显式选择 `landlord_legacy_platform_v1`，证明默认切换后 legacy 路径不变。

### 2.3 稳定性修复（本阶段收尾）

全套 `--retries=0` 暴露两个既有浏览器链路偶发问题，本阶段一并修复（均不改变 D6 范围语义）：

- **恢复基线兜底**：resume ACK 后 1 秒若房间基线未到（「正在恢复房间…」），或已进入对局但视角帧未到（「对局已开始/正在同步牌局数据…」），主动 `resync` 补一次权威恢复；重发帧携带当前 roomSeq，可自愈陈旧丢弃。定时器随 Provider 卸载清理。
- **E2E 基础设施**：Playwright 改为每次运行强制全新服务与空数据目录（`reuseExistingServer:false`）、`retries:0`（禁止重试掩盖时序问题）；首页完整局去掉与 5 秒自动开局倒计时并发的双 start 竞争、改为纯产品自动开局链；白板用例改为确定性角色选择（从真实初始状态选目标角色，不赌固定座位）并把后台驱动与浏览器动作按阶段握手；undercover 完整局上限提升以容纳真实多轮平票对局。

## 3. P4 全量质量门

| 门 | 结果 |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| TypeScript/Node 主测试 | **759 pass / 0 fail** |
| scripts 测试 | **66 pass / 0 fail** |
| `npm run compliance:d1`（构建前/后） | PASS |
| client production build | PASS（Vite 1911 modules） |
| `node scripts/d4/playable-check.mjs .` | PASS（undercover/landlord/werewolf 全部 playable 声明带完整授权证据；UNO 仍 `blocked_rights`） |
| 权威 LOC 固定脚本 | **PASS，42.07%**（baseline=1500 → target=869，要求 ≥40%） |
| D1 双 fixture SHA-256 | 与冻结值一致（uno `e29db1cc…a9e6`；undercover `38b01190…8ae68`） |
| 冻结 9 文件 | `baselineAllMatch=true`，逐字节匹配 |
| 迁移版本 / settings | 仍止于 v8；无新 settings 键（`core/settings.ts` 未改） |
| `git diff --check` | PASS |
| landlord Playwright `--retries=0` | PASS（宽/窄 2/2） |
| 完整 `npm run test:e2e` `--retries=0` | **16/16 PASS**（多轮复核；见 §4） |
| 完整 `npm run ci`（收尾权威门） | **PASS（exit 0）**：typecheck → lint → 759+66 测试 → compliance:d1 → build → test:e2e 16/16 |

### 3.1 恢复竞态取证与修复

全套无重试连跑中，`smoke`、`undercover-blank` 偶发停留「对局已开始/正在同步牌局数据」（`room IN_GAME` 但 `game===null`）。用浏览器端逐帧探针取证（失败 trace 的 console 面板）：

```
recv welcome      seqState=-  hasRoom=false hasGame=false
recv ack 5        seqState=-  hasRoom=false hasGame=false
recv room_snapshot 5  seqState=5  hasRoom=false hasGame=false
recv game_state 5     seqState=5  hasRoom=false hasGame=false
recv chat_batch       seqState=5  hasRoom=true  hasGame=false   ← game 永久缺失
```

即浏览器恢复进已开局的房间时，`game_state` 视角帧偶发未落入客户端状态，且当时无任何后续广播可补位，页面永久停在同步层。修复为 resume 看门狗在「房间基线缺失」之外再覆盖「`IN_GAME` 但视角缺失」，主动补一次权威恢复；补发帧携带当前 roomSeq，重入即可自愈。修复后多轮全套 `--retries=0` 连续通过（见 §4），且未再出现该停留态。

## 4. 全套 E2E 多轮复核（`--retries=0`）

修复后连跑记录（每轮 16 项全部通过）：

| 轮次 | 结果 | 备注 |
| --- | --- | --- |
| 第 1 轮 | 16/16 | 帧日志取证构建前 |
| 第 2 轮 | 16/16 | 帧日志取证构建前 |
| 第 3 轮 | 16/16 | before/after 帧日志构建 |
| 第 4 轮 | 16/16 | before/after 帧日志构建 |
| 第 5 轮 | 16/16 | before/after 帧日志构建 |
| 第 6 轮 | 16/16 | before/after 帧日志构建 |
| 第 7 轮 | 16/16 | 最终代码（看门狗扩展 + 日志清理） |
| 第 8 轮 | 16/16 | 最终代码 |

诊断代码（`envelopeReducer`/`ConnectionContext` 的临时日志与 `e2e/__diag-*.mts`）已全部移除；`npm run lint`/`typecheck` 通过确认无残留。

## 5. 未纳入项（保持冻结）

- UNO：`blocked_rights`，无外部权利证据不改 playable、不伪造授权记录。
- WebRTC/音视频、Docker、发布包、备份/恢复自动化、metrics、HTTP 限流、服务端 NFR 压测：作为后续 D7 工程加固候选。
- 迁移 v1–v8、settings 键集合、D1 双 fixture、冻结 9 文件：字节与版本边界不变；无新增 game-id 绕过分支。

## 6. 结论

D6 产品闭环达成：新建斗地主房间默认进入 `landlord_platform_v1`，客户端以严格判别符解析渲染；legacy 保留为显式兼容选项且历史会话身份不被改写；斗地主具备严格客户端、真实 WS、真实 Chromium 与隐私验收证据。全量质量门通过，完整浏览器套件在 `--retries=0` 下多轮全绿。
