# D7-B 结果：前端可见打磨（首页 / 房间页 / 狼人审判桌）

> 日期：2026-08-09。对应 D7 计划 `docs/superpowers/plans/2026-08-07-d7-recovery-frontend-g1-plan.md` 的 D7-B 部分。
> 基线：`97900e9`（D7-B 聊天入口修复）。本批只碰 `packages/client` 现有文件 + 一条既有 E2E 驱动器。

## 范围与结论

- 逐页打磨：首页目录网格、房间大厅、狼人月相审判桌；只改 `client` 现有文件，不新增组件、不改设计语言。
- 期间发现并修复了一条既有 E2E 驱动器的真实缺陷（卧底完整局在完整 CI 下 8 分钟超时），修复后该测试 20–30 秒通过。
- 全量质量门：在隔离 worktree（`HEAD + 本批 3 个客户端文件 + E2E 修复`）跑 `npm run ci` 全绿（761 + 66 测试、D1 合规、构建、16 条 E2E 全过，E2E 合计 1.2 分钟）。

## 一、首页打磨

**问题（截图定位）**：≥1024px 时目录为 3 列网格，而 `谁是卧底` 精选卡占 2 列；恰好 3 款游戏时首行排满、第三张卡孤悬次行，留大片空白。筛选到 1–2 款时也有空轨道。

**修复**：目录父网格携带当前集合数量（`data-game-count`），数量不足整轮时收拢轨道：

```css
.game-grid[data-game-count="1"] { grid-template-columns: minmax(0, 760px); justify-content: center; }
.game-grid[data-game-count="2"],
.game-grid[data-game-count="3"] { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.game-grid[data-game-count="1"] .game-card--featured,
.game-grid[data-game-count="2"] .game-card--featured { grid-column: span 1; }
```

**验证**（真实浏览器 + 几何测量）：
- 全部（3 款）：精选卡独占首行，其余两卡填满次行，无空洞。
- 筛选 3 人（1 款）：单卡居中，`scrollWidth == clientWidth == 1280`。
- 筛选 6 人（2 款）：双卡等宽（580.5px × 2），无水平溢出。
- 截图：`d7-shots/home-wide.png`、`home-narrow.png`、`home-3-players.png`、`home-6-players.png`。

## 二、房间大厅打磨

**问题（截图定位）**：
1. 房间页 CSS 大量选择器与 `RoomPage.tsx` 实际 JSX 类名不匹配（死代码），如 `.room-hero__title em`（实际 `span`）、`.room-host-console*`（实际 `.room-console*`）、`.room-action-btn`（实际 `.room-inline-btn`）、`.room-copy-btn`（实际 `.room-code-card__copy`）、`.room-panel__mark`（实际 `.room-panel__glyph`）——标题高亮、复制按钮、操作台样式全未生效。
2. 共享 `GameSetupPanel`（桌游深绿主题）在房间页里像外来组件。
3. 宽屏成员行：`准备` 按钮换行导致“我”那一行比邻居高一截。
4. 边角装饰方块在 1280px 满幅布局下被视口裁成碎边。

**修复**：
- 选择器全部对齐真实 JSX（见 `styles.css` diff）。
- `.room-layout .tabletop-setup` 覆盖为房间纸牌配色（token 级，不破坏房间外通用外观）。
- `.room-content-grid .member` 增第四列，操作按钮与状态徽标同排（≤520px 仍按原断点换行）。
- 装饰方块仅 ≥1600px（有真实留白）时显示，其余宽度隐藏。

**验证**：390 / 1280 / 1660 三档截图 + DOM 几何（1660px 下旋转方块外接盒完整在视口内）。截图：`d7-shots/room-wide.png`、`room-narrow.png`、`room-ultra.png`、`room-partial-ready-wide.png`。

## 三、狼人月相审判桌打磨

**问题（截图定位）**：
1. 390px 窄屏 12 席：每个席位底部空徽标槽仍占 18px，主操作被推到首屏之外。
2. 动作提交中只有按钮变灰，无明确忙碌状态。

**修复**：
- `.seat-chip__badges:empty { display:none }`；窄屏席位 `min-height` 98→82px。宽屏环形几何不变（`SeatRing` 常量与 dense 半径公式未动）。
- `WerewolfActionPanel` 增 `aria-busy`/`data-busy` 与忙碌提示条（`正在提交本次选择…` + 脉冲动画），按钮 active 下压反馈。

**验证**：宽/窄截图（座位区 630px→557px，无水平溢出）；`werewolf-tabletop.spec.ts` 几何+隐私+可访问名称门 `--retries=0` 通过。截图：`d7-shots/werewolf-wide.png`、`werewolf-narrow.png`。

## 四、E2E 驱动器修复（卧底完整局）

完整 `npm run ci` 暴露 `launch-playable.spec.ts` 的 undercover 完整局在满负荷下 8 分钟超时（此前偶发通过）。根因取证（trace + 探针）：

1. 驱动器每轮在 `page.locator('.room-status').textContent()` 上等待——该元素对局期间不存在，默认等待把每轮循环拖到 60–90 秒，发言/投票窗口全部错过，对局只能靠机器人+超时缓慢推进。
2. 结束检测依赖 `.room-status` 文本，可靠性差。

**修复**（`e2e/launch-playable.spec.ts`）：动作判断前置（每轮先尝试确认/发言/投票），结束检测改为 `.room-page` 可见（无自动等待），点击加容错。修复后完整局 **20–30 秒**通过（原 8 分钟），隔离 CI 中 16 条 E2E 全绿。

## 验证汇总

| 门 | 结果 |
| --- | --- |
| 客户端 typecheck（重新落盘后） | 通过 |
| lint（全仓） | 通过 |
| 客户端测试 | 66/66 通过 |
| vite 构建 | 通过（产物哈希与隔离 CI 一致） |
| werewolf 几何/隐私 E2E（`--retries=0`） | 通过 |
| undercover 完整局 E2E（`--retries=0`） | 通过（28.4s） |
| 隔离 worktree 全量 `npm run ci` | 全绿（761+66 测试、D1、构建、16 E2E） |

## 已知事项（如实记录）

**工作树误删事件**：收尾时对隔离 worktree 目录执行 `git worktree remove --force` + `rm -rf`，由于 worktree 建在主仓库内且其中含指向主仓库 `node_modules` 的 junction，误删了主仓库的 `node_modules` 与 338 个已跟踪文件的磁盘内容。已从 git 索引完整恢复全部已跟踪文件（恢复后 `git status` 无删除项）；`node_modules` 已重新 `npm install`；本批 D7-B 客户端改动按会话内完整 diff 重新落盘并复验（与隔离 CI 验证过的版本逐字节一致）。**无法恢复**的是恢复前工作树中未提交的改动：D7-C（durian/loveletter）在共享层的集成接线（registry/catalog/viewRegistry/GamePage 等约 100 个文件的未提交修改）。两个游戏目录本体（未跟踪）完好幸存。该损失与 D7-B 验收结果无关，但需在继续 D7-C 时重新接接线。
