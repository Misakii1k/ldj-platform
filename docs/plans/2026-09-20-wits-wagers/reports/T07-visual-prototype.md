# T07 报告：前端组件与固定样例界面

日期：2026-09-20。工作根：`D:\项目`，分支 main。
前置门：T05、T06 已通过。

---

## 1. 目标与实现概述

根据 03-visual-contract.md 与 04 §T07 要求，完成一智千金的前端 UI 组件体系、草稿逻辑、严格断点与固定样例视觉快照：
- **配色与对比度实现（AGENTS.md & G0 P6）**：
  - 严格复用平台浅色纸感 `--game-*` 令牌与 `accent=ocean`（`#237c93` / `#d5edf2` / `#115665`）；
  - 主操作按钮使用 `--game-dark` (`#115665`) 实底 + 白字（对比度 8.26:1）；
  - 正文、倍率、作者均使用 `--game-ink` / `--game-muted`；
  - 特殊槽使用 `--game-coral` 实底 + 白字（5.48:1）；中奖高亮使用 `--game-yellow` + `--game-ink`（9.46:1）；
  - 遵循规范断点集合（380/480/640/768/1024/1280px 宽与 520/620px 高），无非规范断点。
- **组件实现**：
  - `GuessPanel.tsx`：V1 秘密作答面板，输入正整数，全员提交前允许修改，带有数值范围与非法输入校验；
  - `WitsWagersTable.tsx`：V2 版图槽位（含 SMALLER 特殊槽与 1..7 个数值槽、赔率显示、作者标记、筹码 A/B 放置指示）；
  - `BetEditor.tsx`：V2 底部投注编辑器（积分余额、已预留、可用分计算、筹码 A/B 切换、步进器与全押可用快捷操作、预计收益即时提示）；
  - `ResultPanel.tsx`：V3 结算与终局面板（单轮答案/出处揭晓、个人增减项账本明细、全员结算表与对局终局排行榜）；
  - `WitsWagersGamePage.tsx`：整合主页面，支持玩家与观战视角，连接草稿与倒计时；
  - `betDraft.ts`：纯函数草稿管理（预留、可用、目标选择、数额限制、有效性校验与预计收益预估）。
- **页面注册**：
  - 在 `viewRegistry.ts` 中注册 `wits-wagers:wits_wagers_platform_v1:1` 并纳入 `VERSIONED_MODULE_IDS`；
  - 在 `GamePage.tsx` 中添加懒加载与分流分支。
- **Playwright 视觉与视口验收**：
  - `e2e/fixtures/wits-wagers.ts`：构造 V1、V2、V3 固定样例数据；
  - `e2e/wits-wagers-visual.spec.ts`：通过 `routeWebSocket` 驱动真实页面，在桌面端（1280x800）与移动端（390x844）断言无横向溢出（`scrollWidth <= clientWidth + 1`），并将截图保存至 `output/wits-wagers-acceptance/T07/`。

---

## 2. 改动路径

**新增**：
- `packages/client/src/game/wits-wagers/betDraft.ts`
- `packages/client/src/game/wits-wagers/wits-wagers.css`
- `packages/client/src/game/wits-wagers/GuessPanel.tsx`
- `packages/client/src/game/wits-wagers/WitsWagersTable.tsx`
- `packages/client/src/game/wits-wagers/BetEditor.tsx`
- `packages/client/src/game/wits-wagers/ResultPanel.tsx`
- `packages/client/src/game/wits-wagers/WitsWagersGamePage.tsx`
- `packages/client/tests/witsWagersBetDraft.test.ts`
- `e2e/fixtures/wits-wagers.ts`
- `e2e/wits-wagers-visual.spec.ts`
- 截图产物：`output/wits-wagers-acceptance/T07/{v1-answering-desktop.png, v2-betting-desktop.png, v3-settlement-desktop.png, v3-settlement-mobile.png}`

**修改**：
- `packages/client/src/game/viewRegistry.ts`（注册 V2 parser）
- `packages/client/src/game/GamePage.tsx`（添加懒加载分流分支）

---

## 3. 命令与测试结果

| 命令 | 退出码 | 结果 |
|---|---|---|
| `npx tsx --test packages/client/tests/witsWagersBetDraft.test.ts packages/client/tests/breakpointContract.test.ts` | **0** | **7 tests 全部通过** |
| `npm run typecheck` | **0** | 通过 |
| `npx eslint <新文件及修改文件>` | **0** | **0 error, 0 warning** |
| `npm run build` | **0** | 生产构建成功，生成 `WitsWagersGamePage` 等 bundle |
| `npx playwright test e2e/wits-wagers-visual.spec.ts` | **0** | **1 passed，截图正常落盘，无横向溢出** |

---

## 4. 遗留与下一任务

- 下一张任务卡：**T08（真实前端动作、开放入口、WS 私密性）**。
- 无常驻进程，无需清理 PID。
