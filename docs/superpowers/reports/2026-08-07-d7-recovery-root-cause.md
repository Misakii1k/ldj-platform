# D7-A 结果：恢复竞态根因结论与加固

> 日期：2026-08-07。对应 D7 计划 `docs/superpowers/plans/2026-08-07-d7-recovery-frontend-g1-plan.md`。

## 1. 现象

D6 收尾期间，完整浏览器套件 `--retries=0` 下偶发（约 10%）两个停留态：

- 「正在恢复房间…」：`me` 已恢复但 `room === null`。
- 「对局已开始 / 正在同步牌局数据…」：`room.status === 'IN_GAME'` 但 `game === null`。

两者都在 20 秒等待期内无法自愈；D6 已加 resume 看门狗（ACK 后 1 秒若停留则补一次 `resync`）并多轮验证通过，但**根因未完全解释**。D7-A 目标是把机制查清并加固。

## 2. 取证

用浏览器端逐帧探针（`processEnvelope` 前置日志）在失败现场捕获帧序：

```
recv welcome       seqState=-  hasRoom=false hasGame=false
recv ack 5         seqState=-  hasRoom=false hasGame=false   → roomSeq=5
recv room_snapshot 5  seqState=5  hasRoom=false hasGame=false → room 仍未设置
recv game_state 5     seqState=5  hasRoom=false hasGame=false → game 仍未设置
recv chat_batch       seqState=5  hasRoom=TRUE  hasGame=false → room 已设置但无日志
```

异常点：`room` 变 true 却没有对应的 `room_snapshot` 处理日志（`chat_batch` 之前），且 `game` 永久缺失。同签名也出现在狼人桌用例（帧序一致，间隔 0.3s）。

## 3. 根因分析（诚实结论）

服务端 payload 形状已逐一核对，**排除解析层不匹配**：

- `buildRoomSnapshot`（`packages/server/src/core/snapshot.ts:103-144`）恒返回 `{roomCode, status, seq:number, gameId, config, members:array}`，满足 `parseRoomSnapshot` 全部要求（`seq` 必为 number、`members` 必为 array）。
- `buildGameStatePayload`（`packages/server/src/core/game/views.ts:31-91`）恒返回合法 payload，满足 `parseGameStatePayload` 要求。

客户端 reducer 中 `room` 的唯一写入者是 `room_snapshot` 分支，`game` 的唯一写入者是 `game_state` 分支（均有单元测试覆盖）。因此取证帧序与 reducer 代码**在正常单连接下矛盾**，候选解释（按可能性排序）：

1. **传输/主线程争用下的帧丢失**：失败现场存在 8.1 秒无任何事件缺口（smoke 用例），说明浏览器主线程在该窗口严重阻塞；被阻塞期间到达的帧可能被浏览器合并/丢弃，探针日志本身也不可靠（`room` 翻转恰发生在该缺口内）。这是最符合全部证据的解释：一次性的帧丢失 + 静止房间无后续补位帧。
2. **`parseServerEnvelope` 前置丢弃**：到达但未过校验的帧在进入 reducer 前被丢弃（无日志），其中若含唯一的 `game_state`，则 `game` 永久缺失。
3. **`game_state` 陈旧丢弃（reducer 静默路径）**：`envelope.roomSeq < state.roomSeq` 时旧帧被静默丢弃且不触发 resync——若该帧是唯一视角帧，房间静止时永久缺失视图。

无法 100% 钉死单一触发点：探针日志自身在负载下不可靠（缺口 + 缺失日志），无法区分上述机制。**结论按机制级别如实记录**：恢复期间唯一视角帧经"传输丢失 / 前置校验丢弃 / 陈旧丢弃"任一路径消失后，静止房间不再有补位帧，客户端停留在缺视图状态。

## 4. 加固（本阶段改动）

针对上述所有机制做防御性自愈，任一帧丢失路径都会主动请求权威重同步：

| 位置 | 改动 |
| --- | --- |
| `envelopeReducer.ts` `room_snapshot` | payload 坏损从静默改为 `send_resync` |
| `envelopeReducer.ts` `game_state` | payload 坏损从静默改为 `send_resync` |
| `envelopeReducer.ts` `game_state` | 陈旧丢弃（`roomSeq < state.roomSeq`）从静默改为 `send_resync`（与 `room_snapshot` 陈旧分支一致） |
| `ConnectionContext.tsx` resume 看门狗 | （D6 已加）覆盖 `room === null` 与 `IN_GAME + game === null`，ACK 后 1 秒停留即补 `resync` |
| socket 非 OPEN 时的 resync 丢弃 | 不新增代码：`connect()` 重置 `resumeAttemptedRef`，断线重连后会重新 `resume_room`，该路径自愈 |
| StrictMode 双连接 | 仅开发模式双挂载；生产构建/E2E 不受影响，无需改动 |

新增/更新单元测试（`packages/client/tests/envelopeReducer.test.ts`，9/9 绿）：

- 旧 `game_state` 不覆盖新视角，且现在主动 `send_resync`（原断言 `effects: []` 已更新）。
- `room_snapshot` payload 坏损 → `send_resync`。
- `game_state` payload 坏损 → `send_resync`。

## 5. 验证

- `npm run typecheck` / `npm run lint`：PASS。
- 客户端 reducer 定向测试：9/9 PASS。
- 全套浏览器 `--retries=0`：多轮全绿（记录于 D7 结果报告）。

## 6. 遗留说明

机制层面已闭环（任一丢失路径均可自愈），但"传输丢失 vs 前置丢弃 vs 陈旧丢弃"的精确触发点受探针自身在负载下不可靠的限制未能 100% 区分。若未来再出现恢复类偶发，优先在浏览器主线程阻塞方向取证（Performance trace），而非再依赖逐帧 console 探针。

**已知限制（D7-A 验证中复现，如实记录）**：高负载下还出现过「浏览器停在 LOBBY，但房间实际已 IN_GAME」的停留态（开局广播丢失）。该态下 `room !== null` 且 `status !== 'IN_GAME'`，resume 看门狗不会触发（无心跳，客户端无法自知陈旧）；这是现有看门狗边界之外的已知缺口，修复需要心跳/主动轮询机制，超出 D7-A 范围，留作后续工程项记录。
