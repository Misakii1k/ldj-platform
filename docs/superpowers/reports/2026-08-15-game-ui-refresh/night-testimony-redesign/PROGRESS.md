# 夜审对局桌 UI 重设计 — 进度记录

> 状态：**已完成（2026-09-29）**。设计/实施计划文档与旧版进度在 `night-testimony-refresh-report.md`（同目录上一层）。
> 本文件为 9-29 会话重建的收尾版（原工作目录曾被外部清理）。

## 最终交付

狱警卧底「谁是狱警」对局页按蓝色档案参考图重做：绿色灯罩灯 + 绿色桌垫 + 马尼拉档案袋 + 红/蓝 YES/NO 印章。12 张阶段参考图在 `docs/superpowers/reports/2026-08-15-game-ui-refresh/`（蓝绿档案 6 张 + 棕色投票 6 张）。

### 改动文件
- `packages/client/src/games/night-testimony/GamePage.tsx`（重写，桌面/移动同一 DOM）
- `packages/client/src/games/night-testimony/GamePage.css`（重写）
- `packages/client/src/games/night-testimony/tests.ts`（同步断言：nt-card→nt-slip-card、nt-vote-badge→nt-folder-badge 等）
- `scratch/nt-capture.ts`（真联机全流程截图脚本：host API 建房 + RoomDriver 驱动 + Playwright 截图）

### 关键结构
- 桌面「悬浮桌」、移动「整页绿桌」由纯 CSS 断点（≤768px）切换；dock 双端同构（桌面 dockButtons、移动原生按钮），移动上线索卡+规则卡叠入 dock 流内，各阶段输入不再滚出屏。
- 阶段映射：出题=悬浮审问单卡（出题人可见）；问答=审问单+盖章格（虚线=思考中、已盖章、翻面出 YES/NO 斜章）；投票=档案袋扎红线挂嫌疑人吊牌+灯光变红；揭穿=狱警袋抽出蓝档案+监狱工作证翻面；猜罪=罪行标签池+档案袋贴条（阿杰已自告上锁），**不再弹窗**；结案=灯罩亮起+横幅+卷宗卡+永久真相章；再来一局=房主悬浮板+被邀者酒红票。
- 动画：.nt-flip（章+格翻面）、.nt-fly-stamp / .nt-fly-label（幽灵飞行）、.nt-pull（档案抽出）均为 WAAPI 短演出；计时环 conic-gradient。

## 最终验证（2026-09-29）
- `npm run typecheck` 0 错
- `npx tsx --test packages/client/src/games/night-testimony/tests.ts` → 9/9
- `npm test`（全量）→ 73/73，exit 0
- `npm run build` ✓（dist 已同步，8080 服役服务器刷新即生效）
- 真联机截图（exit 0）：`npx tsx scratch/nt-capture.ts desktop|mobile|six-desktop|six-mobile`，产物 `night-testimony-archive/night-testimony-{pick-other,pick-asker,answering,answering-flipped,vote,reveal-caught,guess-inmate,guess-warden,game-over,game-over-warden,six-*}-{1280x800,390x844}.png`
- `npm run test:e2e -- visual-audit.spec.ts --grep "6b"`：夜审截图 `screenshots/21_night_testimony_tabletop.png` 通过并刷新；**铃铛对决 .tabletop-shell 缺失为既有失败**（23_bell_clash 仍 9/18 旧图），与本任务无关

## 遗留（均未做，后续按需）
1. 5 档主题换色（当前固定绿桌绿灯）
2. 灯光音效（WebAudio）
3. e2e 修复白名单：`e2e/night-testimony-tabletop.spec.ts`（旧词汇断言全灭）、`visual-audit.spec.ts` 铃铛对决段
4. 部署脚本 `deploy.sh`（8080 为临时 `node scripts/serve.mjs`）
