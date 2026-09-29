# T7 · 固定截图组 + 报告

**规范**：`docs/design-spec.md` §11.3 截图、§11.4 报告模板；`AGENTS.md`「视觉验收规范」。

## 步骤

1. 截图目录：`docs/superpowers/reports/2026-08-15-game-ui-refresh/baseline/`（与 viewport-contract 同一目录），文件名 `<game>-<画面>-<宽x高>.png`：

   | 游戏 | 画面 | 视口 |
   |---|---|---|
   | landlord | bid、bid-decided、play、play-bomb、result-win、result-spring、result-lose | 1280x800、844x390 |
   | landlord | rotate-hint | 390x844 |
   | uno | play、play-draw4、hand16、hand25、round-result | 1280x800、390x844 |
   | bell-clash | idle、picking、challenge、success、miss、result、hand24 | 1280x800、390x844 |

   fixture 用各契约 §6 的固定数据；动画静止后采集；倒计时数字可 mask，不许整屏 mask。
2. 如果 viewport-contract 覆盖了同名基线，**不要**用 `--update-snapshots`；在报告里标"基线变更，等待用户确认"。
3. 写 `docs/plans/2026-09-26-cards-trio-visual/reports/T7-screenshots.md`，按 §11.4 模板：
   - **机器门**表：五条命令 + 退出码。
   - **视觉判定**表：每张截图一行 = 截图绝对路径 / 对照物（契约 §4 对应段落 + 方向稿文件 + before 截图路径）/ 事实描述 / 用户结论（**留空**）。
   - **待确认**一节：原样抄 README §5 的 Q1–Q5，请用户逐条回答。
4. 在 `STATUS.md` 顶部写一行："截图组已就绪，请用户看图：<报告路径>"。

## 完成判据

- 报告里每张截图的绝对路径都存在（执行模型自己 `ls` 核对一遍）。
- 视觉判定表"用户结论"列全空；全文没有 PASS / 达标 / 已对齐 / 精致 这类词（`grep -n "PASS\|达标\|已对齐\|精致" reports/T7-screenshots.md` 只允许出现在机器门表里）。

## 白名单

```
docs/superpowers/reports/2026-08-15-game-ui-refresh/baseline/landlord-*.png
docs/superpowers/reports/2026-08-15-game-ui-refresh/baseline/uno-*.png
docs/superpowers/reports/2026-08-15-game-ui-refresh/baseline/bell-clash-*.png
docs/plans/2026-09-26-cards-trio-visual/reports/**
docs/plans/2026-09-26-cards-trio-visual/STATUS.md
e2e/**（仅新增截图用的辅助脚本，不改断言）
```
