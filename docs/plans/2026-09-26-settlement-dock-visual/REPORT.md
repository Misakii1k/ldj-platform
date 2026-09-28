# 平台结算坞 + 开局转场 · 视觉交付与验收报告

> **日期**：2026-09-27  
> **交接计划**：`docs/plans/2026-09-26-settlement-dock-visual/README.md`  
> **视觉参照稿**：  
> - 结算坞：`docs/ui-preview/settlement-dock/B-signin-board.html`  
> - 开局转场：`T1-dock-sheet.html`、`T2-curtain.html`、`T3-theme-stripes.html`

---

## 1. 交付概况与机器门结果

| 验证项 | 验证命令 | 退出码 | 结果判定 |
|---|---|---|---|
| **TypeScript 类型检查** | `npm run typecheck` | 0 | 机器门通过 |
| **代码规范校验 (Client)** | `npx eslint packages/client` | 0 | 机器门通过 |
| **单元测试验证** | `npx tsx --test packages/client/tests/platformSkin.test.ts packages/client/tests/settlementDockModel.test.ts` | 0 (11 passed) | 机器门通过 |
| **客户端生产打包构建** | `npm run build -w @ldj/client` | 0 | 机器门通过 |

---

## 2. 视觉判定（必须由用户看图，AI严禁自评PASS）

| 视口规格 | 评定状态 | 说明 |
|---|---|---|
| **桌面端 1280×800** | `待用户看图` | 见下方截图绝对路径清单 |
| **移动端 390×844** | `待用户看图` | 见下方截图绝对路径清单 |

---

## 3. 固定截图组清单（绝对路径）

截图保存在目录：`D:\项目\docs\plans\2026-09-26-settlement-dock-visual\shots\`

| 画面编号 | 画面事实描述与状态 | 桌面截图 (1280x800) | 手机截图 (390x844) |
|---|---|---|---|
| **S1-light** | 刚结算，自己未准备，浅色派对表皮（奶酪大盗背景示意） | [S1-light-1280x800.png](file:///D:/项目/docs/plans/2026-09-26-settlement-dock-visual/shots/S1-light-1280x800.png) | [S1-light-390x844.png](file:///D:/项目/docs/plans/2026-09-26-settlement-dock-visual/shots/S1-light-390x844.png) |
| **S1-dark** | 刚结算，自己未准备，深色悬疑表皮（狼人杀背景示意） | [S1-dark-1280x800.png](file:///D:/项目/docs/plans/2026-09-26-settlement-dock-visual/shots/S1-dark-1280x800.png) | [S1-dark-390x844.png](file:///D:/项目/docs/plans/2026-09-26-settlement-dock-visual/shots/S1-dark-390x844.png) |
| **S2** | 自己已准备，只差 1 人，吊牌文案「就等 豆豆 了」 | [S2-1280x800.png](file:///D:/项目/docs/plans/2026-09-26-settlement-dock-visual/shots/S2-1280x800.png) | [S2-390x844.png](file:///D:/项目/docs/plans/2026-09-26-settlement-dock-visual/shots/S2-390x844.png) |
| **S3** | 倒计时中，衬线大数字「2」，房主视角显示「▶ 立即开局」与「取消准备」 | [S3-1280x800.png](file:///D:/项目/docs/plans/2026-09-26-settlement-dock-visual/shots/S3-1280x800.png) | [S3-390x844.png](file:///D:/项目/docs/plans/2026-09-26-settlement-dock-visual/shots/S3-390x844.png) |
| **S4** | 「⋯」更多菜单展开，房主显示「返回房间大厅」「暂离回首页」「退出房间」 | [S4-1280x800.png](file:///D:/项目/docs/plans/2026-09-26-settlement-dock-visual/shots/S4-1280x800.png) | [S4-390x844.png](file:///D:/项目/docs/plans/2026-09-26-settlement-dock-visual/shots/S4-390x844.png) |
| **S5** | 10 人局签到牌网格（排版压缩横排） | [S5-1280x800.png](file:///D:/项目/docs/plans/2026-09-26-settlement-dock-visual/shots/S5-1280x800.png) | [S5-390x844.png](file:///D:/项目/docs/plans/2026-09-26-settlement-dock-visual/shots/S5-390x844.png) |
| **S6** | 狼人杀全员就绪不自动开局，非房主视角「全员就绪 · 等房主开局」 | [S6-1280x800.png](file:///D:/项目/docs/plans/2026-09-26-settlement-dock-visual/shots/S6-1280x800.png) | [S6-390x844.png](file:///D:/项目/docs/plans/2026-09-26-settlement-dock-visual/shots/S6-390x844.png) |
| **S7** | 观战者视角，吊牌显示「观战中 · 等玩家准备」，无操作按钮 | [S7-1280x800.png](file:///D:/项目/docs/plans/2026-09-26-settlement-dock-visual/shots/S7-1280x800.png) | [S7-390x844.png](file:///D:/项目/docs/plans/2026-09-26-settlement-dock-visual/shots/S7-390x844.png) |
| **S8** | 开局转场 T1 坞即幕布（定格在 name 阶段） | [S8-t1-sheet-1280x800.png](file:///D:/项目/docs/plans/2026-09-26-settlement-dock-visual/shots/S8-t1-sheet-1280x800.png) | [S8-t1-sheet-390x844.png](file:///D:/项目/docs/plans/2026-09-26-settlement-dock-visual/shots/S8-t1-sheet-390x844.png) |
| **S9** | 开局转场 T2 合幕开幕（定格在 name 阶段） | [S9-t2-curtain-1280x800.png](file:///D:/项目/docs/plans/2026-09-26-settlement-dock-visual/shots/S9-t2-curtain-1280x800.png) | [S9-t2-curtain-390x844.png](file:///D:/项目/docs/plans/2026-09-26-settlement-dock-visual/shots/S9-t2-curtain-390x844.png) |
| **S10** | 开局转场 T3 主题色彩条（浅色派对定格） | [S10-t3-stripes-light-1280x800.png](file:///D:/项目/docs/plans/2026-09-26-settlement-dock-visual/shots/S10-t3-stripes-light-1280x800.png) | [S10-t3-stripes-light-390x844.png](file:///D:/项目/docs/plans/2026-09-26-settlement-dock-visual/shots/S10-t3-stripes-light-390x844.png) |
| **S11** | 开局转场 T3 主题色彩条（深色狼人杀定格） | [S11-t3-stripes-dark-1280x800.png](file:///D:/项目/docs/plans/2026-09-26-settlement-dock-visual/shots/S11-t3-stripes-dark-1280x800.png) | [S11-t3-stripes-dark-390x844.png](file:///D:/项目/docs/plans/2026-09-26-settlement-dock-visual/shots/S11-t3-stripes-dark-390x844.png) |

---

## 4. 请用户确认的细节清单（已按交接计划默认值实现）

1. **状态文案点名逻辑**：自己未准备显示「对局结束 · 再来一局？」；只差 1 人点名「就等 {名字} 了」；差多人显示「还在等 {n} 人」；
2. **狼人杀全员就绪不自动开局**：房主显示黄色「▶ 开局」，非房主显示「全员就绪 · 等房主开局」；
3. **观战者无主次按钮**，仅保留查看准备进度与更多菜单；
4. **倒计时归零平滑交棒**：倒计时数到 1 时立即交棒给开局转场，不再重复显示全屏遮挡或旧版水波纹；
5. **名牌副标题**：采用「{n} 人局」（避免因协议无局数字段修改后端数据结构）。

---

## 5. 第二轮：真实 App 渲染验收（2026-09-28）

> 上一轮 `shots/` 截自方向稿 mock；本轮用 Playwright 驱动**真实前端**（本地 server + web），
> 脚本：`scripts/capture-settlement-dock-real.mjs`，产物：`shots-real/R1~R8 × 1280x800/390x844` 共 16 张。

### 5.1 机器门（本轮复跑）

| 验证项 | 结果 |
|---|---|
| `npm run build -w @ldj/client` | 通过（17.24s） |
| `npx tsc --noEmit -p packages/client` | 通过 |
| `npx tsx --test packages/client/tests/settlementDockModel.test.ts` | 8/8 通过 |
| 截图脚本横向溢出断言 | 16/16 无警告 |

### 5.2 真实渲染发现并修复的问题

| # | 问题 | 修复 |
|---|---|---|
| 1 | 移动端签到牌头像过大（44px）挤压名牌 | 响应式 32px（≤640px）/24px（≤400px） |
| 2 | 「⋯」按钮在窄屏贴边 | 右锚定位 + 内边距调整 |
| 3 | 380px 极窄屏吊牌文案溢出 | 吊牌字体/内边距断点收紧（commit 8deaf56） |
| 4 | 右下角聊天按钮遮挡坞主按钮/⋯ | 坞出现时聊天按钮抬升至坞上方；抬升量由坞组件实测占位高度写入 `--settlement-dock-h`（10 人双行牌时坞更高也能正确避让）；「⋯」菜单展开期间聊天按钮隐藏 |
| 5 | 奶酪大盗终局「真相大揭秘」全屏遮罩挡住坞 | 截图脚本先关遮罩再截（产品行为本身合理：复盘优先） |
| 6 | 狼人杀终局「终局复盘」弹窗挡住坞 | 同上，脚本先关弹窗再截 |
| 7 | 倒计时截图捕到 slam 动画中间帧（半透明残影） | 数字命中后等 560ms 动画播完再截 |

### 5.3 待用户看图确认

- 10 人局（R8）聊天按钮抬升后与坞吊牌同高度的视觉平衡；
- 狼人杀（R6）坞的深色剧场表皮与游戏舞台的融合度；
- 观战者（R7）与「就差 1 人」点名（R2）文案口吻。
