# Ding 规则改写（服务端 + 测试 + 合规）

> **为什么改**：现有 `bell_clash_v1` 的拍铃规则理解错了。用户 2026-09-26 原话：
> 「一般……出牌者打出的，正好就是自己拍的……是先拍铃铛，再打出这个短语卡。」
> 并逐条确认了下面的新规则（记录见 `docs/DESIGN-DIRECTION.md` §9「斗地主 / UNO / Ding」）。

## 1. 新旧对照

| 项 | 旧（现有代码，错） | 新（用户确认） |
|---|---|---|
| 谁能拍铃 | 只在"别人打出短语卡后开的 10 秒窗口"里、由其他人抢拍 | **任何人、任何时候**都能拍（不管轮到谁） |
| 拍铃打出什么 | 拍铃者手里与顶牌**同色**的短语卡 | 拍铃者**自己挑**手里任意一张短语卡，**不要求同色** |
| 怎么判定 | 手里有同色短语卡 = 成功 | **其他人质疑投票**：亮卡后其他在局玩家有 `challengeSeconds`（默认 3 秒）可点「没做过」；**质疑数 × 2 > 可投票人数** = 拍错，否则成功 |
| 成功后 | 回合交给拍铃者 | 同：卡进弃牌堆、`discardTop` = 这张卡；**回合交给拍铃者**，他接着正常出牌（开新回合计时） |
| 拍错后 | 罚摸 1 张，回合给原出牌者下家 | 卡**回到拍铃者手里**；罚摸 1 张；**回合不变**（还是原来轮到的人，回合计时从头开始） |
| 普通出牌打短语卡 | 打出后开抢铃窗口 | 短语卡按颜色当普通牌打，**不开任何窗口**，和数字牌一样回合转下家 |
| 摸牌自动打出短语卡 | 打出后开窗口 | 同上，不开窗口 |

## 2. 状态模型改动（`packages/games/bell-clash/server/types.ts`）

删除：`bellOpen`、`bellClaimantId`、`config.bellSeconds`。
新增：

```ts
/** 正在进行的拍铃判定；null 表示没有 */
challenge: {
  claimantId: string;          // 拍铃者
  card: PhraseCard;            // 亮出的短语卡（已从手里移出，暂存在这里）
  handIndex: number;           // 原来在手里的位置（拍错时放回原位）
  voters: string[];            // 可投票的人 = 除拍铃者外所有在局玩家
  doubts: string[];            // 已点「没做过」的人
  confirms: string[];          // 已点「有」的人（可选投票，只影响提前结算）
  interruptedPlayerId: string; // 拍铃那一刻原本轮到的人
} | null;

config.challengeSeconds: number;   // 默认 3，范围 1–30
```

`deadlineKind` 的取值从 `'turn' | 'bell' | null` 改为 `'turn' | 'challenge' | null`。

## 3. 动作（`parseBellClashAction`）

| 动作 | 谁能发 | 条件 | 效果 |
|---|---|---|---|
| `ring_bell { playerId, cardIndex }` | 任何在局玩家 | `phase === 'playing'`、`challenge === null`、`hand[cardIndex].kind === 'phrase'` | 卡移出手牌放进 `challenge`；取消 `turn_timeout`；排 `challenge_timeout`（`challengeSeconds`）；事件 `bell_rung { claimantId, card }` |
| `challenge_vote { playerId, doubt: boolean }` | `challenge.voters` 里的人 | `challenge !== null`、本人未投过 | 记入 `doubts` / `confirms`；若质疑已过半 → 立即按"拍错"结算；若剩余未投的人全投质疑也不会过半 → 立即按"成功"结算；否则等待 |
| `challenge_timeout`（系统） | system | `challenge !== null` | 按当前票数结算：`doubts.length * 2 > voters.length` → 拍错，否则成功 |
| `play_card` / `draw_card` | 当前出牌者 | **新增**：`challenge !== null` 时拒绝（"拍铃判定中"） | 其余同旧；短语卡不再开窗口 |

结算：
- **成功**：`discardTop = card`；`currentPlayerId = claimantId`；清 `challenge`；排 `turn_timeout(claimantId)`；事件 `bell_resolved { claimantId, success: true, doubts }`；若拍铃者手牌因此为 0 → 直接胜利（`game_finished`）。
- **拍错**：卡按 `handIndex` 放回拍铃者手里；罚摸 1 张（牌堆空则不摸）；`penaltyPulls[claimantId] += 1`；`currentPlayerId = interruptedPlayerId`；清 `challenge`；排 `turn_timeout(interruptedPlayerId)`；事件 `bell_resolved { claimantId, success: false, doubts }`。

> 待确认 Q2：`challengeSeconds` 默认 3、"严格过半"——按此实现，报告里请用户确认。
> 待确认 Q3：拍铃打断别人的回合时，别人的回合直接作废（重新计时）——按此实现，报告里请用户确认。

## 4. 视图（`views.ts` + 客户端 `game/bell-clash/types.ts`）

公开视图删掉 `bellOpen` / `bellClaimantId`，新增：

```ts
challenge: {
  claimantId: string;
  card: { kind: 'phrase'; color: CardColor; phrase: string };  // 亮出来的卡本来就公开
  voterIds: string[];
  doubtIds: string[];
  confirmIds: string[];
} | null;
```

客户端解析器 `parseBellClashView`（`packages/client/src/game/bell-clash/types.ts`）同步：键白名单、校验、类型。

## 5. 机器人（`bot.ts`）

- 不再有"抢铃窗口"。机器人**不主动拍铃**（它看不到线下动作）。
- `challenge !== null` 且自己是投票人且没投过 → 返回 `challenge_vote { doubt: false }`（默认相信）。
- 其余同旧：轮到自己就按颜色 / 数字出牌，出不了就摸。

## 6. 桌面模拟版（`server/sim/*`，`bell_clash_sim_v1`）

**不改**。模拟版的 `sim:ring_bell` 只是记录谁先拍，没有旧规则的窗口逻辑。

## 7. 测试（`packages/games/bell-clash/tests/`）

改写 / 新增，每条一个 `test(...)`：

1. 任何人（非当前出牌者）都能拍铃；拍铃时 `turn_timeout` 被取消、`challenge_timeout` 被排上。
2. 拍铃打出的短语卡颜色与顶牌不同也被接受。
3. `hand[cardIndex]` 不是短语卡 → 拒绝；`challenge` 进行中再拍 → 拒绝。
4. 5 名投票人，2 人质疑后超时 → 成功：`discardTop` 是这张卡，`currentPlayerId` 是拍铃者，拍铃者手牌 −1。
5. 5 名投票人，第 3 人质疑时**立即**结算为拍错（不等超时）：卡回到原位，手牌 +1（罚摸），`currentPlayerId` 回到被打断的人。
6. 5 名投票人里 3 人投「有」→ 已不可能过半质疑 → **立即**结算成功。
7. `challenge` 进行中 `play_card` / `draw_card` 被拒。
8. 普通回合打出短语卡 → 不产生 `challenge`，回合转下家。
9. 摸牌自动打出短语卡 → 不产生 `challenge`。
10. 拍铃成功打出最后一张手牌 → `game_over`，拍铃者获胜。
11. 拍错时牌堆为空 → 不罚摸，不报错。
12. 视图：`challenge` 在公开视图里可见；其他人手牌仍不可见。
13. 机器人：`challenge` 中且自己是投票人 → `challenge_vote { doubt: false }` 且被 reducer 接受；不是投票人 → null；平时从不返回 `ring_bell`。
14. 契约套件（`contract.test.ts`）照旧全绿。

删掉只描述旧规则的测试（`rules.test.ts` 第 102、142 行附近两条、`botAction.test.ts` 162/188/218 三条），换成上面的新测试。

## 8. 合规与文档

- `packages/games/bell-clash/RULES_ORIGINAL.md`：「核心机制」第 3 条改写为新规则；「平台裁定项」加一条"质疑投票判定与 3 秒时限为平台裁定（原版靠线下目测）"；「配置」表 `bellSeconds` 换成 `challengeSeconds`（默认 3，范围 1–30）。
- `compliance/d1/game-admission.json` 里 `bell_clash_v1` 的 `digitalAdaptations`：把"按铃窗口计时""错误拍铃罚摸一张、无人拍铃计时器兜底"两句改写为新规则的说法。**不改** `rights` 段。
- 旧 room 里保存的 `bellSeconds` 配置：`parseBellClashConfig` 遇到 `bellSeconds` 时**忽略**（不报错），保证老房间能开局。

## 9. 客户端配套（在 T4 里做，这里只列清单）

- `BellClashGamePage.tsx`：删掉 `bellOpen` 相关分支；新增：铃随时可按 → 进入"挑卡"态 → 点短语卡发 `ring_bell { cardIndex }`；`challenge` 非空时显示亮卡 + 投票面板；自己是投票人时显示「有 / 没做过」两个按钮。
- `stage/deriveStageEvents.ts`：`bellOpened` 事件删掉；新增 `bellRung`、`challengeResolved { success }`。
- `stage/useBellClashStage.tsx` / `audioCues.ts`：对应音效与震动（拍铃 = 叮；成功 = 叮 + 上扬；拍错 = 低沉错误音 + 震动）。
