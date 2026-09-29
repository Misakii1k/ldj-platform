# T6 · 斗地主页面接入 + 只做横屏

**规格**：`contracts/landlord.md`。依赖 T5。

## 步骤

1. **数据缺口**（契约 §2 末段）：
   - `packages/games/landlord/server/platform/rules.ts` 的 `basePublicView`：`phase === 'game_over'` 时加 `revealedHands`；其余阶段不带这个键。视图 schema（`platform/schemas.ts`）同步为可选字段。
   - 客户端 `game/landlord/types.ts`：`KEYS` 白名单加 `revealedHands`，解析为可选。
   - 测试加在 `packages/games/landlord/tests/platform/` 里覆盖视图的那个文件：对局中公开视图不含 `revealedHands`；终局含，且与各人剩余手牌一致。
2. **`LandlordGamePage.tsx`**：
   - 根容器加 `.landlord-teahouse`；最外层放 `TeahouseScene`；去掉现有 `.landlord-table-watermark` 水印与毡面样式。
   - 对手换成 `OpponentFigure`（左右各一，`role` 由 `landlordId` 推出，叫分阶段为 `unknown`）；我换成 `LandlordPlate`。
   - 桌心：叫分阶段 = 底牌背面 + 三块叫分木牌（组件写在本文件里或 `teahouse/BidChips.tsx`，样式照 `r2/landlord-1-bid.html` 内联 `<style>`）；出牌阶段 = 底牌正面（公开记录）+ 出牌区；终局 = 最后一手 + 捷报（`teahouse/VictoryScroll.tsx`，样式照 `r2/landlord-3-result.html`）。
   - HUD：左侧阶段大字 + 说明，右侧倍数红纸牌（`RollingNumber`）+ `StageCountdownRing`。
   - 手牌：`PokerCard`；`computeLandlordHandOverlap` 换成 T5 的 `computeTeahouseHandOverlap`。
   - 操作坞：叫分「不叫 / 1 分 / 2 分 / 3 分（黄）」；出牌「不出 / 出牌（黄）」（**不做「提示」**，见 README Q4）；终局「返回房间 / 再来一局（黄）」。
   - 竖屏：渲染 `RotateHint`（CSS 控制显示）。
3. **演出**（`stage/useLandlordStage.tsx` + `deriveStageEvents.ts` + `audioCues.ts`）：按契约 §4 各画面"演出"与 §5 四档表逐条接入：叫分木牌弹起、金元宝落下 + 身份圆章落定、底牌翻开 + 飞入（新到三张 `isNew`）、出牌飞行、炸弹冲屏 + 屏震 + 对手后缩 + 上家气泡、捷报展开 + 纸屑 + 春印。
   - 春天判定：`winnerTeam === 'landlord'` 且 `revealedHands` 里两个农民都是 17 张。
   - **倍数只读 `view.multiplier`**，炸弹演出不改任何数字。
4. **样式**：`landlord.css` 里旧的毡面 / 水印 / 3D 桌样式删掉；新样式只引用 `--th-*` / `--gp-*`。
5. **视口合约**：`e2e/game-viewport-contract.spec.ts` 里 landlord 用例：
   - `390x844`、`360x800`、`412x915`、`320x568` 四档改为只断言"旋转提示可见 + 无横向溢出"。
   - `844x390` 升为**主验收档**：断言手牌、出牌区、操作坞主按钮都在视口内且互不重叠；20 张手牌不溢出。
   - `1280x800` 照常断言。
   - `768x1024`（平板竖屏）按 `max-width: 768px` 规则会显示旋转提示——这是 README 待确认 Q5，先按"显示旋转提示"做。

## 完成判据

- 契约 §6 验收矩阵每一行都能复现（STATUS 写步骤）。
- 画面上找不到"倍数翻倍""积分""得分"字样：`grep -rn "翻倍\|积分" packages/client/src/game/landlord` 为空。
- `e2e/landlord-platform.spec.ts` 随新 DOM 更新并通过。
- 机器门全绿。

## 白名单

```
packages/games/landlord/server/platform/rules.ts
packages/games/landlord/server/platform/schemas.ts
packages/games/landlord/tests/platform/**         （只加视图断言）
packages/client/src/game/landlord/**
e2e/landlord-platform.spec.ts
e2e/game-viewport-contract.spec.ts                （只改 landlord 用例）
```
