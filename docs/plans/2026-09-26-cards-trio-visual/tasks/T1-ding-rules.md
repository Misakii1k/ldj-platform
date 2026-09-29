# T1 · Ding 服务端规则重写

**规格**：`contracts/ding-rules.md`（全部照做）。本任务**不碰客户端画面**，只改服务端、测试、解析器、文档。

## 步骤

1. `packages/games/bell-clash/server/types.ts`：按 `ding-rules.md` §2 改状态、配置、事件、动作类型。更新文件头注释里"拍铃"的描述。
2. `server/rules.ts`：
   - `parseBellClashConfig`：`challengeSeconds`（默认 3，1–30）；遇到旧的 `bellSeconds` 键**忽略不报错**。
   - `parseBellClashAction`：`ring_bell` 新增 `cardIndex`；新增 `challenge_vote { playerId, doubt }`、系统动作 `challenge_timeout`；删掉 `resolve_bell`。
   - `reduceBellClashState`：按 §3 实现；删掉 `play_card` / `draw_card` 里"短语卡开窗口"两段；`play_card` / `draw_card` 在 `challenge !== null` 时拒绝。
   - 新增 `scheduleChallengeTimeout`（照 `scheduleBellTimeout` 的写法，`deadlineKind = 'challenge'`），删掉 `scheduleBellTimeout`。
   - `assertBellClashInvariants`：删掉"按铃窗口应挂在短语卡上"；新增：`challenge` 非空时 `claimantId` 在局、`card.kind === 'phrase'`、`doubts ∪ confirms ⊆ voters`、`claimantId ∉ voters`。
   - `player_forfeited`：若退出的是拍铃者 → 卡作废（不放回）、清 `challenge`、回合给 `interruptedPlayerId`；若退出的是投票人 → 从 `voters/doubts/confirms` 删掉后重新判断是否可提前结算。
3. `server/views.ts`：按 §4 改公开视图 schema 与构建函数。
4. `server/module.ts`：`PLAYER_ACTIONS` 加 `challenge_vote`。
5. `server/bot.ts`：按 §5。
6. 客户端解析器 `packages/client/src/game/bell-clash/types.ts`：键白名单、类型、校验同步（**只改解析器**，页面在 T4 改；为了让 typecheck 过，`BellClashGamePage.tsx` / `stage/*` 里引用 `bellOpen` 的地方先做最小改动：把 `view.bellOpen` 换成 `view.challenge !== null`，`bellClaimantId` 换成 `view.challenge?.claimantId ?? null`，`ring_bell` 调用补 `cardIndex: 0` 并加 `// T4 重做` 注释）。
7. 测试：按 §7 改写 / 新增，删掉旧规则的测试。
8. 文档合规：按 §8 改 `RULES_ORIGINAL.md` 与 `compliance/d1/game-admission.json`。
9. `e2e/game-viewport-contract.spec.ts` 里 bell-clash 用例的 `config` 把 `bellSeconds: 60` 换成 `challengeSeconds: 30`（保证截图时窗口不会先关）。

## 完成判据

- `npm test` 里 bell-clash 相关测试全部通过，数量 ≥ 旧的数量；`ding-rules.md` §7 的 14 条每条都能在测试文件里找到对应 `test(...)`（在 STATUS 里列出"条目 → 测试名"对照表）。
- `grep -rn "bellOpen\|bellClaimantId\|bellSeconds\|resolve_bell" packages/games/bell-clash packages/client/src/game/bell-clash` 只剩 `parseBellClashConfig` 里忽略旧键的那一处（和 T4 待重做注释）。
- 机器门全绿（README §2.3）。

## 白名单

```
packages/games/bell-clash/server/types.ts
packages/games/bell-clash/server/rules.ts
packages/games/bell-clash/server/views.ts
packages/games/bell-clash/server/module.ts
packages/games/bell-clash/server/bot.ts
packages/games/bell-clash/tests/*.test.ts
packages/games/bell-clash/RULES_ORIGINAL.md
packages/client/src/game/bell-clash/types.ts
packages/client/src/game/bell-clash/BellClashGamePage.tsx   （仅最小改动）
packages/client/src/game/bell-clash/stage/*.ts*              （仅最小改动）
compliance/d1/game-admission.json                            （仅 bell_clash_v1 的 digitalAdaptations）
e2e/game-viewport-contract.spec.ts                           （仅 bell-clash 用例 config）
```

**不许动**：`server/sim/**`（桌面模拟版）。
