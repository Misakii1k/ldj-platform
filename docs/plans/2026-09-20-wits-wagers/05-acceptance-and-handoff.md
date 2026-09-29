# 验收门与小模型交接

本文件是实施后的验收要求，不是已经通过的测试报告。当前状态见STATUS.md。游戏规则参照01，状态/接口参照02，视觉参照03。

## 1. 阶段放行门

|门|必须给出的证据|不合格时|
|---|---|---|
|G0 产品确认|用户对P1–P7的答复，记录时间/原话，争议条款已更新|只做基线勘察、规划和不依赖争议的测试设计；不进入产品实现|
|G1 规则正确|T01–T04的类型/严格解析/35组黄金计算/10组拒绝场景及七轮模拟通过|不可开始真实联机接入；不能改expected来迁就实现|
|G2 内核安全|真实SQLite timer/effect/snapshot/results、私密视角、重复动作及崩溃恢复通过|只保留internal_prototype|
|G3 视觉确认|T07三张关键画面及手机/横屏/桌面截图经用户或负责人确认|不要自行锁定初稿为已批准基准|
|G4 可玩接入|生产路径建房→七轮→回大厅、多人WS、观战、重连、题库审校及真实准入记录|缺准入不设playable；缺内容不能声称正式可玩|
|G5 发布验收|全局检查、实际构建扫描、性能/生命周期、真机验收记录|按通过程度标M2/M3；未真机不得标M4|

实施过程每次代码改动遵循项目typecheck+相关测试+build要求。不要为了节约token省略验证；减少扫描范围、重复说明和无关重构才是省用量的方式。

## 2. 必测行为矩阵

### 规则与数据

- 1..7个不同值的全部赔率、重复值去重但保留作者、偶数空中间、特殊6倍槽；桌面和手机使用同一server倍率。
- 最接近且不超过、相等、全过高、全过低；30亿例子必须29亿获胜而非32亿。
- 免费筹码不扣分、同槽两枚按两个基础值；额外积分预留不扣账；中奖本金不能二次加到账；多人足额结算、重复作者各得3。
- 下注总额=余额允许，超1拒绝；本轮作者奖励不能拿来提前下注；亏到0下轮仍有A/B。
- 七轮恰好7题、7份结果；F01每人分数序列7/28/91/280/847/2548/7651；最终结果行1、pending timer为0。
- 正整数上下界、12位数字、错误单位、NaN/Infinity/小数、伪造目标/赔率/余额、多余字段；JSON数值1e3解析后等于1000，服务端不能声称拒绝其原始表示。
- 题库id唯一、来源和统计时间明确，≥7条审核题可开局；正式内容量按G0，不承诺随机跨局不重复。

### 时序、权限和并发

- now=deadline-1接受，now=deadline拒绝；不是客户端时间，不允许收到消息时先缓存后越过截止再接受。
- 重复begin、旧token/epoch/phase计时器、提前timer、同一requestId重发均不重复结算。
- 两人持相同expectedSeq同时提交：一人成功、另一人明确STALE_CLIENT_STATE，同步后手动重交；不丢草稿、不显示假成功、不自动加注。
- 同人旧revision拒绝；跨标签依现有SESSION_REPLACED，不能为此绕过单连接身份机制。
- 相同requestId仅重放回执、不再发事件；客户端新requestId的再次提交仍经过revision保护。
- 非参赛者/观战者不可操作，player伪造begin/timeout/forfeit均拒绝；Actor决定身份。
- forfeit不删除既有投注，不重排已固定board；补答行为与G0一致；房主断线无需依赖其推进。
- 本地忙碌仅锁当前提交；已ACK但确认game_state未到时不显示“已保存”；断线/超时结果未知时同步而非自动再押。

### 隐私与恢复

1. 建3个玩家+1观战；p1提交一个唯一哨兵猜测。
2. 收集每个接收者的实际WS帧（game_state/game_event/错误/日志），答题阶段除p1外均不得出现该未公开猜测。测试不只看DOM。
3. 当前标准答案和所有未来题的id/答案/来源不出现在任何揭晓前帧、room config、浏览器storage、client dist模块图或静态资源中。
4. 翻牌后允许猜测公开；结算后允许本题答案/来源公开，但未来题仍保密。之前轮次历史合法，不误报。
5. 保存于server快照的答案不是客户端泄露；服务器管理员属于信任边界，不声称可防其作弊。题面自身可能被玩家识别，隐藏source不等于防搜索。
6. 在answering/arranging/betting/settlement逐阶段保存→关闭临时SQLite→重开→startup recovery；与不中断oracle比较分数、题序、猜测、投注、rngCursor、roundToken、历史。
7. 结算事务前/后各做一次崩溃，结果只能0或1次完整落账，不可半写。过期阶段补执行后给予下一阶段完整时间。
8. 模拟未知schema/非法snapshot，失败关闭并报安全错误，不默默新开一局或重置分数。

### UI、生命周期与性能

按03尺寸矩阵、长昵称/长题面/极端数值/0余额/低高横屏/观战/断线覆盖。
- 用固定fixture比较画面，禁止用新截图自动覆盖失败基准；视觉确认记录附截图绝对路径。
- 交互44px、文字>=4.5:1（大字>=3:1），在计算样式下核验；表格中已算色值不替代实际页面验收。
- 首次进入和恢复不重复领奖音效；动画禁用不影响流程；hidden页面无装饰RAF；退出取消本页订阅/interval/timeout。
- 不设伪精确性能指标。记录实际测试机、浏览器、人数、每阶段WS帧大小和峰值、idle/后台CPU观察；无无界增长/持续装饰轮询。
- 联网需求只为房间连接；出题、判分和播放首版界面不调用远程AI/题库/TTS。离线LAN多人仍可玩。

## 3. 命令与执行顺序

以下是未来实施命令，本次规划不冒充已执行。根目录 `D:\项目`。每条命令单独检查退出码；PowerShell脚本运行外部命令后用`if ($LASTEXITCODE -ne 0) { throw 'failed' }`防止前项失败被后项掩盖。

```powershell
# 每个改动批次：仅在相应测试文件已创建后运行
npm run typecheck
npx tsx --test "packages/games/wits-wagers/tests/*.test.ts"
npx tsx --test packages/client/tests/witsWagersBetDraft.test.ts packages/client/tests/witsWagersView.test.ts packages/client/tests/breakpointContract.test.ts
npx tsx --test packages/server/tests/witsWagersSession.test.ts packages/server/tests/witsWagersRecovery.test.ts packages/server/tests/witsWagersGateway.test.ts
npm run build

# T09：真实构建边界审计（脚本尚待T09实现）
node scripts/verify-wits-wagers-client-boundary.mjs

# E2E：先构建，使用既有独立测试DATA_DIR，不指向data中的用户数据库
npx playwright test e2e/wits-wagers.spec.ts e2e/wits-wagers-recovery.spec.ts e2e/wits-wagers-visual.spec.ts --workers=1

# 最终全局门：npm run ci已串接下列各阶段
npm run ci

# 仅交付Android内嵌主机时另加
node scripts/build-server-bundle.mjs
# 用户确需APK后再跑 npm run build:apk
```

- npm test发生在build之前；边界单测只校验模块图规则，实际扫描必须明确在build后执行。不可检查旧dist而声称新构建安全。
- 自动化E2E helper会清空它自己的临时DATA_DIR。先验证解析后的绝对路径在预期测试目录，禁止临时改成生产data；禁止跨shell拼删除命令。
- 不随意运行playwright install/npm升级。缺依赖时先确认当前worktree依赖；不得在另一工作树安装来掩盖问题。
- 端口3178被占用时先识别，不杀未知进程。自己启动的服务记录PID与命令；结束后仅停止自己的，Start-Process须WindowStyle Hidden。
- 报告“某些既有测试失败”时附基线证据、路径和错误，不能写“全部通过”。

## 4. 可直接复制的首条交接提示词

```text
请接手 D:\项目 的《一智千金》规划，不要立即开发整款游戏。
先读 D:\项目\docs\plans\2026-09-20-wits-wagers\STATUS.md、README.md、01-rules-and-sources.md，然后只执行04-implementation-plan.md中的T00。
当前规则主线已选定，但G0 P1–P7尚未获用户确认。只读核对工作区和基线，列出最关键的产品问题向用户逐项确认；不得替用户填“已批准”。准入审核与规则确认不是同一件事，不可编造rights记录。
保护所有既有未提交修改，不reset/clean/stash、不同步覆盖其他worktree。不跑付费模型调用。
本任务结束给出基线证据、还缺哪些决策和建议的下一张任务卡，更新STATUS，不自动继续T01。
```

## 5. 后续每张任务卡的派发模板

```text
执行任务：T__（只此一张），工作区 D:\项目。
必读：STATUS.md、01规则、04中T__段，以及该任务引用的02/03相关章节。
确认前置门已满足；否则说明缺项，不自行扩大任务。
只改该任务文件白名单，先失败测试后最小实现。冻结规则/接口/黄金expected不能自行改。
若发现契约矛盾、必须跨文件范围重构、未知恢复行为，先提供证据和最小修订建议。连续两轮修复同一失败无进展就停止盲试。
遵循项目typecheck、相关单测、build和移动/桌面视觉验证；不要只跑不相干的绿色测试。
结束输出：改动路径；实际命令/退出码/测试数；验收证据；未完成项；仍存风险；本任务进程清理；下一任务的最小必要上下文。更新STATUS并停止。
```

## 6. 复核提示词与报告模板

```text
只读复核T__，不要重做实现。
对照冻结规则、golden-cases.json、阶段/信息可见性契约以及该任务diff，优先查计分错误、漏发/重发奖励、越权、私密泄露、恢复不确定性和视觉基准偏移。
验证实际命令证据，而不是只信执行者自报。不要复制实现函数来生成expected。发现问题给出文件、位置、复现、正确预期和优先级；没有可证问题时明确验收范围与未测部分。
```

每份 `reports/Txx-<topic>.md`：
- 范围/基线/输入决策；改动文件；未动的边界。
- 测试命令、退出码、数量、日志路径；未执行原因；是否涉及存量失败。
- 对照任务完成标准逐条pass/fail/not-run，不能空泛“功能正常”。
- 截图/网络帧/恢复结果证据（脱敏，不保存用户凭据或未公开真题库）。
- 进程：本任务PID/用途/退出状态；若无就写无。
- 下一任务、冻结接口变化=无或申请编号；需要用户确认的唯一下一问题。

## 7. 省用量而不省质量

- 一个模型会话处理一张卡，最多读STATUS+规则+当前卡相关片段；不要每轮扫描整个仓库或整份旧研究。
- 主模型只用于G0歧义、接口冻结、G1/G2高风险复核及最终效果验收；机械实现用用户选择的小模型。本包不自动选择或切换模型。
- 并行只在T06题库与T07UI等明确不重叠文件时使用；共享注册表、lock、catalog串行，避免合并返工。
- 不用token额度或日历承诺掩盖未知工作量；通过每卡是否一次通过判断是否需要再拆小。
- 第一次小模型UI样稿仍须确认。文字契约只能减小偏差，不能保证无人验收也能得到完全一致的视觉效果。
