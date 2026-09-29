# T3 · UNO 欢乐房规接入

**规格**：`contracts/uno.md`。依赖 T2。

## 步骤

1. **数据缺口**（`contracts/uno.md` §2 末段）：
   - `packages/games/uno/server/house/types.ts`：`UnoHouseRoundResult` 加 `remainingHands`。
   - `server/house/rules.ts` 的 `settleRound`：填 `remainingHands`（按 `players` 顺序复制 `r.hands[id]`）。
   - `server/house/schemas.ts` / 视图 schema 同步；客户端 `game/uno/types.ts` 的房规解析器同步（字段可选，老数据没有时画面退化为只显示分数）。
   - 测试：`packages/games/uno/tests/` 里找房规结算的测试，加断言 `remainingHands` 与 `perPlayerTotals` 一致（每人剩牌分之和 = 该人本局分）；对局中视图不含该字段。
2. **`UnoHouseStage.tsx`**：
   - 根容器加 `.pt-table` + `data-color={currentColor}`；去掉 `stage-felt-3d`（两处）。
   - 中央区换成 `PartyCloth` + `PartyDisc`（牌堆 `PartyCard back` + 剩余张数标签、弃牌堆顶 + 压在下面的上一张）+ 阶段牌 + HUD（当前色胶囊 + `StageCountdownRing`）。
   - 对手换成 `PartySeatRing`（取代现有 `computeRingPositions` 的环形站位；`ringLayout.ts` 如无别处引用就删掉，有引用就保留不动）。
   - 左上局数标签；左下我的 `PartySticker`；手机上我的贴纸在手牌上方居中。
   - `CardFanEngine`：去掉 `denseWhenCrowded`，传 `crowdMode="corner"`；`fanCards` 先 `sortByColor`；不可出的牌加 `dim`。
   - 操作坞：「摸牌」+「UNO!（黄）」；罚牌叠加 / 质疑 +4 / 抓漏喊 UNO 的现有按钮与面板**逻辑不动**，外观换成奶油卡纸 + 粗墨边（黄色只给当前唯一主操作）。
3. **事件演出**（`useUnoHouseStage.tsx` 已有事件差分，接进去）：
   - 出牌飞行、摸牌飞行：沿用 `FlightLayer`，时长 / 抬升照契约 §4.1。
   - 功能牌 → `PartySlam`（kind 按牌型）；`+2 / +4` 另加罚牌胶囊飞向被罚者。
   - 换色 → `PartyCloth` 泼色（以弃牌堆元素为原点）。
   - 选色 → `PartyColorPicker`，选完再发 `play_card { declaredColor }`（保持现有动作格式）。
4. **画面 ② 本局结算**（`phase === 'round_over'`，以及 `match_over` 的总榜）：新建 `game/uno/stage/UnoRoundResult.tsx`，布局与演出照契约 §4.2；用 `RollingNumber` 做分数跳动；排名换位用 FLIP（`shared-ui/stage/flip.ts`）。`match_over` 时标题"总榜"、分数列只显示累计分，并叠加现有 `TabletopVictoryBurst`。
5. **样式**：`uno.css` 里房规相关的旧毡面规则删掉（`.uno-arena` 3D 那一段、`.uno-opponent-station`），经典单局用到的规则**保留**。新增的房规样式写在 `uno.css` 末尾「整屏色块」一节，只引用 `--pt-*` / `--gp-*`。

## 完成判据

- 契约 §6 验收矩阵每一行都能在 dev 环境复现（在 STATUS 里写复现步骤）。
- 7 / 16 / 25 张手牌在 1280×800、390×844 下：无横向溢出、手牌不出屏、不与我的贴纸 / 操作坞重叠（viewport-contract 里给 uno 用例加一个"手牌 25 张"的 fixture 断言；做不到就在 STATUS 写原因并停下来问）。
- 经典单局 `uno-legacy.spec.ts` 仍然全绿。
- 机器门全绿。

## 白名单

```
packages/games/uno/server/house/types.ts
packages/games/uno/server/house/rules.ts
packages/games/uno/server/house/schemas.ts
packages/games/uno/tests/**             （只加房规结算断言）
packages/client/src/game/uno/types.ts
packages/client/src/game/uno/stage/**
packages/client/src/game/uno/uno.css
e2e/game-viewport-contract.spec.ts      （只改 uno 用例）
e2e/uno-house.spec.ts                   （选择器随新 DOM 更新）
```
