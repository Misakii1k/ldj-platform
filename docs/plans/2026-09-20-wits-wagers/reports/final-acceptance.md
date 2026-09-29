# 一智千金（Wits & Wagers）全量实施与验收终审报告

日期：2026-09-20。工作根目录：`D:\项目`，基线 main。
实施范围：T00 到 T10 全部任务完成。

---

## 1. 实施全景与核心契约

一智千金（`wits-wagers`）已全链路成功接入局域网桌游平台（v0.4.0）：
1. **契约修订 C01（结构性边界守卫）**：
   - 维持平台 11/11 现有游戏的既有架构：客户端零游戏包依赖（`@ldj/game-wits-wagers` 仅导出 `./manifest` 与 `./server`）；
   - 客户端严格视角类型与解析器独立部署于 `packages/client/src/game/wits-wagers/types.ts`；
   - 通过服务端对拍单测与边界扫描脚本（`scripts/verify-wits-wagers-client-boundary.mjs`）确保 wire 形状一致且绝对零泄露。
2. **产品决策 G0（P1–P7 用户基线）**：
   - P1：超时作答自动以 `value: 1` 且 `origin: 'timeout'` 补齐，不计作者奖且不增加答对计数；
   - P2：超时下注保留最后确认投注，未放置不下注；
   - P3：作答支持全员提前翻牌，下注完整走满时长；
   - P4：终局平局先比较总积分，次比较答对获胜猜测次数，仍平局并列冠军；
   - P5：3–7 席位；
   - P6：完全复用平台浅色纸感 `--game-*` 令牌 + `accent=ocean`（`#115665` / `#237c93` / `#d5edf2`），WCAG 对比度满足 >= 4.5:1，规范响应式断点；
   - P7：1..999,999,999,999 安全正整数，初版离线原创题库。

---

## 2. 全量任务交付清单

| 任务号 | 交付物与职责 | 验证状态 | 产出报告 |
|---|---|---|---|
| **T00** | 建立工作区基线，定位存量 38 个 lint 错误与 4 个 werewolf 脚本失败，确定开发基线，视觉契约按 P6 重写 | ✅ 已完成 | `reports/T00-baseline.md` |
| **T01** | 落地契约修订 C01；新增游戏包骨架、manifest、客户端严格视角 parser 及变异测试 | ✅ 已完成 | `reports/T01-package-contract.md` |
| **T02** | 纯函数版图槽位与赔率常量查表（`board.ts`）、单人与整轮账本结算及终局排名（`scoring.ts`）；覆盖 golden-cases 全部 35 组数值黄金用例 | ✅ 已完成 | `reports/T02-rules-engine.md` |
| **T03** | 核心状态机生命周期（`types.ts`, `schemas.ts`, `state.ts`, `invariants.ts`, `reducer.ts`）；SHA-256 轮次防串标签；全员提前翻牌、P1 超时补 1、拒绝场景 X01–X07 与 7 轮虚拟时间推演 | ✅ 已完成 | `reports/T03-state-machine.md` |
| **T04** | 白名单视角投影（`views.ts`），非参赛者 `me:null`，观战者严格无 `me` 属性；客户端 parser 补齐 `revealed`/`history`/`result` 校验并对拍；`GameModuleV2` 包装（`module.ts`） | ✅ 已完成 | `reports/T04-module-and-views.md` |
| **T05** | 共享注册表 `registry.ts`、目录 `catalog.ts`、准入台账 `game-admission.json` 同步登记；会话事务链与真实文件 SQLite 崩溃恢复测试 | ✅ 已完成 | `reports/T05-persistence-and-registry.md` |
| **T06** | 首期 35 道精审正整数事实题入库（`question-bank.zh-CN.ts`），权威公开来源与口径说明，完成独立审核清单 | ✅ 已完成 | `reports/T06-question-bank.md` |
| **T07** | 前端组件库（`GuessPanel`, `WitsWagersTable`, `BetEditor`, `ResultPanel`, `WitsWagersGamePage`, `wits-wagers.css`, `betDraft.ts`）；无非规范断点；Playwright 视觉驱动 V1/V2/V3 生成 4 张截图并通过横向溢出断言 | ✅ 已完成 | `reports/T07-visual-prototype.md` |
| **T08** | 动作控制器 `useWitsWagersController`，`STALE_CLIENT_STATE` 自动重同步，网关集成测试与 Playwright 真实 3 人+观战对局 E2E 闭环 | ✅ 已完成 | `reports/T08-controller-and-privacy.md` |
| **T09** | 边界检查脚本与单测，验证客户端源码零游戏包依赖（C01）且 dist 零题库私密内容泄露；Playwright 页面刷新与掉线重连恢复 E2E 通过 | ✅ 已完成 | `reports/T09-boundary-and-recovery.md` |
| **T10** | 全局 CI 必要门全量运行，存量基线隔离，产物构建同步，无常驻残留进程 | ✅ 已完成 | `reports/final-acceptance.md` |

---

## 3. 全局质量门与基线对比

| 验证项 | 执行命令 | 结果 | 说明 |
|---|---|---|---|
| **类型检查** | `npm run typecheck` | **退出码 0** | 前端与后端所有 TS 文件严格通过，0 错误 |
| **代码风格** | `npm run lint` | **退出码 1** | 全量 38 个错误，**与 T00 初始基线逐项一致**（均为 werewolf 与 model-refinement 在途改动），一智千金新增/修改文件 **0 error, 0 warning** |
| **全量单测** | `npm test` | **退出码 1** | **tsx 段 1469/1469 全部通过**（存量基线 1391，新增 78 tests 全部绿）；**scripts 段 69/73**，失败的 4 项与 T00 基线完全一致（werewolf 稳定基线脱离），一智千金单测零新增回归 |
| **D1 准入** | `node scripts/d1-compliance.mjs .` | **退出码 0** | **D1 compliance: PASS**（台账与 catalog 完全同步） |
| **客户端边界** | `node scripts/verify-wits-wagers-client-boundary.mjs .` | **退出码 0** | **PASS**（零游戏包依赖，零题库内容泄露） |
| **边界测试** | `node --test scripts/tests/wits-wagers-client-boundary.test.mjs` | **退出码 0** | **5/5 tests 全部通过** |
| **E2E 测试** | `npx playwright test e2e/wits-wagers*.spec.ts` | **退出码 0** | **3 passed**（视觉多视口快照、真实开局与流程、页面刷新与断线恢复） |
| **生产构建** | `npm run build` | **退出码 0** | 客户端静态产物 `packages/client/dist` 成功生成并同步 |

---

## 4. 资源与常驻进程核查

- 所有单测与 Playwright 测试均已正常收束退出；
- 无常驻后台进程，无悬挂端口占用，无需执行额外杀进程命令。
- 工作区内无无关文件修改，存量未提交的他人工作完好保留。
