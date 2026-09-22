# U00 基线报告

日期：2026-09-22。工作区 `D:\项目`，分支 `feat/wits-wagers-tabletop-stage`，HEAD `f16a70d`。

## 结论

基线已建立。存量失败已定位并与本计划切割。**但工作区存在并行会话冲突，见 §5，后续任务卡开工前必须先解决。**

## 1. 全量门结果

| 门 | 结果 | 说明 |
|---|---|---|
| `npm run typecheck` | **通过，0 错误** | 干净基线 |
| `npm run lint` | **134 errors, 0 warnings（全部存量）** | 见 §2 |
| `npm test` | tsx 段 **1560/1560 通过**；scripts 段 **68/73**，5 项失败（存量） | 见 §3 |
| `npm run build` | **通过**，13.26s | 警告：`index` 829 kB / `vendor-three` 553 kB 超 550 kB 阈值 |
| `e2e/game-viewport-contract.spec.ts` | 首跑 18/20，修正过时选择器后 **20/20 通过** | 见 §4 |

## 2. lint 存量 134 错误分布

集中在 3 类与本计划无关的文件：

- `scripts/add_batch{1..5}.cjs`、`scripts/merge_all_batches.cjs` — CommonJS `require()` 与 `__dirname`/`console` 未在 eslint env 声明
- `output/model-refinement/*.{js,mjs}` — 同类问题
- werewolf 相关测试与 `theme.ts`、`packages/server/src/core/game/session.ts` 等

记为基线，本计划任务卡只要求「不新增 error」。

## 3. 单测 5 项存量失败

| 失败项 | 原因 |
|---|---|
| `driver：werewolf 稳定基线模块完整局可收束` | 存量 |
| `已知样例锁定：冻结源集合 9 文件哈希/行数一致` | 存量，源文件已变动 |
| `runMeasurement：reductionPercent 达标` | 存量 |
| `runMeasurement：content-hash provisional` | 存量 |
| `d4 当前仓库：上架游戏均带完整授权证据` | **一智千金已上架但 `compliance/d4/third-game-baseline.json` 未加入 `wits-wagers`**，属上一轮遗留 |

## 4. 视口合约门：发现两处「静默失败」并修正

首跑 20 个用例中 durian 与 werewolf 失败，原因**不是布局问题，而是 spec 的 `readySelector` 已过时**——这两款打磨过的游戏重构后改了根节点类名，导致视口合约门长期卡在「等待元素出现」阶段超时，**七档视口的横向溢出与几何断言从未真正对这两款执行过**。

| 游戏 | 旧选择器 | 实际类名 | 修正 |
|---|---|---|---|
| durian | `.tabletop-shell` | `.durian-native-page`（已改为自建全屏外壳，不再用 TabletopOvalShell） | 加入 `.durian-native-page` |
| werewolf | `.tabletop-shell, .werewolf-arena, .werewolf-wing, .seat-ring` | `.seat-rail`（双轨席位，`WerewolfStage.tsx:363`） | 加入 `.seat-rail`；同时把 445 行的席位子断言从「左右翼/马蹄环」改为「席位轨可见且席位数 > 0」 |

修正后单跑与全量跑均 **20/20 通过**，两款游戏的页面渲染本身完全正常（已核对 error-context 的 a11y 快照）。

**注意：这两处修正随后被并行会话的 `git reset` 还原，需要重做。**

## 5. 阻塞项：并行会话写同一工作区

`git reflog` 显示 3 次本会话未执行的 `reset: moving to HEAD`；`ccd_session_mgmt` 确认会话 **「一智千金桌面模拟模式与低卡规则」（`local_815593cd-c432-4400-bd3c-8d779d95054b`）正在 `D:\项目` 运行**。

被还原的内容包括：
- 本报告 §4 的两处 spec 修正
- e2e 目录原有的未提交改动（含 `wits-wagers-sim` 视口用例）
- 已还原过的 38 张截图基线又被重新覆写为 modified

**开工前必须二选一**：等该会话结束，或本计划改用 git worktree 隔离。在此之前不要修改任何共享文件。

## 6. 环境提示

首次运行 e2e 遇到 3178 端口被孤儿 `packages/server/src/index.ts` 占用（父进程 `start-server.mjs` 仍在但 Playwright 已退出），按既有处理方式核对命令行后清理，端口释放正常。
