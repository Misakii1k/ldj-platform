/**
 * M3 对局会话服务测试：start_game / game_action / effect 落库 / 计时器消费 /
 * abort / return_to_lobby（SPEC §4.4、§5.8、§5.9、§10.3）。
 * 直接驱动 executor + 命令函数；不触碰 WebSocket。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, closeDb, type Db } from '../src/persistence/db.ts';
import { migrate } from '../src/persistence/migrator.ts';
import { RoomCommandExecutor, CommandError } from '../src/core/executor.ts';
import { applyJoinRoom } from '../src/core/commands/joinRoom.ts';
import { seedRoom } from './helpers/seedRoom.ts';
import { applyRoomCommand } from '../src/core/commands/roomCommand.ts';
import {
  applyGameAction,
  forfeitPlayers,
  getActiveSession,
  loadSessionState,
  type GameActionOutcome,
} from '../src/core/game/session.ts';
import { consumeDueTimer, TimerRunner } from '../src/core/game/timerRunner.ts';
import { getGameModule, DEFAULT_GAME_ID } from '../src/core/game/registry.ts';
import { GAME_CATALOG, getPlayableGameCatalogEntry } from '@ldj/shared';

interface Ctx {
  db: Db;
  executor: RoomCommandExecutor;
  roomId: string;
  hostId: string;
  playerIds: string[]; // 含房主，按加入顺序
}

let requestCounter = 0;
function nextReq(): string {
  return `greq-${++requestCounter}`;
}

/** 建房 + 补齐到 n 名在线玩家 */
async function setupRoom(playerCount: number, gameId = 'undercover'): Promise<Ctx> {
  const db = openDb({ path: ':memory:' });
  migrate(db);
  const executor = new RoomCommandExecutor(db);
  const seeded = seedRoom(db, { gameId, config: { gameConfig: {} } });
  const { roomId, roomCode, hostId } = seeded;
  const playerIds = [hostId];
  for (let i = 2; i <= playerCount; i++) {
    const joined = await executor.executeOnRoom({
      roomId,
      actorScope: `conn:p${i}`,
      requestId: nextReq(),
      handler: (tx) =>
        applyJoinRoom(tx, roomId, { roomCode, nickname: `玩家${i}`, asSpectator: false }),
    });
    playerIds.push(joined.outcome.playerId);
  }
  // 全员就绪（房间级"准备"机制：先准备再开局）
  db.prepare(`UPDATE room_members SET ready = 1 WHERE room_id = ? AND seat_role = 'player'`).run(roomId);
  return { db, executor, roomId, hostId, playerIds };
}

async function startGameAs(ctx: Ctx, actorId: string) {
  return ctx.executor.executeOnRoom({
    roomId: ctx.roomId,
    actorScope: 'conn:host',
    requestId: nextReq(),
    handler: (tx) => applyRoomCommand(tx, ctx.roomId, actorId, { command: 'start_game' }),
  });
}

async function action(ctx: Ctx, playerId: string, rawAction: unknown) {
  return ctx.executor.executeOnRoom({
    roomId: ctx.roomId,
    actorScope: `conn:${playerId}`,
    requestId: nextReq(),
    handler: (tx) => applyGameAction(tx, ctx.roomId, playerId, rawAction, nextReq()),
  });
}

function roomStatus(db: Db, roomId: string): string {
  return (db.prepare('SELECT status FROM rooms WHERE id = ?').get(roomId) as { status: string })
    .status;
}

function snapshotState(db: Db, roomId: string): Record<string, unknown> {
  const session = getActiveSession(db, roomId);
  assert.ok(session, '应存在活动对局');
  return loadSessionState(session).state as Record<string, unknown>;
}

async function assertCommandError(fn: () => Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(fn, (err: unknown) => {
    assert.ok(err instanceof CommandError, `应抛 CommandError，实际 ${String(err)}`);
    assert.equal(err.code, code);
    return true;
  });
}

test('start_game：会话落库、房间 IN_GAME、begin 已投递并挂起看词计时器', async () => {
  const ctx = await setupRoom(5);
  try {
    const started = await startGameAs(ctx, ctx.hostId);
    const outcome = started.outcome.gameStarted;
    assert.ok(outcome);
    assert.equal(outcome.moduleId, DEFAULT_GAME_ID);
    assert.equal(outcome.begin.roomSeq, started.roomSeq);
    assert.equal(outcome.begin.versioned, true);
    assert.equal(outcome.begin.rulesetId, 'undercover_classic_v1');
    assert.equal(outcome.begin.viewVersion, 1);
    assert.deepEqual([...outcome.playerIds].sort(), [...ctx.playerIds].sort());
    assert.equal(roomStatus(ctx.db, ctx.roomId), 'IN_GAME');

    const session = getActiveSession(ctx.db, ctx.roomId);
    assert.ok(session);
    assert.equal(session.status, 'ACTIVE');
    assert.equal(session.last_seq, 1); // begin 已写事件流水
    const state = snapshotState(ctx.db, ctx.roomId);
    assert.equal(state.phase, 'word_reveal');
    assert.ok((state.deadlineAt as number) > 0);

    // begin 的 schedule_timer effect 已落 timers 表
    const timer = ctx.db
      .prepare(`SELECT status, deadline_at FROM timers WHERE session_id = ? AND timer_id = 'reveal'`)
      .get(session.id) as { status: string; deadline_at: number };
    assert.equal(timer.status, 'pending');
    assert.equal(timer.deadline_at, state.deadlineAt);

    // 重复开局被拒
    await assertCommandError(() => startGameAs(ctx, ctx.hostId), 'ACTION_NOT_ALLOWED');
  } finally {
    closeDb(ctx.db);
  }
});

test('start_game 前置：非房主 NOT_AUTHORIZED；人数不足/离线玩家不计入', async () => {
  const ctx = await setupRoom(4);
  try {
    await assertCommandError(() => startGameAs(ctx, ctx.playerIds[1]!), 'NOT_AUTHORIZED');
    // 一名玩家断线 → 在线仅 3 人，低于 minPlayers
    ctx.db
      .prepare(`UPDATE room_members SET connection_status = 'DISCONNECTED_RESERVED' WHERE player_id = ?`)
      .run(ctx.playerIds[3]!);
    await assertCommandError(() => startGameAs(ctx, ctx.hostId), 'ACTION_NOT_ALLOWED');
  } finally {
    closeDb(ctx.db);
  }
});

test('game_action：确认看词全员完成进入发言；非法动作/无对局稳定报错', async () => {
  const ctx = await setupRoom(4);
  try {
    // 无对局时 game_action 被拒
    await assertCommandError(
      () => action(ctx, ctx.hostId, { type: 'confirm_word' }),
      'ACTION_NOT_ALLOWED',
    );
    await startGameAs(ctx, ctx.hostId);

    // 格式非法 → INVALID_MESSAGE
    await assertCommandError(() => action(ctx, ctx.hostId, { type: 'no_such' }), 'INVALID_MESSAGE');

    for (const id of ctx.playerIds) await action(ctx, id, { type: 'confirm_word' });
    const state = snapshotState(ctx.db, ctx.roomId);
    assert.equal(state.phase, 'speaking');

    const session = getActiveSession(ctx.db, ctx.roomId);
    assert.ok(session);
    // 全员确认后 reveal 计时器被 cancel，第一位发言计时器 pending
    const reveal = ctx.db
      .prepare(`SELECT status FROM timers WHERE session_id = ? AND timer_id = 'reveal'`)
      .get(session.id) as { status: string };
    assert.equal(reveal.status, 'cancelled');
    const pending = ctx.db
      .prepare(`SELECT COUNT(*) AS n FROM timers WHERE session_id = ? AND status = 'pending'`)
      .get(session.id) as { n: number };
    assert.equal(pending.n, 1);
  } finally {
    closeDb(ctx.db);
  }
});

test('对局闭环：投票淘汰至卧底胜/平民胜 → FINISHED + game_results + POST_GAME', async () => {
  const ctx = await setupRoom(4);
  try {
    await startGameAs(ctx, ctx.hostId);
    for (const id of ctx.playerIds) await action(ctx, id, { type: 'confirm_word' });

    // 发言到投票
    let state = snapshotState(ctx.db, ctx.roomId);
    while (state.phase === 'speaking') {
      const order = state.speakingOrder as string[];
      const idx = state.currentSpeakerIndex as number;
      await action(ctx, order[idx]!, { type: 'finish_speech' });
      state = snapshotState(ctx.db, ctx.roomId);
    }
    assert.equal(state.phase, 'voting');

    // 全员投卧底 → 平民胜
    const players = state.players as Record<string, { role: string }>;
    const spy = Object.entries(players).find(([, p]) => p.role === 'undercover')![0];
    const civs = Object.keys(players).filter((id) => id !== spy);
    for (const v of civs) await action(ctx, v, { type: 'cast_vote', targetPlayerId: spy });
    await action(ctx, spy, { type: 'cast_vote', targetPlayerId: civs[0]! });

    // vote_result 展示期由计时器推进：直接消费到期计时器（模拟 5 秒后）
    const session = getActiveSession(ctx.db, ctx.roomId);
    assert.ok(session);
    const timerRow = ctx.db
      .prepare(`SELECT timer_id FROM timers WHERE session_id = ? AND status = 'pending'`)
      .get(session.id) as { timer_id: string };
    ctx.db
      .prepare(`UPDATE timers SET deadline_at = ? WHERE session_id = ? AND timer_id = ?`)
      .run(Date.now() - 1, session.id, timerRow.timer_id);
    const fired = await ctx.executor.executeInternal({
      roomId: ctx.roomId,
      handler: (tx) => consumeDueTimer(tx, session.id, timerRow.timer_id),
    });
    assert.ok(fired);
    assert.equal(fired.outcome.finished, true);
    assert.equal(fired.outcome.aborted, false);

    // 会话 FINISHED、结果落库、房间 POST_GAME、无残留 pending 计时器
    const done = ctx.db
      .prepare('SELECT status FROM game_sessions WHERE id = ?')
      .get(session.id) as { status: string };
    assert.equal(done.status, 'FINISHED');
    const result = ctx.db
      .prepare('SELECT result_json FROM game_results WHERE session_id = ?')
      .get(session.id) as { result_json: string };
    assert.equal((JSON.parse(result.result_json) as { winner: string }).winner, 'civilian');
    assert.equal(roomStatus(ctx.db, ctx.roomId), 'POST_GAME');
    const leftover = ctx.db
      .prepare(`SELECT COUNT(*) AS n FROM timers WHERE session_id = ? AND status = 'pending'`)
      .get(session.id) as { n: number };
    assert.equal(leftover.n, 0);

    // 结束后 game_action 被拒；return_to_lobby 回大厅且成员保留
    await assertCommandError(
      () => action(ctx, ctx.hostId, { type: 'confirm_word' }),
      'ACTION_NOT_ALLOWED',
    );
    await ctx.executor.executeOnRoom({
      roomId: ctx.roomId,
      actorScope: 'conn:host',
      requestId: nextReq(),
      handler: (tx) => applyRoomCommand(tx, ctx.roomId, ctx.hostId, { command: 'return_to_lobby' }),
    });
    assert.equal(roomStatus(ctx.db, ctx.roomId), 'LOBBY');
    const members = ctx.db
      .prepare(`SELECT COUNT(*) AS n FROM room_members WHERE room_id = ?`)
      .get(ctx.roomId) as { n: number };
    assert.equal(members.n, 4); // FR-RESULT-004

    // 再来一局：新 SessionId 新种子（FR-RESULT-003）—— return_to_lobby 重置了全员准备，重新就绪
    ctx.db.prepare(`UPDATE room_members SET ready = 1 WHERE room_id = ?`).run(ctx.roomId);
    const restarted = await startGameAs(ctx, ctx.hostId);
    const again = getActiveSession(ctx.db, ctx.roomId);
    assert.ok(again);
    assert.notEqual(again.id, session.id);
    assert.notEqual(again.seed, session.seed);
    assert.ok(restarted.outcome.gameStarted);
  } finally {
    closeDb(ctx.db);
  }
});

test('abort_game：仅房主可终止；会话 ABORTED 不写战绩；IN_GAME 踢参局玩家被拒', async () => {
  const ctx = await setupRoom(5);
  try {
    await startGameAs(ctx, ctx.hostId);
    const session = getActiveSession(ctx.db, ctx.roomId);
    assert.ok(session);

    // FR-HOST-002：IN_GAME 不能踢出仍参与本局的玩家
    await assertCommandError(
      () =>
        ctx.executor.executeOnRoom({
          roomId: ctx.roomId,
          actorScope: 'conn:host',
          requestId: nextReq(),
          handler: (tx) =>
            applyRoomCommand(tx, ctx.roomId, ctx.hostId, {
              command: 'kick_player',
              targetPlayerId: ctx.playerIds[1]!,
            }),
        }),
      'ACTION_NOT_ALLOWED',
    );

    await ctx.executor.executeOnRoom({
      roomId: ctx.roomId,
      actorScope: 'conn:host',
      requestId: nextReq(),
      handler: (tx) => applyRoomCommand(tx, ctx.roomId, ctx.hostId, { command: 'abort_game' }),
    });
    const aborted = ctx.db
      .prepare('SELECT status FROM game_sessions WHERE id = ?')
      .get(session.id) as { status: string };
    assert.equal(aborted.status, 'ABORTED');
    assert.equal(roomStatus(ctx.db, ctx.roomId), 'POST_GAME');
    // FR-RESULT-002：不写正常战绩
    const results = ctx.db
      .prepare('SELECT COUNT(*) AS n FROM game_results WHERE session_id = ?')
      .get(session.id) as { n: number };
    assert.equal(results.n, 0);
    // 计时器全部取消
    const pending = ctx.db
      .prepare(`SELECT COUNT(*) AS n FROM timers WHERE session_id = ? AND status = 'pending'`)
      .get(session.id) as { n: number };
    assert.equal(pending.n, 0);
  } finally {
    closeDb(ctx.db);
  }
});

test('forfeitPlayers：席位保留期满批量退出进入对局；全员退出 ABORTED', async () => {
  const ctx = await setupRoom(4);
  try {
    await startGameAs(ctx, ctx.hostId);
    const out = await ctx.executor.executeInternal({
      roomId: ctx.roomId,
      handler: (tx) => forfeitPlayers(tx, ctx.roomId, ctx.playerIds),
    });
    assert.ok(out);
    assert.equal(out.outcome.finished, true);
    assert.equal(out.outcome.aborted, true); // 全员退出不虚构胜方（§6.7）
    const session = ctx.db
      .prepare('SELECT status FROM game_sessions WHERE room_id = ?')
      .get(ctx.roomId) as { status: string };
    assert.equal(session.status, 'ABORTED');
    assert.equal(roomStatus(ctx.db, ctx.roomId), 'POST_GAME');
  } finally {
    closeDb(ctx.db);
  }
});

test('TimerRunner：到期计时器自动消费并回调；重复/取消不再触发', async () => {
  const ctx = await setupRoom(4);
  try {
    const started = await startGameAs(ctx, ctx.hostId);
    const startedRoomSeq = started.roomSeq;
    const session = getActiveSession(ctx.db, ctx.roomId);
    assert.ok(session);
    // 把看词计时器改成立即到期
    ctx.db
      .prepare(`UPDATE timers SET deadline_at = ? WHERE session_id = ? AND timer_id = 'reveal'`)
      .run(Date.now() - 1, session.id);

    const outcomes: GameActionOutcome[] = [];
    const runner = new TimerRunner(ctx.db, ctx.executor, (_roomId, outcome) => {
      outcomes.push(outcome);
    });
    runner.start();
    // 等待 runner 消费（reveal_timeout → speaking）
    for (let i = 0; i < 50 && outcomes.length === 0; i++) {
      await new Promise((r) => setTimeout(r, 20));
    }
    runner.stop();
    assert.ok(outcomes.length >= 1, '计时器应已消费');
    const timerOutcome = outcomes[0]!;
    const roomSeq = (ctx.db.prepare('SELECT seq FROM rooms WHERE id = ?').get(ctx.roomId) as { seq: number }).seq;
    assert.equal(timerOutcome.roomSeq, roomSeq);
    assert.ok(timerOutcome.roomSeq > startedRoomSeq, '计时动作必须推进真实 roomSeq');
    assert.equal(timerOutcome.versioned, true);
    const state = snapshotState(ctx.db, ctx.roomId);
    assert.equal(state.phase, 'speaking');
    const reveal = ctx.db
      .prepare(`SELECT status FROM timers WHERE session_id = ? AND timer_id = 'reveal'`)
      .get(session.id) as { status: string };
    assert.equal(reveal.status, 'consumed');

    // 已消费的计时器再手动触发无效果
    const again = await ctx.executor.executeInternal({
      roomId: ctx.roomId,
      handler: (tx) => consumeDueTimer(tx, session.id, 'reveal'),
    });
    assert.equal(again, null);
  } finally {
    closeDb(ctx.db);
  }
});

test('注册表：默认游戏可查、manifest 一致', () => {
  const module = getGameModule(DEFAULT_GAME_ID);
  assert.ok(module);
  assert.equal(module.manifest.id, DEFAULT_GAME_ID);
  assert.ok(module.manifest.minPlayers >= 2);
});

test('注册表：上架游戏可建房（playable + 模块存在）', async () => {
  const { listGameManifests } = await import('../src/core/game/registry.ts');
  const manifests = listGameManifests();
  assert.deepEqual(manifests.map((manifest) => manifest.id), ['undercover', 'uno', 'landlord', 'werewolf', 'durian', 'loveletter', 'cheese-thief', 'goose-relay', 'night-testimony', 'bell-clash', 'echo-judge']);
  const playable = GAME_CATALOG.filter((game) => String(game.availability) === 'playable');
  assert.deepEqual(playable.map((game) => game.id).sort(), ['bell-clash', 'cheese-thief', 'durian', 'echo-judge', 'goose-relay', 'landlord', 'loveletter', 'night-testimony', 'undercover', 'uno', 'werewolf']);
  // 每款 playable 游戏都必须同时存在注册模块（create_room 准入依赖两者同时满足）
  for (const game of playable) {
    assert.ok(getGameModule(game.id), `${game.id} 应注册模块以支持建房`);
    assert.equal(getPlayableGameCatalogEntry(game.id)?.id, game.id);
  }
  assert.equal(getPlayableGameCatalogEntry('uno')?.id, 'uno');
});

test('forfeitPlayers：echo-judge 对局中退出能被模块处理（不抛 Invalid discriminator）', async () => {
  const ctx = await setupRoom(4, 'echo-judge');
  try {
    // 用 echo-judge 的默认配置开局
    const started = await ctx.executor.executeOnRoom({
      roomId: ctx.roomId,
      actorScope: 'conn:host',
      requestId: nextReq(),
      handler: (tx) =>
        applyRoomCommand(tx, ctx.roomId, ctx.hostId, {
          command: 'start_game',
          gameConfig: { rulesetId: 'echo_judge_v1', answerSeconds: 1, judgmentSeconds: 1 },
        }),
    });
    assert.ok(started.outcome.gameStarted, `echo-judge 应能开局：${JSON.stringify(started.outcome)}`);
    assert.equal(started.outcome.gameStarted.moduleId, 'echo-judge');

    // 席位保留期退出：投递 player_forfeited 给模块（sweep 的入口）
    const out = await ctx.executor.executeInternal({
      roomId: ctx.roomId,
      handler: (tx) => forfeitPlayers(tx, ctx.roomId, [ctx.playerIds[1]!, ctx.playerIds[2]!]),
    });
    // 关键断言：forfeit 动作必须被模块接受（不再抛 Invalid discriminator），对局结束或继续均合法
    assert.ok(out, 'forfeit 应产生结果');
    assert.equal(out.outcome.finished, true, '退出导致对局结束');
  } finally {
    closeDb(ctx.db);
  }
});
