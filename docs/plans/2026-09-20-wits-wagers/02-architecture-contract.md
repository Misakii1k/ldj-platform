# 架构与冻结契约草案

> P1–P7 仍须 G0 确认；本文件是在这些默认值下的精确设计，而非已实施能力。

## 1. ADR：用已有内核，不另造平台

```text
现有目录/房间设置
  → GameModuleV2 (配置/动作解析 → 纯 reducer → 白名单视角)
  → 现有串行命令事务、snapshot + events + timers + result
  → 现有 WebSocket game_state / game_action
  → 严格 parseGameView → WitsWagersGamePage
```

- `gameId = wits-wagers`；`rulesetId = wits_wagers_platform_v1`；`stateSchemaVersion=1`；`viewVersion=1`；`engineContractVersion=2`；包 `@ldj/game-wits-wagers`。
- 不修改 GameModuleV2 契约；不用新 socket 通道/数据库表/鉴权；不增加 React 状态管理库、3D库、动画库。
- 不声明可选 tabletopProjection。首版专用 React 页面直接接严格视角；若未来接标准桌面投影，必须单独做无泄露证明。
- `botSupport:'none'`；不伪装机器人能力。若未来加规则机器人，单独任务，只读 PlayerView，绝不能读取答案后加随机偏差假装估算。
- 所有纯函数只用 ctx.now / ctx.random，禁止 Date.now/Math.random/IO/全局可变对象；状态必须 JSON 可序列化。

## 2. 已核对的现有落点（改动前需复核漂移）

| 现有路径（根目录 D:\项目） | 符号/作用 | 改动方式 |
|---|---|---|
| `packages/shared/src/game/versionedContract.ts` | GameModuleV2 / VersionedReduceResult | 只读遵循，返回 nextState/publicEvents/privateEvents/effects/resultCandidate |
| `packages/shared/src/game/contract.ts` | Actor/GameContext/GameEffect | 只读遵循；effect仅 schedule_timer/cancel_timer/system_message |
| `packages/games/durian/server/module.ts` | durianModule | 参考V2包装，不复制它的规则或宽松parseState |
| `packages/server/src/core/game/registry.ts` | MODULES/getSessionGameModule | 注册一个模块；历史会话用持久化 ruleset，不猜当前默认 |
| `packages/shared/src/game/catalog.ts` | GAME_CATALOG/defaultSetup | 单个条目，mint/board，默认无机器人，按阶段标成熟度 |
| `packages/server/src/core/game/session.ts` | createInitialState后立即 system/admin begin | 新模块必须接受 `{type:'begin'}`；首个timer由begin的effect产生 |
| `packages/server/src/core/game/timerRunner.ts` | consumeDueTimer/TimerRunner | 复用，勿开私有setTimeout驱动游戏 |
| `packages/server/src/core/game/views.ts` | buildGameStatePayload | 复用角色定向投影，不修改广播机制 |
| `packages/client/src/game/viewRegistry.ts` | REGISTRY/VERSIONED_MODULE_IDS | **两个**位置都注册；未知版本或缺版本失败关闭 |
| `packages/client/src/game/GamePage.tsx` | lazyWithRetry/switch | 新增懒加载和case；沿用已有沉浸清理 |
| `packages/client/src/game/useScopedAction.ts` | act返回boolean并把错误转为文案 | 只参考busy模式；本游戏controller直接使用useConnection.send捕获ServerError.payload.code以区分STALE_CLIENT_STATE；不修改共享hook |
| `packages/client/src/game/useGameAction.ts` | act返回void | 不可把此返回值当成功标志 |
| `packages/client/src/shared-ui/serverClock.ts` | calculateRemainingSeconds | 使用连接层的服务端采样；非仅本机Date.now |
| `packages/client/src/shared-ui/GameSetupPanel.tsx` | 通用设置 | 由catalog两项答题/下注时长配置渲染，优先不改RoomPage |
| `e2e/helpers/serverEnv.ts` | seedBrowserSession/skipPcHostConsole | 测试需跳过内嵌主机控制台，避免假失败 |
| `scripts/build-server-bundle.mjs` | esbuild内嵌服务器 | Android新题库必须随server bundle包含，不能只更新client dist |

补充准入落点：`D:\项目\compliance\d1\game-admission.json`必须与catalog数量/状态对应（scripts/d1-compliance.mjs会比对）。新增台账可标待审核/internal_prototype；playable必须有实际负责人提供的完整证据，严禁复制别的游戏的approved/approver/recordId来凑绿。源码中的规则可参考不等于商标、美术、题卡自动获授权；本计划不作法律结论。

### 契约修订 C01（2026-09-20，T01，用户确认）：包结构改为「方案 A：按平台现状」

**原文（已作废）**：新包用 shared/manifest.ts、shared/contract.ts、shared/parseView.ts；包 exports 仅 `./manifest`、`./shared`、`./server`；浏览器只导入 `./shared`；`packages/client/package.json` 添加该 workspace 包依赖。

**作废原因（T01 只读勘察，11/11 现有游戏无一例外）**：

- 所有游戏包 exports 只有 `./manifest` 与 `./server`；`shared/` 下只有 `manifest.ts`。
- `grep "@ldj/game-" packages/client/src` 为空 —— **客户端从不导入任何游戏包**；`packages/client/package.json` 只依赖 `@ldj/shared`；client tsconfig `paths` 只映射 `@ldj/shared` 与 `@/*`，解析不到游戏包。
- 客户端严格视角 parser 一律住在 `packages/client/src/game/<id>/types.ts`，手写结构类型，零 import。
- 实测当前 `packages/client/dist` 不含任何游戏包/服务端模块，边界干净。

原方案会把「客户端零游戏包依赖」这条**结构性**边界降级为「依赖但只准某个子路径」的**约定性**边界，而 T09 专设了一道构建边界门来守这个方向。

**现行约定**：

- 包 exports **仅** `./manifest`、`./server`。`shared/` 下**仅** `manifest.ts`。
- 客户端严格视角类型与 parser 写在 `packages/client/src/game/wits-wagers/types.ts`，**不新增任何 client→游戏包依赖**，`packages/client/package.json` 与 client tsconfig **不改**。
- 服务端/客户端视角形状一致性由**对拍测试**保证（照 `packages/client/tests/gameViewCompatibility.test.ts` 的做法：把服务端 wire 形状喂进真实客户端 parser，合法必过，未知键/错角色/错版本必须失败关闭）。已知代价是视角类型结构重复，接受并用测试覆盖。
- `packages/server/package.json` 添加 `@ldj/game-wits-wagers` 依赖；`tsconfig.server.json` 添加 `@ldj/game-wits-wagers/server` 路径映射。这两项不变。

受影响任务：T01（本次）、T04（views 输出形状需与 client parser 对拍）、T07（parser 已在 client 侧，无需跨包导入）、T09（边界脚本继续可断言 client 侧零游戏包依赖，防线不降级）。

---

server/index.ts导出模块，server/questions.ts静态导入server/question-bank.zh-CN.ts中的只读数组（不改全局resolveJsonModule，不用运行时文件路径读取）。
禁止根barrel顺带导出题库/State。客户端 parser 使用轻量类型守卫，不从server导入zod schema。服务端动作/状态配置可用项目已有zod。
`packages/server/package.json` 添加server包依赖；根 `npm install` 只更新该包workspace链接/lock，不顺带升级其他依赖。
`D:\项目\tsconfig.server.json` 增加新包server路径映射，与现有路径风格一致；共享类型通过包exports，严禁拿 `as any` 掩盖解析问题。

## 3. 权威状态与视角字段

命名以以下为准；实现可拆为discriminated union，不能增添未登记的私密字段到public。

```ts
type Phase = 'created' | 'answering' | 'arranging' | 'betting' | 'settlement' | 'game_over';
type ChipId = 'A' | 'B';
type TargetId = 'smaller' | `g:${number}`;
type Slot = 'L3'|'L2'|'L1'|'C'|'R1'|'R2'|'R3';
interface ChipBet { chipId: ChipId; targetId: TargetId | null; extraStake: number }
// 精确两项：A一次，B一次；schema拒绝重复、缺项或额外项。
type BetPair = [ChipBet, ChipBet];
interface Guess { value: number; origin: 'submitted' | 'timeout' }
interface Question {
  id: string; prompt: string; unit: string; answer: number;
  sourceUrl: string; sourceNote: string; asOf: string;
  explanation: string; reviewed: boolean;
}
interface BoardTarget { id: TargetId; value: number | null; slot: Slot | 'SMALLER';
  odds: number; authors: string[]; timeoutAuthors: string[] }
interface PlayerRoundLedger { playerId: string; scoreBefore: number; reserved: number;
  winProfit: number; loss: number; authorBonus: number; scoreAfter: number }
interface RoundResult { round: number; question: Question; board: BoardTarget[];
  bets: Record<string, BetPair>; winningTargetId: TargetId;
  awardedAuthors: string[]; ledger: PlayerRoundLedger[] }
interface FinalResult { rankings: {playerId:string;score:number;winningGuesses:number;rank:number}[];
  winners: string[]; roundsPlayed: 7 }
```

服务端 State 最小字段：
- schemaVersion、rulesetId、config（answerSeconds/betSeconds）、phase、round(0..7)、phaseEpoch、roundToken、deadlineAt。
- players: string[]（开局顺序固定，字段名必须为players；内核session.ts与versionedRecovery.ts据此识别私有事件接收者，不另存playerIds镜像）、forfeitedIds（系统退席）、scores、winningGuesses。
- questionPlan：开局从**审核题库**确定的7题完整快照（含来源和答案），断线或更新题库不换题；bankVersion仅服务端保存。
- guesses（初始所有人为null）、guessRevisions、bets（初始A/B均null/0）、betRevisions。
- board（answering为空；从arranging固定到settlement结束），history（已结算RoundResult，最多7），result（仅game_over非null）。
- roundToken：服务端纯函数以域标识、ctx.now、round、ctx.random的4个抽样值计算SHA-256摘要作为轮次标签；禁止把原始PRNG输出直接下发。哈希用node:crypto的createHash（无IO、无系统随机）。开始下一轮重建，恢复保持原值。该标签只防旧动作串轮，不是认证令牌，也不声称将现有非密码学洗牌升级为密码学安全。

PublicView（Player/Spectator共有的白名单）：
- gameId/rulesetId/viewVersion/phase/round/totalRounds=7/phaseEpoch/roundToken/deadlineAt。
- question: `{prompt, unit}`或created时null；不含id/答案/来源，防止预先查题库和来源反查。
- players: `{playerId, score, winningGuesses, hasSubmitted, forfeited}[]`；昵称用现有房间成员映射，不在本模块引入用户资料副本。
- board：仅arranging及其后；包含公开所有猜测和作者。
- publicBets：从betting起可见所有已接受的投注，之前为空；照实体公开下注，不偷偷改为盲押。
- revealed：settlement/game_over时当前RoundResult，否则null。history为已结算历史（合法已公开）。
- result：game_over时FinalResult，否则null。

settlement/game_over：me.reserved=0、me.available=当前score；acceptedBets仍可显示本轮历史，但不再冻结资金。created/answering/arranging也没有预留；仅betting计算reserved与available。避免输光后展示负的可用余额。

PlayerView = PublicView + `me:{playerId, submittedGuess:Guess|null, guessRevision, acceptedBets:BetPair, betRevision, reserved, available, canGuess, canBet}|null`。
SpectatorView = PublicView + `me:null`。非参赛playerId调用getPlayerView同样返回me:null，不能抛出私密State。
created到answering阶段 `board=[]`、`publicBets={}`，除了本人submittedGuess任何地方都没有其他人的未公开值。
始终**从白名单重建视角**；禁止 `{...state}` 后delete字段。parseState也必须完整校验，不用structuredClone(input) as State代替。

补充精确定义：created时round=0、phaseEpoch=0、roundToken空串、deadlineAt=null、board/history空、guess/bet revision为0；首次begin生成第1轮token。每次开始新题清空猜测和投注、个人revision归0、phaseEpoch全局递增；UI通过新roundToken清旧草稿。BetPair按A后B规范顺序保存，拒绝逆序，避免同义状态；hasSubmitted只表示真人已提交，timeout补答不算已提交。退席者既有分数和获胜记录仍参与最终榜单，不额外没收分数。

Question/State定义位于server/types.ts；共享contract仅公开题面、揭晓后的已公开题目信息和视角类型。共享类型不从server目录导入，即使只是import type也不制造跨边界依赖。RoundResult中的question是已公开快照，不含未揭晓题或bankVersion。

## 4. 动作：严格解析，不相信客户端身份、赔率、余额或倒计时

动作直接作为现有 game_action payload，**不增加另一层action包装**。

```ts
type PlayerAction =
 | {type:'submit_guess'; roundToken:string; expectedRevision:number; value:number}
 | {type:'set_bets'; roundToken:string; expectedRevision:number; chips:BetPair};
type SystemAction =
 | {type:'begin'}
 | {type:'phase_timeout'; roundToken:string; phaseEpoch:number; phase:Phase}
 | {type:'player_forfeited'; playerIds:string[]};
```

身份只来自 Actor.playerId，无需客户端重复传playerId。schema strict拒绝多余字段，特别是score/odds/answer/deadlineAt。
- submit_guess：仅answering且 `ctx.now < deadlineAt`，未退席的参赛者；roundToken匹配；expectedRevision等于自己的当前guessRevision。成功替换猜测，revision+1。所有参赛席位都提交后可提前转arranging（依G0 P3）。
- set_bets：仅betting且 `ctx.now < deadlineAt`；相同身份/roundToken校验；自己的betRevision匹配。一次原子替换两枚筹码；校验 targetId在board中，extraStake非负安全整数且总额<=score。一个请求非法则两枚都不改，不逐枚应用。
- 模块的expectedRevision是个人版本，不随他人行动变化；但现有WS网关还有envelope.expectedSeq全房间校验，其他玩家行动确实会使并发请求返回STALE_CLIENT_STATE。首版保留平台校验、不改网关：本游戏controller对明确的该错误调用resync，等待更新game_state，保留草稿并提示“桌面已更新，请再次保存”；用户再次点击才发送。禁止移除expectedSeq、无界重试或自动改押。多标签还可能先触发平台SESSION_REPLACED；在reducer测试个人revision，在WS测试实际替换/拒绝行为。
- begin：仅system/admin + created。成功进入第1轮answering并排首个timer。重复begin拒绝不改状态；createInitialState不假装返回effects。
- phase_timeout：仅system/timer或system/recovery；token/epoch/phase三者匹配且 `ctx.now>=deadlineAt`。过早/陈旧/重复的timer拒绝或安全no-op，不发奖、不改轮数。
- player_forfeited：仅system/timer或system/recovery，幂等标记，不从players/board删除人。不恢复已取消身份；拒绝其后动作；已接受投注按原样结算，下轮清空。未提交按P1走；不要把断线仍在保留期误当forfeit。
- 无人在线也不能靠客户端推进；现有房主终止/平台中止入口保留。新模块无需新建“自动返还/取消比赛”逻辑，正常有限七轮计时器可结束。

错误返回沿用ok:false/code/message。模块内部可用STALE_ROUND、STALE_REVISION、DEADLINE_PASSED、INVALID_TARGET、INSUFFICIENT_FUNDS定位并测试；已核实session.ts把所有reduce拒绝统一映射成WS的ACTION_NOT_ALLOWED，保留安全message。不得期待客户端收到这些模块内部code。网关层STALE_CLIENT_STATE及RECOVERY_IN_PROGRESS等另行处理，不改全局错误枚举。
错误文案与diagnostics均不能带整个State/标准答案/其他人的猜测。本游戏controller对ACTION_NOT_ALLOWED显示服务端已白名单处理的短message（React文本，不作为HTML）；其他错误沿用describeError。现有describeError优先通用错误码文案，直接使用会把余额不足/旧版本等原因隐藏成“当前阶段不支持”；不要为解决本游戏的问题改动共享函数。

## 5. 阶段表、计时与结算原子性

|阶段|时长/触发|下一步|不可做什么|
|---|---|---|---|
|created|仅内核begin|answering，第1题|不能靠客户端start/本地timer|
|answering|30/60/90秒，或全员提交（P3）|补答未提交、建board → arranging|不公开答案/他人猜测，不接受赌注|
|arranging|3秒|betting，按当前ctx.now开启完整下注时长|不允许动画结束事件控制流程|
|betting|30/60/90秒，始终完整|计算胜位与整个账本，一次性写分数/history → settlement|不全员下注就提前封盘，奖励不能二次分发|
|settlement|8秒|round<7进下一题；第7轮进game_over|不能通过刷新/nextRound再结一次|
|game_over|无timer|resultCandidate交既有内核，FINISHED/POST_GAME|不继续接受游戏动作|

timerId=`ww:<roundToken>:<phaseEpoch>`，schedule action含同样守卫。每次阶段变化cancel旧timer + schedule新timer，deadlineAt=ctx.now+阶段时长。
恢复时保留已存deadline；过期阶段补执行一次。下一阶段从恢复处理时ctx.now给予完整窗口，不将断网几分钟直接跳过全部剩余轮。
结算在betting→settlement同一次reduce中写scores、winningGuesses、history；其他阶段不发奖；`history.length`与round/phase严格一致。异常必须事务回滚，不落半张账本。
进入game_over时返回非null resultCandidate，其他阶段null；最后8秒保证结算可看见。客户端动画从已确认ledger展示，不修改分数，不是权威时序。

## 6. 视角、事件与题库安全

公共事件只保留有界事实：round_started（轮数/公开题面）、guess_submitted（playerId，无value）、board_revealed、bets_changed（已公开投注）、round_settled（当前公开结果）、game_finished。
secret guess值如需事件持久化，使用privateEvents给本人；最小实现可不产生该私密事件，靠既有快照恢复。公共日志不能复制action.value。
题库**只在server/questions.ts静态导入**，不可放client/public、shared、room.config、浏览器localStorage或通用catalog。
questionPlan完整保存在服务端snapshot以保证热更新恢复确定性；有权读取服务器磁盘的人能看到题库，这是信任边界，不宣称抵抗服务器管理员作弊。
配置只接纳rulesetId/answerSeconds/betSeconds；生产API禁止customQuestions/correctAnswer/seed覆盖。测试可对纯createState helper注入题库，不开生产后门。
纯前端fixtures不能含未揭晓真题库答案；测试专用假题不要导入生产客户端入口。

## 7. 有界数据与观战

题面<=240字、单位<=16字、说明<=500字、sourceNote<=200字、URL<=1000字符（仅http/https）、asOf<=32字符、id<=64字符；所有用户字段按文本渲染，不注入HTML。客户端链接仅揭晓后出现。history最多7轮，最大视角序列化字节数以最坏fixture实测并记录，不能无限堆叠公共事件。
配置严格仅rulesetId/answerSeconds/betSeconds；时长默认30，预设30/60/90（依G0）。公开题面不支持实时在线换题/修改答案。
作者authors包含该值全部提交者，timeoutAuthors是其中超时补答者子集；awardedAuthors=获胜值authors排除timeoutAuthors。非参赛观众永远me:null。

## 8. 核心不变量

- 参赛者3..7、唯一且顺序稳定；所有score/winningGuesses/revision安全整数且>=0。
- questionPlan恰好7个不同id、均reviewed，单位/来源完整；恢复使用snapshot题面与答案，不重新查当前文件。
- board排序、去重、赔率精确满足01表；所有作者对应一人一个猜测，timeout作者无奖励。
- 每人恰A/B两枚、null目标对应0加注、reserved<=score（非已结算投注阶段）。settlement中bets是历史投注，可大于已亏损后的score，**不要用下注期余额不变量误杀结算状态**。
- current RoundResult每人scoreBefore + profit - loss + bonus = scoreAfter，历史按轮连续，至多一次。
- 每次有效阶段变化phaseEpoch递增，timer与deadline一致；game_over无deadline、无pending timer。
- result排名按规则，采用竞赛排名1,1,3；相同排名按开局席序展示，不以席序打破并列。G0 P4未批准前相关例子仅为提案。
- snapshotMigrations初版{}，未知schema交内核失败关闭，不“尝试兼容”猜字段。
