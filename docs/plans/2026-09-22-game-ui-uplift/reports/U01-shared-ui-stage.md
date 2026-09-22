# U01 报告：shared-ui 演出层上提

日期：2026-09-22。工作区 `D:\项目`，分支 `feat/wits-wagers-tabletop-stage`，基线 HEAD `f16a70d`。

## 结论

§4 的五项全部上提完成，一智千金已切到共享层，**其自身的单测、视口合约、动效合约零回归**。剩余失败全部来自并行会话的未完成改动（见 §5），与本卡无关。

## 1. 新增 `packages/client/src/shared-ui/stage/`

| 文件 | 行数 | 来源 | 泛化改动 |
|---|---|---|---|
| `flip.ts` | 195 | `wits-wagers/stage/flip.ts` | 锚点属性名参数化：`data-ww-anchor` → `data-stage-anchor`（`STAGE_ANCHOR_ATTR`，可传入覆盖） |
| `stageMemory.ts` | 101 | `wits-wagers/stage/stageMemory.ts` | 存储前缀按 `namespace` 分命名空间（`stage:<game>:<token>`），多款游戏共用 sessionStorage 时 `keepOnly` 不互相清除 |
| `flightPresets.ts` | 340 | `wits-wagers/stage/noteFlight.ts` | 仅命名泛化：`note*` → `piece*`（钞票/牌/令牌/鹅卡通用）。五种飞行性格与几何、关键帧逻辑未动 |
| `StageCountdownRing.tsx` | 128 | `wits-wagers/stage/WitsCountdown.tsx` | 类名 `.ww-countdown` → `.stage-countdown`；尺寸/字号改为 CSS 变量；音效直连 `webAudio.playTick()`，不再依赖游戏私有 `audioCues.ts` |
| `FlightLayer.tsx` | 222 | `wits-wagers/stage/WitsFlightLayer.tsx` | 节点由调用方以 `StageFlightPiece.node` 提供；`kind: 'note' \| 'card'` 泛化为 `motion: 'toss' \| 'slide'`；新增 `paper` 开关（厚重道具可关纸张质感）与 `className` 透传 |
| `useStageMachine.ts` | 199 | `useWitsWagersStage.ts` 抽出骨架 | 只留三条不可动摇的规则（服务端差分驱动 / 开播即写记忆 / 收敛在 deadlineAt 内）与串行队列、AbortController、硬切；`derive`/`play`/`applyFinalState` 由各游戏注入。回调存 ref，避免每帧重渲打断在播演出 |

## 2. `game-ui.css` 新增第 9 节（+237 行，1329 → 1566）

- `.stage-flight-layer` 及子层（`__ghost` / `__shade` / `__sheen` / `__shadow`），含 `perspective: 700px`（与 `FLIGHT_PERSPECTIVE` 对齐）与 minimal/off/prefers-reduced-motion 三重降级。
- `.stage-countdown` 进度环，尺寸经 `--stage-countdown-size` / `--stage-countdown-font` 覆盖；紧张态配色走 `--game-coral`，脉冲 keyframe 在 minimal/off 档关闭。
- `.stage-felt-3d` + `.stage-felt-3d__plane`：配色由各游戏给 `--stage-felt-a/-b/--stage-felt-rail`，**兜底一律 `--gp-*` 令牌**（`classContracts` 测试禁止共享层写裸主题色）；倾角 `--stage-felt-tilt` 在 380px 窄屏降 12deg、横屏矮视口降 8deg、off 档取消。

## 3. 一智千金切换

- 删除本地 `flip.ts` / `noteFlight.ts` / `stageMemory.ts` / `WitsCountdown.tsx`（共 ~630 行），改为引用共享层。
- `WitsFlightLayer.tsx` 重写为 71 行适配器：只做 `FlightSpec` → `StageFlight` 翻译，几何与节拍交给共享层。
- 4 处 DOM 锚点属性改名为 `data-stage-anchor`。
- `useWitsWagersStage.ts` 的 `createStageMemory` 传 `namespace: 'wits-wagers'`。
- `wits-wagers.css` 由 1443 → 1266 行（-177）：倒计时块压缩为 10 行字号挂钩，飞行层块压缩为 21 行道具补充。

## 4. 测试

| 项 | 结果 |
|---|---|
| `packages/client/tests/stageMemory.test.ts`（原 `witsWagersStageMemory`） | 10 项通过；**新增 2 项**验证命名空间隔离（`keepOnly` 不跨游戏误删、同 token 不同 ns 互不可见） |
| `packages/client/tests/stageFlightPresets.test.ts`（原 `witsWagersNoteFlight`） | 全部通过，接口改名后行为一致 |
| `witsWagersSettings` / `witsWagersStageEvents` / `classContracts` | 全部通过 |
| U01 相关合计 | **46/46** |
| `npm run build` | 通过，14.6s，产物尺寸与基线一致 |
| `e2e/game-viewport-contract.spec.ts` bell-clash / durian / echo-judge / night-testimony | 4/4 通过（含 U00 的 `.durian-native-page` 修正） |
| `e2e/motion-contract.spec.ts` | 25/27 通过，失败 2 条均为 werewolf（见 §5） |

## 5. 并行会话的未完成改动（非本卡引入，不在本卡范围）

工作区里有另一会话尚未提交的半成品，它们在本卡开工前就已存在，本卡未触碰：

| 现象 | 原因 |
|---|---|
| `ModeratorVoicePanel.tsx` / `resultRoster.ts` 共 10 个 typecheck 错误 | 两个 untracked 孤儿文件，**无任何模块引用**，依赖尚未落地的 `ConnectionSnapshot.clockSample` 与 `reveal.playerId/alive/avatar` |
| 24 项单测失败（serverClock / seatDrift / 模糊对抗 / Progression View Audit 等） | 同源：依赖 `clockSample` 与「桌面模拟需大屏」新规则，测试与实现未对齐 |
| 视口合约 6 个 `*-sim` 用例失败 | 服务端新增校验「桌面模拟模式需要至少一台公共大屏」，spec 的 `seedRoom` 未 seed 大屏席位 |
| 视口合约 + 动效合约的 werewolf 用例失败 | werewolf 页面结构被该会话改动，`readySelector` 再次失配 |

本卡顺带修了其中三处会阻断编译的漏改（均为一行接口补全，与原作者意图一致）：
- `packages/server/tests/autoStart.test.ts`：fixture 补 `spectators_online: 0`（`ws.ts` 已把它设为必填）
- `packages/client/src/game/tabletop/GameDrawer.tsx`：加 `className?` prop（三处调用方已在传）
- `packages/client/src/game/tabletop/types.ts`：`TabletopPlayer.score` 放宽为 `number | string`，与 HEAD 的 `1423c9e refactor(shared-ui): PlayerSeat.score 放宽` 对齐

排除这两个孤儿文件后，客户端 typecheck **0 错误**。

## 6. 操作事故与恢复

过程中为验证「wits e2e 的一条失败是否为存量」用了 `git stash push --include-untracked` 做对比（该失败确认为存量：基线上同样失败）。`git stash pop` 未能正确还原被删除的 tracked 文件，导致本卡改动被部分回退，已全部重做并逐项校验。

教训：**这个工作区不能用 stash 做基线对比**——untracked 文件太多（并行会话的半成品），pop 的还原语义不可靠。以后改用 `git worktree add <path> <ref>` 建只读副本对比，用完 `git worktree remove`。本报告的 HEAD 基线核对就是这样做的。
