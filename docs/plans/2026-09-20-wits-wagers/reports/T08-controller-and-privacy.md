# T08 报告：真实前端动作、开放入口与 WS 私密性

日期：2026-09-20。工作根：`D:\项目`，分支 main。
前置门：T07 已通过。

---

## 1. 目标与实现概述

根据 02 §4、04 §T08 要求，实现一智千金前端真实动作控制器、网关集成、双向 WebSocket 隐私验证与完整 Playwright E2E 对局闭环：
- **控制器实现 (`useWitsWagersController.ts`)**：
  - 直接复用 `useConnection.send` 发送 `game_action`（`submit_guess`、`set_bets`）与 `room_command`（`return_to_lobby`）；
  - 捕获 `ServerError.payload.code` 识别 `STALE_CLIENT_STATE`，自动触发 `resync` 并提示用户“桌面状态已更新，请保留草稿并重新点击保存”；
  - 严格本地维护 `isSubmittingGuess`、`isSavingBets`、`error` 状态，不锁死全屏，只在请求中时禁用对应按钮。
- **页面接入与错误呈现 (`WitsWagersGamePage.tsx`)**：
  - 无缝接驳 `useWitsWagersController`，在未显式传入回调属性时自动接管真实通信；
  - 提供醒目的错误横幅展示，支持手动一键消除。
- **网关集成测试 (`witsWagersGateway.test.ts`)**：
  - 基于真实应用与 WebSocket 连接，验证 3 人建房、开局广播、答题隐私拦截（c1 提交作答后广播 c2 收到 `game_state` 包含 `hasSubmitted: true` 但绝无 c1 数值，board 保持为空）；
  - 验证 `STALE_CLIENT_STATE` 机制（携带旧 `expectedSeq` 时被网关拦截并返回对应错误码）。
- **完整真实浏览器 E2E (`e2e/wits-wagers.spec.ts`)**：
  - 2 人开局时被服务端硬性拦截（“在线玩家需为 3–7 人”）；
  - 3 玩家 + 1 独立观战者真实开局；
  - 观战者视角无 `me` 属性；
  - 浏览器中房主通过真实 DOM 表单输入 1000 并提交，页面出现“已提交估数：1,000”；
  - 其余玩家通过 WS 客户端提交各自估数，触发全员答齐提前翻牌，浏览器端页面自动响应切换到 `arranging` 阶段并渲染版图。

---

## 2. 改动路径

**新增**：
- `packages/client/src/game/wits-wagers/useWitsWagersController.ts`
- `packages/server/tests/witsWagersGateway.test.ts`
- `e2e/wits-wagers.spec.ts`

**修改**：
- `packages/client/src/game/wits-wagers/WitsWagersGamePage.tsx`（默认接入 controller 并展示错误横幅）
- `packages/client/dist`（同步最新生产构建产物）

---

## 3. 命令与测试结果

| 命令 | 退出码 | 结果 |
|---|---|---|
| `npx tsx --test packages/client/tests/witsWagersView.test.ts packages/server/tests/witsWagersSession.test.ts packages/shared/tests/catalog.test.ts packages/server/tests/witsWagersGateway.test.ts` | **0** | **36 tests 全部通过** |
| `npm run typecheck` | **0** | 通过 |
| `npx eslint <新文件及修改文件>` | **0** | **0 error, 0 warning** |
| `npx playwright test e2e/wits-wagers.spec.ts e2e/wits-wagers-visual.spec.ts` | **0** | **2 passed (全绿通过)** |

---

## 4. 遗留与下一任务

- 下一张任务卡：**T09（故障/构建/客户端边界门与恢复 E2E）**。
- 无常驻进程，无需清理 PID。
