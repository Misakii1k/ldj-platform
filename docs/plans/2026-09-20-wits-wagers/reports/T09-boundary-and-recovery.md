# T09 报告：故障、构建与客户端边界门

日期：2026-09-20。工作根：`D:\项目`，分支 main。
前置门：T08 已通过。

---

## 1. 目标与实现概述

根据 02 §2（契约修订 C01）、04 §T09 要求，实现并严格验收客户端边界门、构建产物无泄露防线与恢复机制：
- **客户端零游戏包依赖与防泄露扫描 (`scripts/verify-wits-wagers-client-boundary.mjs`)**：
  - 导出 `checkModuleGraph`，支持对任意依赖图进行违规检测（能够捕获非法服务端依赖 `@ldj/game-wits-wagers/server` 与未公开题库内容 sentinel）；
  - 扫描真实 `packages/client/src`，断言没有任何文件直接导入 `@ldj/game-wits-wagers` 游戏包，守护结构性边界（C01）；
  - 扫描真实构建产物 `packages/client/dist`，对 35 道正整数事实题目的专有特征词（如题库 ID `ww-geo-001`、水利部数据、地理测量等 sentinel）以及 server 路径进行全量扫描，断言 0 命中、0 泄露。
- **边界脚本单测 (`scripts/tests/wits-wagers-client-boundary.test.mjs`)**：
  - 基于内存模块图 fixture 验证合法依赖通过、非法依赖拦截、sentinel 泄露捕获；
  - 验证真实工作区源码与真实 dist 产物均 100% 满足边界。
- **恢复与重连 Playwright E2E (`e2e/wits-wagers-recovery.spec.ts`)**：
  - 验证浏览器刷新（`page.reload`）后，通过 localStorage 中的会话凭据自动执行 `resume_room`，保持当前 `answering` 阶段与已提交的估数（“已提交估数：6,300”）；
  - 模拟对局中玩家掉线后重新接入恢复，最新轮次与状态无缝衔接；
  - 全员答齐后自动由 answering 推进至 arranging 并更新浏览器展示。

---

## 2. 改动路径

**新增**：
- `scripts/verify-wits-wagers-client-boundary.mjs`
- `scripts/tests/wits-wagers-client-boundary.test.mjs`
- `e2e/wits-wagers-recovery.spec.ts`

**修改**：
- `output/wits-wagers-acceptance/` 记录更新。

---

## 3. 命令与测试结果

| 命令 | 退出码 | 结果 |
|---|---|---|
| `node scripts/verify-wits-wagers-client-boundary.mjs .` | **0** | **PASS（零游戏包依赖，零题库泄露）** |
| `node --test scripts/tests/wits-wagers-client-boundary.test.mjs` | **0** | **5 tests 全部通过** |
| `npx playwright test e2e/wits-wagers-recovery.spec.ts` | **0** | **1 passed（刷新与重连恢复通过）** |
| `npx playwright test e2e/wits-wagers*.spec.ts` | **0** | **3 passed（全量 Wits E2E 测试全绿）** |
| `npm run typecheck` | **0** | 通过 |

---

## 4. 遗留与下一任务

- 下一张任务卡：**T10（发布、交接、清理与最终验收）**。
- 无常驻进程，无需清理 PID。
