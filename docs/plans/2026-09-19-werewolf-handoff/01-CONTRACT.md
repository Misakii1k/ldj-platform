# 01 · 固定实现契约

这是目标契约，不是“当前已实现”。未经记录并获确认，不得改变字段含义或流程。实现路径见任务卡。

## A. 分层与唯一事实来源

```text
持久化命令/服务端时钟
  → 纯时间线内核（只知道配置、公开职业、环节与时间）
  → 自动规则适配器 / 真人主持适配器
  → 每人裁剪后的 game_state + 公共 timeline
  → 客户端统一 presentation
  → 主题 / 字幕 / 立绘 / 倒计时 / 本机音频
```

- 自动规则适配器保留原身份分配、目标范围、药物效果、猎人触发、胜负规则；不搬运或重写成第三个引擎。
- 时间线不包含玩家身份、行动目标、刀口、药物或查验结果；角色是否出现只依赖本局初始角色配置，不依赖存活/已行动人数。
- 调度使用现有 schedule_timer/cancel_timer effect、持久化 timer runner 和事务链；禁止在 reducer、WS、浏览器另开权威 setTimeout。
- 公开环节同步不等于向全员广播完整服务端 state。仍分别调用 player/spectator view。
- 私聊单独走聊天存储与投递链，不进入游戏事件、规则状态或公共演出。

## B. 公共时间线（冻结目标）

沿用 D:/项目/packages/shared/src/game/werewolfTimeline.ts 已有字段；T01 收紧校验并定义以下语义。

|字段|语义|
|---|---|
|version|固定 1，为时间线协议版本，非 snapshot schemaVersion|
|id|本 session 内唯一的环节呈现 revision；UI 使用 sessionId + id 为 key|
|day|本局夜次；准备/身份确认为 0，首夜为 1|
|period|day/night，游戏内昼夜，不是操作系统时间|
|role|wolf/witch/seer/guard/hunter/idiot/hunter_idiot 或 null；只有通用职业|
|segment|intro/open/action/close/dawn/day/confirm|
|cue|公开音频白名单中的单个 cue key 或 null；不得包含查验结果/刀口提示|
|label|固定公共字幕，不能混入玩家名字、号位或私密结果|
|startedAt|该 revision 开始的服务端绝对毫秒时间|
|endsAt|自动环节结束时刻；无计时或暂停为 null|
|actionDeadlineAt|仅自动 action 操作窗口的截止；其他为 null|
|mode|auto/manual；自动法官恒 auto|
|paused|主持辅助暂停标记，不可用于绕过权限|

校验：有限、非负安全整数时间；deadline >= startedAt；actionDeadlineAt <= endsAt；manual/paused 无活动截止；所有不认识字段拒绝。
需增加公共 pauseRemainingMs: number | null，持久暂停时表示冻结剩余时长，其他为 null。这是一项本包明确授权的草案扩展，T01 一次同步全部消费者，后续任务不得各自增加字段。

内部字段建议固定为 timelineState（绝不整对象序列化给客户端）：version=1、stepIndex、revision、pausedRemainingMs、activeTimerToken、initialRolePlan、当前公共 timeline。纯内核返回新的状态及调度意图，不读取数据库、全局时间、随机数或音频对象。
环节 id 使用单调持久 revision（如 n1-s3-r7）；同环节暂停/恢复/切模式也递增。刷新/普通 snapshot 不递增。重复 ID 的旧 timeout 必须无效。

## C. 自动法官时间线

按顺序：intro → wolf → witch → seer → 配置中的 guard → 首夜配置中的 hunter/idiot 确认 → 全夜结算 → dawn → 原白天流程。
每个职业 open（可有多个单 cue 子环节）→ action → close。每个子环节都有独立 id。

|职业操作窗口|快|标准|舒缓|
|---|---:|---:|---:|
|狼人|20s|30s|45s|
|女巫/预言家/守卫|12s|20s|30s|
|首夜身份确认停留|3s|3s|3s|

- 首夜只配置猎人/白痴之一：只展示该角色；同时配置才用通用 hunter_idiot 组合图层。不可使用喊出未配置角色的组合语音：没有合适单职业录音则 cue=null、字幕兜底，时长采用该确认环节的固定 3s。不得合成/下载新语音而不申明。
- 先写音频测量清单：资产路径、SHA256、实际 durationMs、公共/私密分类；公用 metadata 放 shared，不让 server import client。音频时长不能用旧注释估值，更不能等客户端 ended 才推进。
- 开场提示“请选择”等属于 open 子环节，完成全部提示后才开始完整操作窗口；action 不再叠加同一开场音频。
- 行动窗口严格为 [startedAt, actionDeadlineAt)，边界时刻拒绝。客户端带当前 timelineId；新流程服务端要求匹配，旧流程保留旧协议。
- 每个狼人每夜一次有效提交；女巫 save 与 poison 是不同决策槽，不能粗暴禁止她第二个合法命令；不改变既有先解药后毒药、是否同晚用双药等规则。
- 全员提前交完不跳过、不缩短窗口；无人存活仍等相同固定窗口。bot 也只能看到/提交当前窗口的合法行动。
- 狼人窗口结束才锁定最终刀口并按各规则集原算法兜底，供女巫私有视图读取；公共视图不含刀口。预言家反馈只在其 player view/private event。
- 超时沿用原规则每个决策槽兜底（不新增随机处决）；所有夜间环节结束后仅结算一次，再让公开死亡信息进入原白天/猎人待处理链。
- 猎人技能/终局等现有结算分支不被新 dawn 生硬覆盖；必须测试夜间死亡猎人与终局，保持原规则顺序。dawn 是表现时间线，不重新实施一次击杀。
- 旧 judgeVoiceWrapper 对 timelineState.version=1 旁路；无 timelineState 的历史对局继续原 wrapper。不得删旧兼容路径。

### 调度与故障

- 入/换环节：先失效旧 token，再创建新 id/token 与 timer effect，状态和 effect 经过现有同一事务提交。
- timer payload 含预期 revision/id，session 由平台调度作用域绑定；不得仅比较 day/phase。
- 处理器验证 system actor、未暂停、当前 id/token、到时；重复/旧 timer 不改 state，不重复副作用。
- reducer 只使用 ctx.now（事务注入），不能 Date.now/crypto.randomUUID，使恢复重放确定。
- 服务阻塞或重启后过期：每次仅推进当前环节；后续窗口从实际处理的 ctx.now 起算完整时长，不串跳完一夜。已有当前环节内动作必须保留。
- 系统时间线日志只记公开环节；私密结果沿用 private view/event，不写到 label/cue。

## D. 真人主持（不是房主管理）

主持人权限只来自 state.moderatorPlayerId；房主身份不能自动获得控场权。解散权限仍按 room.host。
默认 manual，字幕/职业正常同步但无自动播报/推进。手动 open/action/close 均由主持人明确推进；玩家页显示“等待主持人”。

目标命令经现有 game_action 链扩展（字段运行时 strict 校验）：

```ts
{ type: 'moderator_set_mode', mode: 'manual' | 'auto', timelineId: string }
{ type: 'moderator_next', timelineId: string }
{ type: 'moderator_pause', timelineId: string }
{ type: 'moderator_resume', timelineId: string }
{ type: 'moderator_skip', timelineId: string }
// 以下仅 system actor，经 presence/恢复链产生；玩家不能伪造：
{ type: 'moderator_disconnected', moderatorPlayerId: string }
// timeout 使用当前 id/token 的内部命令；具体复用 phase_timeout 的方式在 T01 定型
```

- 原 eliminate_player/revive_player/end_game 保留；只它们确认出局/复活/结局，自动辅助绝不能调用它们。
- manual→auto：当前子环节重新开始其完整固定时长，之前环节不回放；保留所有记录。新 revision 防止旧命令混入。
- auto→manual：立刻失效计时 token，停止播音，保留当前语义环节，不自动前进。
- pause：冻结剩余时长、取消 timer、产生新 revision；resume：只重建剩余时间。已播语音不重播整句，客户端按剩余时间定位，定位失败仅字幕。
- skip 仅 auto 主持人可用，跳当前子环节而非整夜；不产生游戏结果。next 仅 manual 或 dawn确认处可用。
- 每次 dawn 后进入 confirm（day、role=null、deadline=null），不自动决定伤亡/胜负、不自动入下一夜。主持人先用已有管理控件确认结果；明确按钮“确认结果并进入白天”推进到 day；day 的“开始下一夜”才进入下一夜。两处都不是 timer 驱动。
- 自动辅助的 pace 新配置可选 fast/standard/relaxed，缺省 standard；不得擅改人数/配牌配置。
- 主持人断线：在服务端 presence 事务/串行命令链暂停其辅助，持久化；重连不自动恢复。超时与断线竞态按事务顺序裁决。
- 房主转移不转移 moderatorPlayerId。主持人永久离开时明确提示当前辅助无法继续，不随意任命新主持；另行确认主持移交功能才可做。
- 新主持对局首个公开状态为 day/confirm（开始引导），主持点击“开始首夜”。旧主持对局迁移不自动启用新时间线。

## E. 聊天隐私与交付语义

- chat_send = { text, toPlayerId? }；缺省为公共。toPlayerId 必须由服务端校验同房真人成员，禁止 self/bot/已离房/跨房；短暂断线保留成员允许收件。
- 沿用文字长度、限流和请求幂等，不新开绕过 executor 的快速发送通道。
- 实时与历史均满足：公共 OR sender==viewer OR recipient==viewer。viewer=null 是公共视角，绝不代表管理员通看。
- 历史查询过滤必须在 LIMIT 前；>=100 条不属于本人的私聊不应阻断公共补发。分页游标是服务端消息 ID，允许缺号，不等于房间 roomSeq。
- 默认 listChatAfter(..., null viewer) 给 bot 仅公共内容。审计 realtime、resync、resume、系统消息广播、展示屏/公共 presentation、bot prompt、复盘的所有路径。
- 参与私聊的真实成员只有在自己的私有交互视图看到私聊；切“公共大屏”也不能显示该成员自身 DM。旁观者不能被动接收其他人的 DM。针对旁观身份是否能主动 DM，不擅扩展新产品权限：沿用同房真人成员准入，但公共展示模式不呈现私聊。
- 房间内跨局保留消息；离开房间或身份改变清理本地 conversation/draft/seen，避免串房。不把 DM 放 localStorage；本轮不实现持久离线消息草稿。
- 会话 key = public 或对方 playerId；nickname 只显示，重名显示席位/玩家标识辅助区分。不从席位点击发起私聊，保留原选人语义。
- 每会话独立 draft、lastSeenCursor、未读数。仅当前打开且 document 可见的会话标已读；未读不计自己的发言。
- send 成功 ACK 后才清除与该 request 绑定的原稿；等待 ACK 时切换会话或继续输入不能被旧 ACK 清空。断线/拒绝/目标离房保留草稿并显示失败。
- WS 回传消息可以先于 ACK；按 cursor 去重，只以服务端消息作已发送气泡。超时标“未确认”，不能乐观显示成功，重试用同 requestId 避免重复落库。
- 模型看不到的消息不能靠 CSS display:none 隐藏来保密。

## F. 时钟与声音

- 在连接层收到并接受有效 envelope 的时刻固定采样 {serverNow, receivedAtMonotonic}。render 不重置采样；无新包也必须持续倒数。
- adjustedNow = sample.serverNow + performance.now() - sample.receivedAtMonotonic。采样点由连接事件注入 reducer，纯 reducer 不偷读时间。
- useCountdown 保留其他游戏兼容入口，新狼人杀必须传同一份采样；同一屏所有字幕/倒计时/音频位置使用同一 clock。若只修成 useMemo(Date.now)，不能算满足“接收时采样”。
- 拒绝非法/旧连接 epoch 数据，重连采新样本；后台恢复读取当前状态，不回放历史。小幅网络误差允许，但不能伪造精确跨设备 NTP 同步。
- action 显示 ceil(max(0, deadline-adjustedNow)/1000)；open/close/intro/dawn 有 cue 时显示“正在播报”；manual/confirm 无时限显示“等待主持人”；暂停显示“已暂停”及冻结剩余，不能继续倒数。
- 自动法官默认仅当前房主设备出声；主持辅助 auto 默认仅 moderator 设备出声；其他设备可设置主动开启本机。manual 模式不播自动台词，即使本机声音开启。
- narrationEnabled/narrationVolume 与 uiMuted/uiVolume 分离，存本机，不改变房间状态。权限/默认设备变化在下一当前环节应用并停止旧设备音频。
- 音频驱动输入只有当前 timeline + clock + 本机设置；不从 self.role 选择公共演出，也不排整夜队列。
- 新 revision/环节、pause、manual、隐藏、暂离、unmount：暂停并释放旧 audio、取消 retry/RAF/listener。auto-play 被拒显示“启用本机声音”，用户点击恢复当前未过期音频，不补播旧段。
- 当前段重连/恢复音频从 elapsed 位置播放；已过有效 cue 时长则只字幕。文件加载/播放失败不得延长服务端窗口；同环节重复 snapshot 不重播。
- 新动作按 timelineId 与 phase gate 提交；UI 禁用只是可用性，服务端仍强校验。

## G. 快照与同步升级

目标：新局启用；旧局直到结束仍走原机制。不能把所有缺字段 state 填成新流程。

- 旧 legacy snapshot 当前 v4 → 新 v5；open-kill V2 当前 v1 → 新 v2；moderator 当前 v1 → 新 v2。实现时先确认版本仍未被他人占用，若已占用则停在 T01 记录冲突。
- 显式迁移旧快照：保留玩家、动作、随机游标、phase、deadline/token、结果；新增 timelineState=null（legacy policy）。新 createInitialState 创建 version=1 时间线内部状态。
- 新引擎分支只看 timelineState?.version===1，不看 snapshot schemaVersion 或当前时间。一个已迁移旧局的 schemaVersion 虽新，仍走旧逻辑。
- 终局后由房主明确开新局，新局调用新初始化器；不得清空进行中局的动作作为“迁移”。
- 客户端公共 view 的 timeline 允许缺省/null（旧局）或合法 version=1；strict parser 接受两者，不以“解析失败”强制旧局退房。
- 数据库迁移 9 保留历史聊天 recipient NULL。迁移已发布时不可修改其版本含义；本轮先核实执行现场。
- 运行中的客户端/服务端一起发布；这不等于兼容旧前端给新时间线发无 timelineId 动作。新客户端给旧局仍可发旧动作格式。
- 恢复测试必须覆盖旧快照+未触发计时、新环节活跃计时、新主持暂停、重复 timer、命令 receipt 重放；既验证 state digest，也验证不多发副作用。

## H. 必须保留的非目标

不增加实时语音/录音，不重写投票与勝负，不增加新规则集，不给机器人 DM 回复，不在全员准备时自动再开一局，不把 UI 主题写入服务端房间配置。
不以大型状态库/动画库/新框架替换现有 React + CSS + TS；共用 helper 的抽取仅限本轮确实需要的边界。
