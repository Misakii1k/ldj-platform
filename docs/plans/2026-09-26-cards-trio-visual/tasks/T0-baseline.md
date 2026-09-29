# T0 · 开工前基线

**目的**：先记下"改之前"的样子和机器门状态，之后每张新截图都要有 before 对照（design-spec §11.5）。

## 步骤

1. 确认没有别的会话在同一目录改文件：`git status`，记下已有的未提交文件（它们**不属于**本计划，全程不要 add、不要 reset、不要 stash）。
2. 跑机器门，把结果（命令 + 退出码 + 失败项）写进 `STATUS.md` 的 T0 行：
   ```bash
   npm run typecheck
   npm test
   npm run lint
   npm run build
   npx playwright test e2e/game-viewport-contract.spec.ts e2e/motion-contract.spec.ts
   ```
   已有的失败**不用修**，只记下来，后面任务不许新增失败。
3. 存 before 截图：把下列已有基线**复制**（不是移动）到 `docs/plans/2026-09-26-cards-trio-visual/before/`：
   - `docs/superpowers/reports/2026-08-15-game-ui-refresh/baseline/landlord-1280x800.png`
   - `…/baseline/landlord-390x844.png`
   - `…/baseline/uno-1280x800.png`、`uno-390x844.png`
   - `…/baseline/bell-clash-1280x800.png`、`bell-clash-390x844.png`
   另外用 viewport-contract 的同一套流程补一张 `landlord-844x390.png`（斗地主改为只做横屏，需要横屏 before）。

## 完成判据

- `STATUS.md` T0 行有五条命令的退出码。
- `before/` 目录里 7 张图。

## 白名单

`docs/plans/2026-09-26-cards-trio-visual/STATUS.md`、`docs/plans/2026-09-26-cards-trio-visual/before/**`
