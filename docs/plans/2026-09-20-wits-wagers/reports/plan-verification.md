# 规划材料验证记录

日期：2026-09-20。范围只限 `D:\项目\docs\plans\2026-09-20-wits-wagers`，非产品测试报告。

## 源码对照中修正的问题

|问题|当前源码证据|规划修正|
|---|---|---|
|状态接收者字段不兼容|session.ts participantIdsFromState / versionedRecovery.ts participantIds只读取players|State用players，不另存playerIds镜像|
|多人同时提交仍会版本冲突|gateway/ws.ts #handleGameAction的expectedSeq比较、ConnectionContext.tsx send带房间版本|controller识别STALE_CLIENT_STATE，同步保留草稿，由用户重交，不改网关|
|错误码被统一映射|session.ts applySessionActionCore将reduce错误映射ACTION_NOT_ALLOWED|内部码只用于规则测试，UI读安全message；不期待WS收到模块内部code|
|准入遗漏|scripts/d1-compliance.mjs比对catalog与game-admission数量/状态，playable要求完整rights|任务白名单补台账；不能模型自签批准|
|原始PRNG抽样下发风险|random.ts为确定性非密码学PRNG|roundToken仅下发摘要，不披露原始抽样；不夸大密码学安全|
|题库导入与运行方式|tsconfig没有resolveJsonModule；server原生Node TS和esbuild载荷|server只读TS数组静态导入；测试JSON由node:fs读取|
|结算投影负可用余额|亏损后score已变，历史投注仍在|settlement预留归0，历史投注不再冻结当前余额|
|提前UI预览不可达|GamePage与viewRegistry需注册后才能渲染|把前端注册移到T07白名单，原型仍不公开；测试fake WS只在测试内|
|只改timer表不能虚拟推进|reducer会校验state.deadlineAt，旧audit只改DB计时行|新游戏测试同时推进ctx.now，不删模块deadline守卫|
|边界单测执行在build前|package.json ci先test再build|区分内存边界规则测试和build之后的实际产物审计|

路径均以 `D:\项目` 为根；这些是当前读取的代码事实，不是对未运行测试结果的推断。

## 规划自检

命令：`py -3.13 D:\项目\docs\plans\2026-09-20-wits-wagers\verify-plan.py`
结果输出保存在同目录 `plan-check-output.txt`。脚本独立算术对照人工填写的expected；不导入/实现产品游戏，不访问网络。

检查：必需文件、README索引、T00–T10唯一标题、关键集成条款；45唯一场景ID中的35数值黄金用例（含赔率、判胜、个人账本、完整回合、排名、七轮）；5组不透明色值的WCAG对比度与积分安全上界。

**边界**：10组拒绝场景只是待实现的规范；七轮计时器、result行数、WS实际保密、浏览器视觉、真实题库、设备和CPU资源表现都没有被此脚本证明。HTML/实际页面尚未开发，不可能做真实视觉验收。

## 本轮未做

未运行npm typecheck/test/ci/build，未创建游戏包，未更新client dist、APK或准入台账，未提交Git，未启动Node/浏览器常驻进程。后续实施需重新记录基线，不得沿用“规划PASS”宣称产品PASS。

## 已执行结果（2026-09-20）

- verify-plan.py：退出码0，216条断言通过；35数值用例、45场景ID及5组色值对比度检查通过。
- 16个标为既有的架构接入文件路径已逐项确认存在。
- 校验器反向测试：在临时副本把S03最终余额改成999、把B04槽位改错，校验器均按对应案例拒绝；正式黄金文件未修改。临时目录由Python上下文在校验后清理。
- golden-cases.json SHA-256：`c6379aa2acf34acece73dd22ecb680ff5f61a1c58dc226ce3cf538bbc57a0a37`。这是本版指纹，未来批准改变规则须由负责人更新而非执行者悄悄重生成。
- `git diff --check -- docs/plans/2026-09-20-wits-wagers`无输出，但整个新目录尚未跟踪，该命令不能证明未跟踪文件没有格式问题；本包另做文件引用/结构/算术校验，不误称完整Git差异审查。
- 当前材料9个入口/数据/脚本文件，加2份报告/输出，共11文件。目录未提交Git，用户既有代码改动保持原状。
