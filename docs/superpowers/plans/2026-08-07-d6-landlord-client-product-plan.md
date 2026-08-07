# D6 计划：斗地主平台规则集默认化与严格客户端产品闭环

> 批准日期：2026-08-07。用户批准范围：产品闭环；部署目标偏好 Windows + Termux（本阶段不做发布工程）；允许分阶段本地 checkpoint commit，不 push、不 rebase/force/clean。
>
> D6 基线：`396c20d30e99fbe26949a0b436ceed54b1ebfc3d`。G0 核验：工作树干净；D1 双 fixture SHA 与冻结值一致；冻结 9 文件 `frozenAllMatch=true`；LOC 42.07% PASS；D1 compliance PASS。

## 范围与边界

本阶段只做已批准的产品闭环：把已经完成服务端接入与准入登记的 `landlord_platform_v1` 真正接到客户端，并使其成为斗地主新建房默认规则集；保留 legacy 规则集和旧房间兼容路径。

明确不纳入本阶段：

- UNO 仍保持 `blocked_rights`；没有外部权利证据时不修改为 playable，不伪造授权记录。
- 不做 WebRTC/音视频生产接口、数据表或占位代码；媒体能力另行立项。
- 不做 Docker、发布包、备份/恢复自动化、metrics、HTTP 限流或服务端 NFR 压测；这些作为后续 D7 工程加固候选。
- 迁移仍限 v1–v8，不新增 v9；不新增 settings 键；D1 两份 fixture 字节与 SHA-256 不变；冻结 9 文件零改动；不新增 game-id 绕过分支。
- Git 允许分阶段本地 checkpoint commit；不 push 远程、不 rebase/force/clean 他人内容。

## G0：基线与冻结核验

1. 以 D5 最终提交 `396c20d` 为 D6 基线，记录完整 SHA。
2. 保存本计划。
3. 复核工作树、D1 双 fixture SHA、冻结 9 文件哈希、权威 LOC 与 `compliance:d1`。
4. 创建 G0 本地 checkpoint（D6-A）。

## P1：严格客户端视角与规则路由

### P1a：客户端 landlord view parser 与 discriminator 注册

新增 `packages/client/src/game/landlord/types.ts`，沿用 UNO、狼人杀严格解析模式。解析字段与服务端 platform schemas 对齐：

- `gameId:'landlord'`、`rulesetId:'landlord_platform_v1'`、`schemaVersion:1`
- `phase:'bidding'|'playing'|'game_over'`
- `players`、`bottomCards`、`bids`、当前叫分/地主/当前玩家/当前牌型
- `passCount`、`multiplier`、胜方、winnerId、deadlineAt、aborted
- 玩家视角必须携带合法 `me` 与本人手牌；观战视角不得携带 `me`

在 `viewRegistry.ts` 注册 `landlord:landlord_platform_v1:1`，将 landlord 纳入版本化严格失败关闭；legacy landlord 无 engine-2 判别符继续兼容透传。

### P1b：GamePage 路由与默认配置

1. landlord 先走 `parseGameView`；成功后交给现有 `LandlordGamePage`，失败显示统一 fail-closed 状态；legacy 继续透传。
2. 将 landlord 默认规则集切为 `landlord_platform_v1`；保留 legacy 为显式兼容选项。
3. 更新 identity/catalog 断言：默认解析到 platform v1，显式 legacy 仍解析 legacy module，跨游戏误配继续拒绝。
4. 核对持久化 rulesetId，避免旧房间被新默认覆盖。

### P1c：客户端测试

新增 `landlordV1View.test.ts` 并扩展兼容测试：合法 player/spectator、unknown key、错误判别符、非法牌/phase/team、player 缺 me、spectator 带 me、platform strict 路由和 legacy 透传。

P1 门：typecheck、client 定向测试、server identity、shared catalog 与 lint；创建本地 checkpoint B。

## P2：真实斗地主平台牌桌验收

### P2a：确定性服务端/WS/Chromium 驱动

复用 `fullGameDriver`、`seedActiveSession`、`RoomDriver` 和 platform contract：

- 房主 + 2 个规则机器人，明确使用 `landlord_platform_v1`；
- 断言 engine 2、view 1、rulesetId、schemaVersion；
- 覆盖 bidding、地主确定、playing、合法出牌/过牌/超时和 game_over；
- 本人只见自己的手牌，农民不见底牌，地主按规则看到底牌；
- 唯一正式结果、无残留 timer、恢复后 rulesetId 不漂移。

优先用确定性 seed/session 保证稳定，再补首页→默认 platform v1→机器人→开局真实路径。

### P2b：legacy 与旧房间兼容

运行 legacy 回归；增加保存 `landlord_legacy_platform_v1` 的旧房间重连/恢复断言；确认默认切换只影响新房，不重写既有 `game_sessions.ruleset_id`。

P2 门：platform contract、完整局/崩溃矩阵、legacy tests 和 Chromium 牌桌 `--retries=0`；创建本地 checkpoint C。

## P3：产品默认化与文档

1. 升级上架 E2E 的斗地主用例：断言默认 platform v1 并真实开局。
2. 覆盖宽/窄视口、键盘操作、按钮禁用、错误状态和隐私。
3. 更新 D5 后续项：landlord 默认化解除；UNO 与 raw snapshot 风险继续延期。
4. 更新仍描述 legacy 默认的文档；不扩展到发布工程。

## P4：最终质量门

1. `npm run typecheck`
2. `npm run lint`
3. 定向测试与全量 `npm test`
4. `npm run compliance:d1`（构建前后）
5. `node scripts/d4/playable-check.mjs .`
6. 固定 LOC 脚本复核
7. D1 双 fixture SHA 与冻结 9 文件哈希
8. `git diff --check`
9. `npm run build`
10. landlord Playwright `--retries=0`，再跑完整 `npm run test:e2e`
11. 输出 `docs/superpowers/reports/2026-08-07-d6-landlord-client-results.md` 并创建最终本地文档 checkpoint。

## 预期结果

- 新建斗地主房间默认进入 `landlord_platform_v1`，严格客户端视角与 GameModuleV2 身份一致。
- 旧 legacy 房间继续可恢复、可渲染、可操作。
- 斗地主具备严格客户端、真实 WS、真实 Chromium 和隐私验收证据。
- UNO 保持 `blocked_rights`；冻结文件、迁移版本与稳定原语 v1 边界均不变。
