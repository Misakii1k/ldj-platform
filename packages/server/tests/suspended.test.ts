/**
 * D4-F2：SUSPENDED 与类型化失败恢复。
 * 覆盖：内部 reduce 故障 / state schema 故障 / 未知 effect → 会话 SUSPENDED + 类型化失败码，
 * 原动作零写入；用户输入拒绝不暂停；重启后可确定性恢复回 ACTIVE 并清除失败码；
 * 规则集不可用 → FAILED_RULESET_UNAVAILABLE 终止且不写正常战绩。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { unlinkSync, existsSync } from 'node:fs';
import { GameInternalError, type GameEffect } from '@ldj/shared';
import { openDb, closeDb, type Db } from '../src/persistence/db.ts';
import { migrate } from '../src/persistence/migrator.ts';
import { RoomCommandExecutor } from '../src/core/executor.ts';
import { CommandError } from '../src/core/executor.ts';
import { seedRoom } from './helpers/seedRoom.ts';
import { applyJoinRoom } from '../src/core/commands/joinRoom.ts';
import { applyRoomCommand } from '../src/core/commands/roomCommand.ts';
import { undercoverVersionedModule } from '@ldj/game-undercover/server';
import {
  applySessionAction,
  getActiveSession,
  startGame,
  type SessionRow,
} from '../src/core/game/session.ts';
import { runStartupRecovery } from '../src/core/recovery.ts';
import { createLogger } from '../src/boot/logger.ts';
import type { AnyGameModuleV2, GameContext } from '@ldj/shared';

const silentLogger = createLogger('error', {}, () => {});

function freshDb(): Db {
  const db = openDb({ path: ':memory:' });
  migrate(db);
  return db;
}

function tempDbPath(): string {
  return join(tmpdir(), `ldj-f2-${randomUUID()}.db`);
}

function cleanupDb(path: string): void {
  for (const file of [path, `${path}-wal`, `${path}-shm`]) {
    try {
      if (existsSync(file)) unlinkSync(file);
    } catch {
      // 忽略
    }
  }
}

async function makeRoomAndStart(db: Db, executor: RoomCommandExecutor): Promise<string> {
  const seeded = seedRoom(db, { gameId: 'undercover' });
  for (let index = 2; index <= 4; index += 1) {
    await executor.executeOnRoom({
      roomId: seeded.roomId,
      actorScope: `conn:join${index}`,
      requestId: `join-${index}`,
      handler: (tx) =>
        applyJoinRoom(tx, seeded.roomId, { roomCode: seeded.roomCode, nickname: `玩家${index}`, asSpectator: false }),
    });
  }
  const players = (db.prepare(
    `SELECT player_id FROM room_members WHERE room_id = ? AND seat_role = 'player' ORDER BY seat ASC`,
  ).all(seeded.roomId) as { player_id: string }[]).map((r) => r.player_id);
  for (const playerId of players) {
    await executor.executeOnRoom({
      roomId: seeded.roomId,
      actorScope: `conn:ready-${playerId}`,
      requestId: `ready-${playerId}`,
      handler: (tx) => applyRoomCommand(tx, seeded.roomId, playerId, { command: 'ready', ready: true }, {}),
    });
  }
  await executor.executeOnRoom({
    roomId: seeded.roomId,
    actorScope: 'conn:host-start',
    requestId: 'start',
    handler: (tx) => startGame(tx, seeded.roomId, { speechSeconds: 60, voteSeconds: 45 }),
  });
  return seeded.roomId;
}

function activeSession(db: Db, roomId: string): SessionRow {
  const session = getActiveSession(db, roomId);
  assert.ok(session, '会话应存在');
  return session;
}

function failureJson(db: Db, sessionId: string): Record<string, unknown> | null {
  const row = db
    .prepare('SELECT failure_details_json FROM game_sessions WHERE id = ?')
    .get(sessionId) as { failure_details_json: string | null };
  return row.failure_details_json === null ? null : (JSON.parse(row.failure_details_json) as Record<string, unknown>);
}

/** 故障模块包装器：只覆盖 reduce 行为，其余委托真实 undercover V2 模块。 */
function faultingModule(fault: {
  kind: 'reduce_fault' | 'schema_fault' | 'unknown_effect';
}): AnyGameModuleV2 {
  return {
    ...undercoverVersionedModule,
    reduce(ctx: GameContext, state: unknown, actor: unknown, action: unknown) {
      if (fault.kind === 'reduce_fault') {
        throw new GameInternalError('SUSPENDED_REDUCE_FAULT', '模拟 reducer 内部故障');
      }
      const delegate = undercoverVersionedModule.reduce as (
        c: GameContext,
        s: unknown,
        a: unknown,
        ac: unknown,
      ) => ReturnType<AnyGameModuleV2['reduce']>;
      if (fault.kind === 'schema_fault') {
        const result = delegate(ctx, state, actor, action);
        if (result.ok) {
          return {
            ...result,
            nextState: { ...(result.nextState as Record<string, unknown>), phase: 'INVALID_PHASE' },
          };
        }
        return result;
      }
      const result = delegate(ctx, state, actor, action);
      if (result.ok) {
        return {
          ...result,
          effects: [...result.effects, { type: 'unknown_effect' }] as readonly GameEffect[],
        };
      }
      return result;
    },
  };
}

test('F2：reducer 内部故障 → 会话 SUSPENDED，动作零写入，外部收到内部错误', async () => {
  const db = freshDb();
  const executor = new RoomCommandExecutor(db);
  const roomId = await makeRoomAndStart(db, executor);
  const session = activeSession(db, roomId);
  const before = { lastSeq: session.last_seq, snapshot: session.snapshot_json };

  const module = faultingModule({ kind: 'reduce_fault' });
  assert.throws(
    () => applySessionAction(
      { db, now: Date.now(), roomSeq: 1 },
      session,
      { kind: 'player', playerId: Object.keys((JSON.parse(session.snapshot_json) as { state: { players: Record<string, unknown> } }).state.players)[0]! },
      { type: 'confirm_word' },
      'req-fault',
      module,
    ),
    (err: unknown) => err instanceof CommandError && err.code === 'INTERNAL_ERROR',
  );

  const after = db.prepare('SELECT * FROM game_sessions WHERE id = ?').get(session.id) as unknown as SessionRow;
  assert.equal(after.status, 'SUSPENDED');
  assert.equal(after.failure, 'SUSPENDED_REDUCE_FAULT');
  assert.equal(after.last_seq, before.lastSeq);
  assert.equal(after.snapshot_json, before.snapshot);
  // 内部故障动作零写入：仅开局 begin 有事件，故障动作不得新增事件
  assert.equal(
    (db.prepare('SELECT COUNT(*) AS n FROM game_events WHERE session_id = ?').get(session.id) as { n: number }).n,
    before.lastSeq,
  );
  const details = failureJson(db, session.id);
  assert.ok(details);
  assert.equal(details['reason'], 'SUSPENDED_REDUCE_FAULT');
  assert.equal(details['rulesetId'], 'undercover_classic_v1');
  closeDb(db);
});

test('F2：nextState schema 故障 → SUSPENDED_STATE_SCHEMA', async () => {
  const db = freshDb();
  const executor = new RoomCommandExecutor(db);
  const roomId = await makeRoomAndStart(db, executor);
  const session = activeSession(db, roomId);
  const module = faultingModule({ kind: 'schema_fault' });
  assert.throws(
    () => applySessionAction(
      { db, now: Date.now(), roomSeq: 1 },
      session,
      { kind: 'player', playerId: Object.keys((JSON.parse(session.snapshot_json) as { state: { players: Record<string, unknown> } }).state.players)[0]! },
      { type: 'confirm_word' },
      'req-schema',
      module,
    ),
    (err: unknown) => err instanceof CommandError && err.code === 'INTERNAL_ERROR',
  );
  const after = db.prepare('SELECT status, failure FROM game_sessions WHERE id = ?').get(session.id) as {
    status: string;
    failure: string | null;
  };
  assert.equal(after.status, 'SUSPENDED');
  assert.equal(after.failure, 'SUSPENDED_STATE_SCHEMA');
  closeDb(db);
});

test('F2：未知 effect → SUSPENDED_UNKNOWN_EFFECT', async () => {
  const db = freshDb();
  const executor = new RoomCommandExecutor(db);
  const roomId = await makeRoomAndStart(db, executor);
  const session = activeSession(db, roomId);
  const module = faultingModule({ kind: 'unknown_effect' });
  assert.throws(
    () => applySessionAction(
      { db, now: Date.now(), roomSeq: 1 },
      session,
      { kind: 'player', playerId: Object.keys((JSON.parse(session.snapshot_json) as { state: { players: Record<string, unknown> } }).state.players)[0]! },
      { type: 'confirm_word' },
      'req-effect',
      module,
    ),
    (err: unknown) => err instanceof CommandError && err.code === 'INTERNAL_ERROR',
  );
  const after = db.prepare('SELECT status, failure FROM game_sessions WHERE id = ?').get(session.id) as {
    status: string;
    failure: string | null;
  };
  assert.equal(after.status, 'SUSPENDED');
  assert.equal(after.failure, 'SUSPENDED_UNKNOWN_EFFECT');
  closeDb(db);
});

test('F2：用户输入拒绝（CommandError）不暂停会话', async () => {
  const db = freshDb();
  const executor = new RoomCommandExecutor(db);
  const roomId = await makeRoomAndStart(db, executor);
  const session = activeSession(db, roomId);
  const players = Object.keys((JSON.parse(session.snapshot_json) as { state: { players: Record<string, unknown> } }).state.players);
  // 非当前发言者 confirm 会被拒绝（word_reveal 全员都可 confirm，因此用非参局者制造拒绝）
  assert.throws(
    () => applySessionAction(
      { db, now: Date.now(), roomSeq: 1 },
      session,
      { kind: 'player', playerId: 'not-in-game' },
      { type: 'confirm_word' },
      'req-user',
    ),
    (err: unknown) => err instanceof CommandError && err.code === 'ACTION_NOT_ALLOWED',
  );
  const after = db.prepare('SELECT status, failure FROM game_sessions WHERE id = ?').get(session.id) as {
    status: string;
    failure: string | null;
  };
  assert.equal(after.status, 'ACTIVE');
  assert.equal(after.failure, null);
  assert.ok(players.length >= 4);
  closeDb(db);
});

test('F2：重启恢复把 SUSPENDED 会话确定性恢复到 ACTIVE 并清除失败码', async () => {
  const dbPath = tempDbPath();
  try {
    let db = openDb({ path: dbPath });
    migrate(db);
    const executor = new RoomCommandExecutor(db);
    const roomId = await makeRoomAndStart(db, executor);
    const session = activeSession(db, roomId);
    const module = faultingModule({ kind: 'reduce_fault' });
    assert.throws(
      () => applySessionAction(
        { db, now: Date.now(), roomSeq: 1 },
        session,
        { kind: 'player', playerId: Object.keys((JSON.parse(session.snapshot_json) as { state: { players: Record<string, unknown> } }).state.players)[0]! },
        { type: 'confirm_word' },
        'req-fault',
        module,
      ),
      (err: unknown) => err instanceof CommandError,
    );
    const suspended = db.prepare('SELECT status, failure FROM game_sessions WHERE id = ?').get(session.id) as {
      status: string;
      failure: string | null;
    };
    assert.equal(suspended.status, 'SUSPENDED');
    closeDb(db);

    db = openDb({ path: dbPath });
    migrate(db);
    const summary = runStartupRecovery(db, silentLogger);
    assert.equal(summary.sessionsAborted, 0);
    const recovered = db.prepare('SELECT status, failure FROM game_sessions WHERE id = ?').get(session.id) as {
      status: string;
      failure: string | null;
    };
    assert.equal(recovered.status, 'ACTIVE');
    assert.equal(recovered.failure, null);
    closeDb(db);
  } finally {
    cleanupDb(dbPath);
  }
});

test('F2：规则集不可用 → FAILED_RULESET_UNAVAILABLE 终止且不写正常战绩', async () => {
  const dbPath = tempDbPath();
  try {
    let db = openDb({ path: dbPath });
    migrate(db);
    const executor = new RoomCommandExecutor(db);
    const roomId = await makeRoomAndStart(db, executor);
    const session = activeSession(db, roomId);
    // 抹掉规则集身份模拟规则集不可用
    db.prepare(`UPDATE game_sessions SET ruleset_id = 'unregistered_module' WHERE id = ?`).run(session.id);
    closeDb(db);

    db = openDb({ path: dbPath });
    migrate(db);
    const summary = runStartupRecovery(db, silentLogger);
    assert.equal(summary.sessionsAborted, 1);
    const row = db.prepare(
      "SELECT status, failure FROM game_sessions WHERE id = ?",
    ).get(session.id) as { status: string; failure: string | null };
    assert.equal(row.status, 'ABORTED');
    assert.equal(row.failure, 'FAILED_RULESET_UNAVAILABLE');
    assert.equal(
      (db.prepare('SELECT COUNT(*) AS n FROM game_results WHERE session_id = ?').get(session.id) as { n: number }).n,
      0,
      '异常终止不得写正常战绩',
    );
    closeDb(db);
  } finally {
    cleanupDb(dbPath);
  }
});
