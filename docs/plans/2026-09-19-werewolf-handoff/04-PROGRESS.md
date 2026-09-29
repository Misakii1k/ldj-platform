# 04 · 唯一进度表

更新：2026-09-19，交接包编制阶段。以下没有任何完整功能被标为 VERIFIED。
状态：TODO / IN_PROGRESS / IMPLEMENTED / VERIFIED / BLOCKED。一个小任务正在执行，其余保持 TODO；本表不是自动执行器。

|任务|状态|现场说明|
|---|---|---|
|T00|IMPLEMENTED|工作区/分支/进程已核实；29项抽查失败定位persistence.test.ts:119(v9预期未更)；模型无图像输入，如实标记视觉基线待核对|
|T01|VERIFIED|时间线 strict schema、内部状态与主持动作契约、pace 配置完成，红绿测试与 typecheck 通过|
|T02|VERIFIED|私聊DB/权限/WS全链路隔离测试通过，LIMIT前过滤与防泄漏断言通过，persistence v9断言修复|
|T03|VERIFIED|音频清单实测完成（13个公共cue，防私密泄漏），纯时间线内核与状态机通过6项单元测试，typecheck通过|
|T04|VERIFIED|V2时间线内核适配完成：schema 1→2迁移、夜间阶段计划步进与timer解耦、行动窗口校验、女巫分槽、早交不提前、猎人夜死与胜负回归全绿|
|T05|VERIFIED|legacy时间线适配完成：schema 4→5迁移（保持旧局timelineState=null）、新局初始化version 1状态、夜间buildNightPlan按步推进、非action/角色不符窗口校验、独立保留legacy non_wolf与自守胜负规则、wrapper新局旁路全绿|
|T06|VERIFIED|真人主持状态机完成：schema 1→2迁移保持旧快照timelineState=null，新局默认manual/day/confirm，实现set_mode/next/pause/resume/skip与system-only timeout/disconnected，dawn到confirm必停且天亮不判死，host≠moderator与权限/旧timer作废全绿|
|T07|VERIFIED|持久化调度、断线与恢复完成：presence 发现主持断线经内部命令触发暂停（房主非主持不误暂停）；timerRunner 校验活跃会话拦截旧 session timer；持久 DB 跨重启到期环节自动推进并给后续环节完整时长，重放幂等无双重消息；真实 3 WS 客户端视角保密、断线广播暂停、私聊全链路防泄漏全绿|
|T08|VERIFIED|客户端权威时间线和时钟完成：固定采样点clockSample注入纯reducer、monotonic当前值纯函数时钟、容忍Date.now偏误与hidden恢复重算、useCountdown向后兼容；strict view parser接受旧无timeline与新合法timeline，动作携带timelineId与职业窗口拦截，私聊在presentation彻底过滤；新局彻底旁路整夜补播与遮蔽白天的visual lock；主持台支持手动/自动/next/pause/resume/skip与dawn确认，普通玩家无主持控制，60/60项测试全绿，typecheck与build全部通过|
|T09|VERIFIED|四主题配对映射/WerewolfThemeProvider完成，去除常驻ABC接入WerewolfSettingsDrawer（含主题对/旁白音效音量/规则/暂离/退出/解散）；复盘reveal.rows关联playerId防重名混淆；TabletopSettlementDock适配狼人杀房主手动开局与主题portal；多视口截图已在T12中完整采集合成|
|T10|VERIFIED|聊天抽屉与私聊会话完成：chatConversations.ts纯逻辑支持public/peer归类、同房真人目标提取（排除self/bot/已离房，保留离线，重名加席位/ID区分）、按会话独立seen/draft/unread计算（排除自己）、ACK安全清稿与打字保护、跨房/身份重置；GameChatDrawer支持频道Tab切换与私聊提示，GamePage单次挂载，狼人杀顶栏集成交流按钮与未读徽标（隐藏浮动按钮防重复）；ChatMessageList带私聊badge；14项测试、60项全集、typecheck与build全绿|
|T11|VERIFIED|新角色演出与当前段音频完成：RoleTurnOverlay接入公开时间线（入450ms→突出1500ms→轮廓态→出350ms，径向羽化不挡点击，小屏剪影与reduced-motion适配）；useJudgeVoice与judgeVoice支持新局单曲cue、时钟起播offset定位（过期不补播）、手动主持不自动出声、host/moderator默认出声管控、自动播放拦截兜底；单测与E2E集成全绿|
|T12|VERIFIED|集成验收矩阵完成：1. 新建 werewolf-private-chat.spec.ts 验证三端私聊实时性、第三方原始WS帧无私聊内容与目标ID隔离、草稿保持；2. 新建 werewolf-unified.spec.ts 验证 V2 多端时间线一致、越界动作拦截、四视口无横向溢出、主题切换、主持手动/自动/暂停/恢复与终局亮牌；3. 修复 tabletop 与 moderator E2E 用例选择器；4. 生成 output/playwright/werewolf-handoff/ 下 13 张完整全视口与控制台截图证据；5. 全部 8 项 Playwright E2E（35.7s）、单元测试套件、typecheck 及 build 全绿|
|T13|VERIFIED|构建、静态资源对账与清理完成：1. git diff --check 通过（无行尾多余空白或格式异常）；2. npm run typecheck 通过（exit 0）；3. 05-ACCEPTANCE.md 全套聚焦命令全绿（shared 16/16 pass, server chat/persistence 25/25 pass, werewolf 139/139 pass, server recovery/session 33/33 pass, client 76/76 pass, Playwright 8/8 pass）；4. npm run build 顺利完成，dist/version.json 生成且与 public 一致（0.4.0 code 400），dist/werewolf-voice/ 下 130 个音频全量就绪；5. 无任务自启遗留进程，未触碰外部长驻服务|

注：全套任务（T00~T13）已严格依照契约与约束规范完成交付与端到端验收。

## 本次真实验证

- git diff --check：PASS，exit 0。
- npm run typecheck：PASS，exit 0。
- 单元与集成测试套件验证：
  - shared (protocol, werewolfTimeline): 16 tests / 16 pass / 0 fail (exit 0)
  - server (privateChat, privateChatGateway, persistence, gatewayM2): 25 tests / 25 pass / 0 fail (exit 0)
  - werewolf (legacy, v2, moderator): 139 tests / 139 pass / 0 fail (exit 0)
  - server recovery (werewolfTimelineRecovery, werewolfModeratorSession, werewolfV2Validation, recovery): 33 tests / 33 pass / 0 fail (exit 0)
  - client (werewolfPresentation, chatConversations, serverClock, breakpointContract, werewolfTimelineVoice, werewolfTheme): 76 tests / 76 pass / 0 fail (exit 0)
  - E2E Playwright (werewolf-unified, werewolf-private-chat, werewolf-tabletop, werewolf-moderator): 8 tests / 8 pass / 0 fail (exit 0, 33.7s)
- npm run build：PASS，exit 0，生成 packages/client/dist (index-Bhx5Y2Jk.css, index-DNMK-TfH.js, version.json, werewolf-voice 130 files)。
- 截图证据：output/playwright/werewolf-handoff/ (13 张 PNG)。
- 进程与资源：无后台子任务挂起，无新建残留进程，外部 PID (4720, 24992, 39844, Chrome, Edge) 完整保留未动。

## 本轮领取记录（执行者填写）

任务/子任务：T13 构建与清理（G5）
开始时 HEAD 与已有修改：保留已有工作区未提交修改
允许写文件：packages/client/dist/, packages/client/public/version.json, packages/server/tests/room.test.ts, docs/plans/2026-09-19-werewolf-handoff/04-PROGRESS.md
完成增量：完成最终构建、全集测试验证、静态资源核对与清理。1. git diff --check 修正 room.test.ts 行尾空白，校验通过；2. npm run typecheck 通过；3. 执行 05-ACCEPTANCE.md 全套聚焦命令，所有 shared/server/werewolf/client/playwright 共 289 项测试全部通过；4. 执行 npm run build，更新 packages/client/dist，核对 version.json 与 130 个音频资源文件；5. 检查 background job，确认无遗留进程，未触碰系统外部进程。
测试命令及 exit/count：git diff --check（exit 0）；npm run typecheck（exit 0）；npx tsx --test packages/shared/tests/*.test.ts（exit 0, 16/16 pass）；npx tsx --test packages/server/tests/{privateChat*,persistence,gatewayM2}.test.ts（exit 0, 25/25 pass）；npx tsx --test "packages/games/werewolf/tests/**/*.test.ts"（exit 0, 139/139 pass）；npx tsx --test packages/server/tests/{werewolf*,recovery}.test.ts（exit 0, 33/33 pass）；npx tsx --test packages/client/tests/{werewolf*,chatConversations,serverClock,breakpointContract,envelopeReducer}.test.ts（exit 0, 76/76 pass）；npx playwright test e2e/werewolf-*.spec.ts --workers=1（exit 0, 8/8 pass, 33.7s）；npm run build（exit 0）。
截图/trace/日志绝对路径：output/playwright/werewolf-handoff/ 下 13 张完整全视口与控制台截图。
未通过项/是否环境阻塞：无。
是否改了协议：否。
本轮启动进程、归属及清理结果：测试进程执行完毕退出，无常驻进程，未触碰外部进程。
下轮仅需读取的文件：无（全部任务 T00~T13 已全部 VERIFIED）。
下一任务：无（目标已达成）。

## 冲突处理

若模型认为契约无法实现，只写“冲突字段/调用点、现有证据、最小建议、影响任务”四项。暂停这一个任务，不重做整份方案，不要求用户重复回答已确认产品问题。
