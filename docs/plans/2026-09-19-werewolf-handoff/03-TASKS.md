# 狼人杀统一改造 Implementation Plan

> 执行者：逐任务实施；参考本地 executing-plans 技能，但不得因其建议另建干净 worktree 而丢失现有 dirty UI。不要求安装不存在的 superpowers 插件。

**Goal:** 保留最新舞台，完成私聊、配对主题、权威职业时间线与真人主持辅助。
**Architecture:** shared 冻结协议，纯时间线核心与各规则适配分离，前端只消费权威时间线。兼容旧局不切新流程。
**Tech Stack:** TypeScript、Zod、React、CSS、SQLite、WebSocket、node:test/tsx、Playwright。

## 每轮只读一张任务卡

任务卡在 D:/项目/docs/plans/2026-09-19-werewolf-handoff/tasks/。
共同步骤：先写最小失败测试→运行看到预期失败→最小实现→聚焦测试→typecheck→审阅 diff→更新进度。
“未定义函数/缺新字段”是可接受初始红测；环境错误不是覆盖证明。
每任务都写清实测命令退出码。只给已有 dirty 修改中的自身增量，不自动 commit。
UI 每任务完成后做要求的视口检查并 build；最终统一全矩阵。截图看不了必须标未验收。

|任务|内容|依赖|文件|
|---|---|---|---|
|T00|现场/测试/截图固定|无|tasks/T00.md|
|T01|冻结共享协议与迁移接口|T00|tasks/T01.md|
|T02|私聊服务隔离与迁移测试|T01|tasks/T02.md|
|T03|音频实测与纯时间线内核|T01|tasks/T03.md|
|T04|open-kill V2 适配|T03|tasks/T04.md|
|T05|legacy 规则适配|T04|tasks/T05.md|
|T06|真人主持控制状态机|T03|tasks/T06.md|
|T07|恢复/计时/presence 集成|T02,T04,T05,T06|tasks/T07.md|
|T08|时钟与前端时间线消费|T07|tasks/T08.md|
|T09|主题/设置/复盘/底栏|T08|tasks/T09.md|
|T10|公共聊天与私聊抽屉|T02,T09|tasks/T10.md|
|T11|角色动效与当前段音频|T08,T09|tasks/T11.md|
|T12|多端验收与截图签收|T10,T11|tasks/T12.md|
|T13|构建/发布门槛/清理|T12|tasks/T13.md|

默认顺序 T00→T01→T02→T03→T04→T05→T06→T07→T08→T09→T10→T11→T12→T13。
任务内部的 a/b 子步骤也按顺序；不一次读取所有卡片。

## 质量关卡

- G1/T01：协议可编译，字段和权限一致；未过不启动跨层实现。
- G2/T07：两规则、主持、恢复、隐私都通过，前端不得修补后端缺口。
- G3/T09：四主题样张已检查；结构/色彩问题先修，不继续铺开。
- G4/T12：真实 WS/浏览器/视口与音频证据齐全。
- G5/T13：最终构建、产物、无任务残留服务，才声明完成。
