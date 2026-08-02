import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leaveRoomPayloadSchema } from '@ldj/shared';
import { openDb, closeDb, type Db } from '../src/persistence/db.ts';
import { migrate } from '../src/persistence/migrator.ts';
import { RoomCommandExecutor, CommandError } from '../src/core/executor.ts';
import { applyJoinRoom } from '../src/core/commands/joinRoom.ts';
import { seedRoom } from './helpers/seedRoom.ts';
import { applyRoomCommand } from '../src/core/commands/roomCommand.ts';
import { applyLeaveRoom } from '../src/core/commands/leaveRoom.ts';
import { applyExpireReservations } from '../src/core/commands/presence.ts';
import { applyGameAction } from '../src/core/game/session.ts';
import { buildGameStatePayload, type GameStatePayload } from '../src/core/game/views.ts';
import { rankValue, type LandlordCard } from '../../games/landlord/server/cards.ts';
import type { LandlordPlayerView, LandlordPublicView, LandlordState } from '../../games/landlord/server/module.ts';

interface Ctx {
  db: Db;
  executor: RoomCommandExecutor;
  roomId: string;
  roomCode: string;
  hostId: string;
  playerIds: string[];
}

let requestCounter = 0;
function nextReq(): string {
  return `landlord-flow-${++requestCounter}`;
}

async function setupLandlordRoom(): Promise<Ctx> {
  const db = openDb({ path: ':memory:' });
  migrate(db);
  const executor = new RoomCommandExecutor(db);
  const seeded = seedRoom(db, { gameId: 'landlord' });
  const { roomId, roomCode } = seeded;
  const playerIds = [seeded.hostId];
  for (let i = 2; i <= 3; i += 1) {
    const joined = await executor.executeOnRoom({
      roomId,
      actorScope: `conn:p${i}`,
      requestId: nextReq(),
      handler: (tx) => applyJoinRoom(tx, roomId, { roomCode, nickname: `玩家${i}`, asSpectator: false }),
    });
    playerIds.push(joined.outcome.playerId);
  }
  // 全员就绪（房间级"准备"机制：先准备再开局）
  db.prepare(`UPDATE room_members SET ready = 1 WHERE room_id = ? AND seat_role = 'player'`).run(roomId);
  return { db, executor, roomId, roomCode, hostId: playerIds[0]!, playerIds };
}

async function startLandlord(ctx: Ctx): Promise<void> {
  const started = await ctx.executor.executeOnRoom({
    roomId: ctx.roomId,
    actorScope: `conn:${ctx.hostId}`,
    requestId: nextReq(),
    handler: (tx) => applyRoomCommand(tx, ctx.roomId, ctx.hostId, { command: 'start_game' }),
  });
  assert.equal(started.outcome.gameStarted?.moduleId, 'landlord');
}

async function gameAction(ctx: Ctx, playerId: string, rawAction: unknown): Promise<void> {
  await ctx.executor.executeOnRoom({
    roomId: ctx.roomId,
    actorScope: `conn:${playerId}`,
    requestId: nextReq(),
    handler: (tx) => applyGameAction(tx, ctx.roomId, playerId, rawAction, nextReq()),
  });
}

function latestSession(ctx: Ctx): { status: string; snapshot_json: string } {
  return ctx.db
    .prepare(
      `SELECT status, snapshot_json FROM game_sessions WHERE room_id = ?
       ORDER BY created_at DESC, rowid DESC LIMIT 1`,
    )
    .get(ctx.roomId) as { status: string; snapshot_json: string };
}

function state(ctx: Ctx): LandlordState {
  return JSON.parse(latestSession(ctx).snapshot_json) as LandlordState;
}

function playerView(ctx: Ctx, playerId: string): LandlordPlayerView {
  const payload = buildGameStatePayload(ctx.db, ctx.roomId, playerId) as GameStatePayload | null;
  assert.ok(payload, 'game_state should exist while room is IN_GAME/POST_GAME');
  assert.equal(payload.moduleId, 'landlord');
  assert.equal(payload.role, 'player');
  return payload.view as LandlordPlayerView;
}

function spectatorView(ctx: Ctx): LandlordPublicView {
  const payload = buildGameStatePayload(ctx.db, ctx.roomId, null) as GameStatePayload | null;
  assert.ok(payload, 'spectator game_state should exist while room is IN_GAME/POST_GAME');
  assert.equal(payload.moduleId, 'landlord');
  assert.equal(payload.role, 'spectator');
  return payload.view as LandlordPublicView;
}

function countMap(view: LandlordPublicView): Record<string, number> {
  return Object.fromEntries(view.players.map((p) => [p.playerId, p.handCount]));
}

function assertGameStateCounts(ctx: Ctx): void {
  const current = state(ctx);
  for (const playerId of ctx.playerIds) {
    const view = playerView(ctx, playerId);
    const counts = countMap(view);
    for (const id of ctx.playerIds) {
      assert.equal(counts[id], current.hands[id]?.length ?? 0, `game_state handCount for ${id} should match state`);
    }
    assert.equal(view.me?.hand.length, current.hands[playerId]?.length ?? 0, 'own private hand should align with count source');
  }
  const publicCounts = countMap(spectatorView(ctx));
  for (const id of ctx.playerIds) {
    assert.equal(publicCounts[id], current.hands[id]?.length ?? 0, `spectator handCount for ${id} should match state`);
  }
}

function chooseBeatingSingle(cards: readonly LandlordCard[], mainRank: number): LandlordCard | undefined {
  return cards.find((card) => rankValue(card.rank) > mainRank);
}

test('斗地主服务端流程：底牌、handCount、出牌/过牌和结束状态通过 game_state 保持一致', async () => {
  const ctx = await setupLandlordRoom();
  try {
    await startLandlord(ctx);
    assert.deepEqual(countMap(playerView(ctx, ctx.hostId)), {
      [ctx.playerIds[0]!]: 17,
      [ctx.playerIds[1]!]: 17,
      [ctx.playerIds[2]!]: 17,
    });
    assert.equal(spectatorView(ctx).bottomCards.length, 0, '叫地主前公开视图不应泄露底牌');

    await gameAction(ctx, ctx.hostId, { type: 'bid_score', score: 3 });
    assert.deepEqual(countMap(playerView(ctx, ctx.hostId)), {
      [ctx.playerIds[0]!]: 20,
      [ctx.playerIds[1]!]: 17,
      [ctx.playerIds[2]!]: 17,
    });
    assert.equal(spectatorView(ctx).bottomCards.length, 3, '地主确定后公开底牌');
    assertGameStateCounts(ctx);

    const landlordFirst = state(ctx).hands[ctx.hostId]![0]!;
    await gameAction(ctx, ctx.hostId, { type: 'play_combo', cardIds: [landlordFirst.id] });
    assert.deepEqual(countMap(playerView(ctx, ctx.playerIds[1]!)), {
      [ctx.playerIds[0]!]: 19,
      [ctx.playerIds[1]!]: 17,
      [ctx.playerIds[2]!]: 17,
    });
    assert.equal(state(ctx).currentPlayerId, ctx.playerIds[1]);

    await gameAction(ctx, ctx.playerIds[1]!, { type: 'pass_turn' });
    assert.equal(state(ctx).passCount, 1);
    assert.equal(state(ctx).currentPlayerId, ctx.playerIds[2]);
    await gameAction(ctx, ctx.playerIds[2]!, { type: 'pass_turn' });
    assert.equal(state(ctx).passCount, 0);
    assert.equal(state(ctx).currentTrick, null);
    assert.equal(state(ctx).currentPlayerId, ctx.hostId);
    assertGameStateCounts(ctx);

    let guard = 0;
    while (state(ctx).phase !== 'game_over' && guard < 240) {
      guard += 1;
      const before = state(ctx);
      const playerId = before.currentPlayerId;
      assert.ok(playerId, 'playing phase should have a current player');
      if (!before.currentTrick) {
        await gameAction(ctx, playerId, { type: 'play_combo', cardIds: [before.hands[playerId]![0]!.id] });
      } else {
        const beating = chooseBeatingSingle(before.hands[playerId]!, before.currentTrick.combo.mainRank);
        await gameAction(ctx, playerId, beating ? { type: 'play_combo', cardIds: [beating.id] } : { type: 'pass_turn' });
      }
      assertGameStateCounts(ctx);
    }

    const finalState = state(ctx);
    assert.equal(finalState.phase, 'game_over');
    assert.equal(finalState.currentPlayerId, null, '结束后服务端不再暴露旧回合指针');
    assert.ok(finalState.winnerId);
    assert.equal(finalState.hands[finalState.winnerId!]!.length, 0);
    assert.equal(latestSession(ctx).status, 'FINISHED');
    const finalView = playerView(ctx, finalState.winnerId!);
    assert.equal(finalView.phase, 'game_over');
    assert.equal(finalView.players.find((p) => p.playerId === finalState.winnerId)?.handCount, 0);
    await assert.rejects(
      () => gameAction(ctx, finalState.winnerId!, { type: 'pass_turn' }),
      (error: unknown) => {
        assert.ok(error instanceof CommandError);
        assert.equal(error.code, 'ACTION_NOT_ALLOWED');
        return true;
      },
    );
  } finally {
    closeDb(ctx.db);
  }
});

test('斗地主牌局退出复用通用 leave_room 语义：牌局中保留席位而不是删除或新增游戏内命令', async () => {
  const ctx = await setupLandlordRoom();
  try {
    assert.equal(leaveRoomPayloadSchema.safeParse({}).success, true);
    assert.equal(leaveRoomPayloadSchema.safeParse({ gameAction: 'leave' }).success, false);
    await startLandlord(ctx);
    await gameAction(ctx, ctx.hostId, { type: 'bid_score', score: 3 });
    const leavingPlayer = ctx.playerIds[1]!;
    const before = state(ctx);

    const left = await ctx.executor.executeOnRoom({
      roomId: ctx.roomId,
      actorScope: `conn:${leavingPlayer}`,
      requestId: nextReq(),
      handler: (tx) => applyLeaveRoom(tx, ctx.roomId, leavingPlayer),
    });

    assert.equal(left.outcome.mode, 'reserved');
    const member = ctx.db
      .prepare('SELECT connection_status, seat_role, reserved_until FROM room_members WHERE room_id = ? AND player_id = ?')
      .get(ctx.roomId, leavingPlayer) as { connection_status: string; seat_role: string; reserved_until: number | null };
    assert.equal(member.connection_status, 'DISCONNECTED_RESERVED');
    assert.equal(member.seat_role, 'player');
    assert.ok((member.reserved_until ?? 0) > 0);
    assert.deepEqual(countMap(playerView(ctx, ctx.hostId)), {
      [ctx.playerIds[0]!]: before.hands[ctx.playerIds[0]!]!.length,
      [ctx.playerIds[1]!]: before.hands[ctx.playerIds[1]!]!.length,
      [ctx.playerIds[2]!]: before.hands[ctx.playerIds[2]!]!.length,
    });
    assert.equal(left.outcome.snapshot.members.find((m) => m.playerId === leavingPlayer)?.connectionStatus, 'DISCONNECTED_RESERVED');
    ctx.db
      .prepare('UPDATE room_members SET reserved_until = ? WHERE room_id = ? AND player_id = ?')
      .run(Date.now() - 1, ctx.roomId, leavingPlayer);
    const expired = await ctx.executor.executeInternal({
      roomId: ctx.roomId,
      handler: (tx) => applyExpireReservations(tx, ctx.roomId),
    });
    assert.ok(expired);
    assert.deepEqual(expired.outcome.expiredPlayerIds, [leavingPlayer]);
    assert.equal(expired.outcome.forfeit?.finished, true);
    const finalState = state(ctx);
    assert.equal(finalState.phase, 'game_over');
    assert.equal(finalState.currentPlayerId, null);
    assert.equal(finalState.winnerTeam, 'landlord');
    assert.equal(finalState.winnerId, ctx.hostId);
    assert.equal(latestSession(ctx).status, 'FINISHED');
  } finally {
    closeDb(ctx.db);
  }
});