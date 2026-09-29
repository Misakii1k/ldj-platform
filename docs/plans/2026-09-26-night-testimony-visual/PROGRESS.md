# 进度（2026-09-26 起）

执行模型每完成一步追加一行证据；视觉项只能写「待用户看图 / 用户已确认（日期）/ 用户驳回（原话）」。

> 补记（2026-09-29）：T1–T5 实现实际已在 2026-09-28 的会话中完成（证据：`night-testimony-refresh-report.md` + `night-testimony-archive/` 截图组），但当时未回本表登记。本表从 2026-09-29 用户驳回轮起由当值会话补登。

| 任务 | 状态 | 证据（命令 · 退出码 · 截图路径） |
|---|---|---|
| T1 档案室骨架 | 已实现（2026-09-28，未登记）；视觉：待用户看图 | `docs/superpowers/reports/2026-08-15-game-ui-refresh/night-testimony-refresh-report.md` |
| T2 ② 问答盖章 | 已实现（2026-09-28，未登记）；视觉：待用户看图 | 同上 |
| T3 ① 出题 | 已实现（2026-09-28，未登记）；视觉：待用户看图 | 同上 |
| T4 ③ 投票 | 已实现（2026-09-28，未登记）；视觉：待用户看图 | 同上 |
| T5 ④ 开票 + ⑤ 猜罪（依赖隐私修复任务） | 前端已实现（2026-09-28，未登记）；视觉：待用户看图。⚠ 服务端 `reveal.crimes` 猜罪期间下发的隐私修复仍未合入（views.ts L200 只看 phase==='game_over'），前端按红线不渲染 | 同上 |
| T6 验收 | 已执行（2026-09-29）：机器门全绿、§1.6 截图组齐（含补采 reveal-wrong）；视觉：待用户看图 | `docs/plans/2026-09-26-night-testimony-visual/ACCEPTANCE.md` |

## 用户看图记录

- 2026-09-29 用户驳回（原话）：「囚徒之夜前端页面不行」。追问后用户确认：① 指视觉没落地/难看，不是功能故障；② ①③④⑤ 参照稿全部认可，直接按计划实施，不再逐张确认。

## 2026-09-29 驳回修复轮（R1）

**诊断**（对照 `C-kraft-archive.html` / S1–S4 参照稿与 9-28 截图组）：
- 移动端（≤640px）把出题/作答/投票/猜罪全部收进一只通用白弹窗 `nt-turn-modal`（`sg-modal-dialog`），投票退化成纯名字按钮列表——参照稿无此弹窗，操作应落在桌面与底栏上；弹窗底栏与弹窗正文文案重复。
- 此弹窗是 9-28 会话自行引入的偏离（计划外视觉决定），本轮拆除。

**改动**（白名单内）：
- `NightTestimonyGamePage.tsx`：删除 `useNarrow` / `myTurn` / `turnModalOpen` 及整个回合弹窗 JSX；底栏按钮全端直出（盖 NO / 盖 YES / 贴封条 / 提交猜罪 / 自告）。
- `night-testimony.css`：删除 `.nt-turn-modal*` / `.nt-turn-target` 全部样式；移动端 `.nt-stack` 限高 118px 内部滚动（不挤占审讯单与档案袋）；移动端 `.nt-btn--coral` / `.nt-btn--primary` 单独成行时通栏。

**验证**：
- `npm run typecheck` → 退出码 0。
- `npx tsx --test packages/client/tests/nightTestimonyStage.test.ts` → 9/9 PASS。
- 截图（before = 9-28 同名文件，after = 本轮重采）：`night-testimony-archive/night-testimony-*-{1280x800,390x844}.png`，采集命令 `$env:PORT=8091 … node packages/server/src/index.ts` + `npx vite --port 5199` + `npx tsx scratch/nt-capture.ts <desktop|mobile|six>`。

**视觉判定**：待用户看图（before/after 同视口对照）。

## 2026-09-29 T6 验收轮

**改动**（白名单外仅工具脚本）：
- `scratch/nt-capture.ts` 新增 `wrong` 模式：全员票一名无辜囚犯 → 抓错人分支（`reveal-wrong` 双视口连拍，result 定格窗 REVEAL_HOLD_MS=2s 内完成）。

**验证**（全部当轮实跑，详见 ACCEPTANCE.md 机器门表）：
- `npm run typecheck` → 0；`npm test` → 73/73 exit 0；`npx tsx --test packages/client/tests/nightTestimonyStage.test.ts` → 9/9 exit 0；`npm run build` → exit 0。
- `npx playwright test e2e/night-testimony-tabletop.spec.ts` → 1 passed，exit 0。
- `npx playwright test e2e/visual-audit.spec.ts --grep night` → 无匹配（中文标题）；`--grep "6b"` → 夜审图 `screenshots/21_night_testimony_tabletop.png` 刷新成功，分组失败点为铃铛对决 `.tabletop-shell` 缺失（既有、非白名单）。
- 截图矩阵 §1.6 全量重采（14:52–15:04，exit 0）：`desktop` / `mobile` / `six` / `wrong` 四趟真联机驱动，25 张全部今日新采。一次采集中 `page.screenshot` 因字体加载超时失败（exit 1），重跑通过，判定为采集侧抖动。

**视觉判定**：待用户看图（ACCEPTANCE.md 视觉判定表，用户结论列留空）。
