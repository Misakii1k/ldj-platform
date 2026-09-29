# T4 · Ding 页面接入

**规格**：`contracts/ding.md` + `contracts/ding-rules.md` §9。依赖 T1（新规则）与 T2（派对桌组件）。

## 步骤

1. **`BellClashGamePage.tsx`** 重排：
   - 根容器 `.bc-game.pt-table` + `data-color={discardTop?.color ?? 'green'}`；开局还没有顶牌时桌布是 `--bc-ding`。去掉 `stage-felt-3d`。
   - 中央：`PartyCloth` + `PartyDisc`，盘心放铃（`stage/DeskBell.tsx` 按方向稿 `r2/_ding.css` 的 `.bell` 重画：底座 / 铃身 / 铃边 / 顶钮 / 两圈声波），牌堆与弃牌分列两侧。
   - 对手：`PartySeatRing`；我：`PartySticker`；手牌：`CardFanEngine crowdMode="corner"` + `sortByColor`。
   - 操作坞：「摸牌」+「拍铃！（黄）」。
2. **挑卡态**（纯客户端 state `picking: boolean`）：
   - 点铃或「拍铃！」→ `picking = true`：播拍铃演出；手里短语卡加 `.is-pick-target`（上浮 + 黄框），其他牌压暗；显示提示条。
   - 点短语卡 → 发 `ring_bell { playerId, cardIndex }`，`picking = false`。
   - 再点铃 / 点空白 → 取消。
   - 手里没有短语卡时按铃：铃变灰晃一下 + 阶段牌写"手里没有短语卡"，**不发动作**。
3. **质疑态**（`view.challenge !== null`）：新建 `stage/ChallengePanel.tsx`：亮卡（`PartyCard` 放大）+ 投票胶囊（按 `voterIds` 顺序，`doubtIds` / `confirmIds` 决定状态）+ 剩余秒数 + 铃外倒计时环（`StageCountdownRing`，`phaseKey` 用 `challenge:${claimantId}`）；我是投票人且没投过时显示「有」「没做过」两个普通按钮，发 `challenge_vote`。
4. **结算演出**：`stage/deriveStageEvents.ts` 新增 `bellRung`、`challengeResolved { success, claimantId }`，删掉 `bellOpened`；`useBellClashStage.tsx` 按契约 §2 表播成功 / 拍错两套演出（盖章用新的 `.bc-nope`，样式照 `r2/_ding.css` `.nope`）；`audioCues.ts` 按契约 §5 音效。
5. **结算画面**（`phase === 'game_over'`）：新建 `stage/BellClashResult.tsx`，布局照契约 §4.3；抽牌堆耗尽多胜者的文案分支。
6. 样式写进 `bell-clash.css`：删掉旧的三区抢铃桌（`.bc-arena` 那一大段）与 3D 毡面变量；新增部分只引用 `--pt-*` / `--bc-*` / `--gp-*`。

## 完成判据

- 契约 §6 验收矩阵每一行都能复现（STATUS 写步骤；质疑态可用两个浏览器窗口：一个拍铃、一个投票）。
- 画面上**找不到**旧规则的任何文案："抢铃窗口""同色短语卡"。`grep -rn "抢铃窗口\|同色短语" packages/client/src/game/bell-clash` 为空。
- 6 / 15 / 24 张手牌同 T3 的溢出判据。
- `e2e/bell-clash-tabletop.spec.ts` 随新流程改写并通过：至少覆盖"非当前玩家拍铃 → 挑卡 → 其他人投票 → 成功接管"和"过半质疑 → 拍错罚摸"两条。
- 机器门全绿。

## 白名单

```
packages/client/src/game/bell-clash/BellClashGamePage.tsx
packages/client/src/game/bell-clash/bell-clash.css
packages/client/src/game/bell-clash/stage/**
packages/client/src/game/bell-clash/types.ts     （仅 T1 遗留的类型收尾）
e2e/bell-clash-tabletop.spec.ts
e2e/game-viewport-contract.spec.ts               （只改 bell-clash 用例）
```

**不许动**：`BellClashSimStage.tsx`、`simTypes.ts`。
