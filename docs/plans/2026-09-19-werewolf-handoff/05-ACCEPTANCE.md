# 05 · 验收矩阵与可执行命令

从 D:/项目 执行。此文件只在相关关卡读取，勿每轮整包重跑。
测试新文件必须在对应任务建好后再调用；不存在不是“跳过即通过”。命令输出保存日志，聊天回复只尾部计数/错误摘要。

## 聚焦命令

```powershell
npm run typecheck
npx tsx --test packages/shared/tests/protocol.test.ts packages/shared/tests/werewolfTimeline.test.ts
npx tsx --test packages/server/tests/privateChat.test.ts packages/server/tests/privateChatGateway.test.ts packages/server/tests/persistence.test.ts packages/server/tests/gatewayM2.test.ts
npx tsx --test "packages/games/werewolf/tests/*.test.ts" "packages/games/werewolf/tests/v2/*.test.ts" "packages/games/werewolf/tests/moderator/*.test.ts"
npx tsx --test packages/server/tests/werewolfTimelineRecovery.test.ts packages/server/tests/werewolfModeratorSession.test.ts packages/server/tests/werewolfV2Validation.test.ts packages/server/tests/recovery.test.ts
npx tsx --test "packages/client/tests/werewolf*.test.ts" packages/client/tests/chatConversations.test.ts packages/client/tests/serverClock.test.ts packages/client/tests/envelopeReducer.test.ts packages/client/tests/breakpointContract.test.ts
npm run build
npx playwright test e2e/werewolf-unified.spec.ts e2e/werewolf-private-chat.spec.ts e2e/werewolf-tabletop.spec.ts e2e/werewolf-moderator.spec.ts --workers=1
```

- Playwright 当前配置 D:/项目/playwright.config.ts 指向3178，reuseExistingServer=false；启动脚本会清 D:/项目/e2e/.tmp-data。使用前确认该目录只有测试数据、端口不是用户服务，不删除生产 DATA_DIR。
- 当前启动器会继承 process.env，注释“没有LLM变量”不能作为无外部调用证明。确认测试不继承可用LLM密钥/上游配置，不打印密钥；mDNS 可禁用。
- 单元测试使用假的 ctx.now/明确触发 timer，不等现实整夜。浏览器需加速时只在测试专用依赖注入时钟，禁止向生产暴露跳阶段/查身份接口。
- UI任务 build 可能更改 version.json 等，精准审阅构建差异。最终全部源码修复后再最终 build。
- 最终建议 npm run test / npm run lint；若全仓既有失败，给出具体失败与本次触及的关系，不隐藏失败或宣称整个仓库通过。

## 必须逐项断言

|域|证据要求|
|---|---|
|配置时序|两规则×三pace×首/次夜；有无guard/hunter/idiot；死职业仍走同窗口|
|动作校验|错误职业/角色未到/截止边界/旧timelineId/重复槽拒绝；女巫第二合法槽不被误拒|
|固定窗口|提前交完不推进；狼刀窗口末锁定；完整夜末才结算|
|规则保持|open-kill与legacy目标范围差异、药物限制、猎人/白痴/守卫、胜负不变|
|幂等|同request重复、旧timer重放、暂停切换后timer重放都不产生第二副作用|
|恢复|旧快照保动作/计时；新快照保当前环节；停机过期只推进当前，后续完整窗口|
|主持|默认手动，host≠moderator，切模式/暂停/恢复/跳过，天亮等待结果确认|
|主持断线|真实WS断线暂停持久化，重连不自动继续，非主持/伪system被拒|
|隐私|A/B/C三上下文原始WS帧+历史+重连；DM只A/B；公共演出/复盘/bot无DM或目标|
|聊天体验|同名目标正确，独立草稿/未读，ACK不清新输入，断线失败保稿，离房拒绝|
|时钟|无新包继续倒数，本地偏±5分钟，隐藏恢复当前环节，不出现倒计时被冻结|
|音频|当前cue去重、旧加载回调取消、手动/静音/失败不影响流程、旁端默认不出声|
|视觉|四视口×四主题；设置/聊天/复盘/底栏继承；公共角色不关联席位；无横向溢出|
|生命周期|隐藏/退出停止动画音频；测试app/socket/server关闭；无任务遗留CPU进程|

## 截图取样与命名

目录 D:/项目/output/playwright/werewolf-handoff/。
文件名：规则集-主题-场景-宽x高.png，例如 moderator-theatre-night-settings-844x390.png。
至少：
- 每视口四主题基础场景，共16张；同一稳定状态、相同座位数，以 reduced-motion 避免随机帧。
- 每种主题的设置/聊天/复盘/准备底栏；两种手机方向至少各完整检查一轮。
- 最多席位、重名/长名、当前职业轮廓；常规与 reduced-motion。
- 正常动效 enter/focus/idle/exit + day/night 关键帧；不能只测减少动态效果。

对比度使用直接背景/合成背景，不仅检查 token；重要按钮辨识、键盘焦点、Esc、触发器焦点恢复、软键盘遮挡均需检查。
如果没有真实手机或人耳检查，分别标“浏览器移动视口已验”“真机/听觉未验”，不合并为全端通过。

## 最终报告必须包含

需求→任务→测试/截图路径映射；真实总数/失败数；未通过门槛；构建版本/dist时间；所有自有进程清理记录。
运行不了一个门槛不等于实现失败，但绝不允许将其写成已完成验收。
