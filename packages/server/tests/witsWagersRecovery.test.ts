import test from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { unlinkSync, existsSync } from 'node:fs';
import { openDb, closeDb, type Db } from '../src/persistence/db.ts';
import { migrate } from '../src/persistence/migrator.ts';
import { RoomCommandExecutor } from '../src/core/executor.ts';
import { seedRoom } from './helpers/seedRoom.ts';
import {
  applySessionAction,
  getActiveSession,
  loadSessionState,
} from '../src/core/game/session.ts';
import { createSnapshotEnvelope } from '../src/core/game/snapshotEnvelope.ts';
import { runStartupRecovery } from '../src/core/recovery.ts';
import { createLogger } from '../src/boot/logger.ts';
import { witsWagersModule } from '@ldj/game-wits-wagers/server';
import type { WitsWagersState } from '@ldj/game-wits-wagers/server';

const silentLogger = createLogger('error', {}, () => {});

function tempDbPath(): string {
  return join(tmpdir(), `ldj-ww-recovery-${randomUUID()}.db`);
}

function cleanupDb(path: string): void {
  for (const file of [path, `${path}-wal`, `${path}-shm`]) {
    try {
      if (existsSync(file)) unlinkSync(file);
    } catch {
      // 忽略清理异常
    }
  }
}

function addPlayer(db: Db, roomId: string, playerId: string, nickname: string, seat: number, now = 100_000): void {
  db.prepare(
    `INSERT INTO room_members
       (room_id, player_id, identity_id, nickname, seat_role, seat, connection_status,
        resume_token_hash, reserved_until, joined_at, is_bot, bot_kind, ready)
     VALUES (?, ?, NULL, ?, 'player', ?, 'CONNECTED', 'test-hash', NULL, ?, 0, NULL, 1)`,
  ).run(roomId, playerId, nickname, seat, now);
}

function createWitsWagersSession(db: Db, roomId: string, players: string[], now: number): string {
  const sessionId = randomUUID();
  const seed = randomUUID();
  const module = witsWagersModule;
  const initialState = module.createInitialState(
    { now, random: { nextInt: (min) => min, shuffle: (items) => [...items] } },
    players,
    { answerSeconds: 30, betSeconds: 30 },
  );

  const initialSnapshotJson = JSON.stringify(
    createSnapshotEnvelope({
      gameId: 'wits-wagers',
      rulesetId: 'wits_wagers_platform_v1',
      schemaVersion: 1,
      createdAtSequence: 0,
      rngState: { cursor: 0 },
      state: initialState,
    }),
  );

  db.prepare(
    `INSERT INTO game_sessions
       (id, room_id, module_id, module_version, state_schema_version, status, snapshot_json, seed, rng_state_json, ruleset_id, last_seq, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, 0, ?, ?)`,
  ).run(
    sessionId,
    roomId,
    'wits-wagers',
    module.manifest.version,
    module.manifest.stateSchemaVersion,
    initialSnapshotJson,
    seed,
    JSON.stringify({ cursor: 0 }),
    'wits_wagers_platform_v1',
    now,
    now,
  );

  db.prepare(`UPDATE rooms SET status = 'IN_GAME', game_id = ?, updated_at = ? WHERE id = ?`).run(
    'wits-wagers',
    now,
    roomId,
  );

  return sessionId;
}

test('witsWagersRecovery: 崩溃重启恢复，题库确定性不换题、分数不重复加', async () => {
  const dbFile = tempDbPath();
  const db1 = openDb({ path: dbFile });
  migrate(db1);

  const now = 100_000;
  const seeded = seedRoom(db1, { gameId: 'wits-wagers' });
  const { roomId, hostId: p1 } = seeded;
  const p2 = 'player-2';
  const p3 = 'player-3';

  addPlayer(db1, roomId, p2, 'Player 2', 2, now);
  addPlayer(db1, roomId, p3, 'Player 3', 3, now);

  const executor1 = new RoomCommandExecutor(db1);
  createWitsWagersSession(db1, roomId, [p1, p2, p3], now);

  // 1. begin
  await executor1.executeOnRoom({
    roomId,
    actorScope: 'conn:begin',
    requestId: 'req-begin',
    handler: (tx) => applySessionAction(tx, getActiveSession(tx.db, roomId)!, { kind: 'system', source: 'admin' }, { type: 'begin' }, null),
  });

  // 2. p1 作答
  const sBeforeCrash = getActiveSession(db1, roomId)!;
  const stateBeforeCrash = loadSessionState(sBeforeCrash, witsWagersModule).state as WitsWagersState;
  const originalQuestionPlan = stateBeforeCrash.questionPlan;
  const roundToken = stateBeforeCrash.roundToken;

  await executor1.executeOnRoom({
    roomId,
    actorScope: 'conn:p1-guess',
    requestId: 'req-p1-guess',
    handler: (tx) => applySessionAction(tx, getActiveSession(tx.db, roomId)!, { kind: 'player', playerId: p1 }, { type: 'submit_guess', roundToken, expectedRevision: 0, value: 500 }, null),
  });

  // 3. 模拟服务“崩溃”：关闭数据库连接
  closeDb(db1);

  // 4. 重启：用同一个文件重新 openDb 并执行 runStartupRecovery
  const db2 = openDb({ path: dbFile });
  try {
    const summary = runStartupRecovery(db2, silentLogger);
    assert.equal(summary.sessionsRecovered, 1);
    assert.equal(summary.sessionsAborted, 0);

    const sAfterRecovery = getActiveSession(db2, roomId)!;
    assert.equal(sAfterRecovery.status, 'ACTIVE');

    const stateAfterRecovery = loadSessionState(sAfterRecovery, witsWagersModule).state as WitsWagersState;
    assert.equal(stateAfterRecovery.phase, 'answering');
    assert.equal(stateAfterRecovery.round, 1);
    assert.equal(stateAfterRecovery.roundToken, roundToken);

    // 验证崩溃恢复不换题
    assert.deepEqual(stateAfterRecovery.questionPlan, originalQuestionPlan);

    // 验证已提交作答不丢失
    assert.equal(stateAfterRecovery.guesses[p1]?.value, 500);
    assert.equal(stateAfterRecovery.guesses[p1]?.origin, 'submitted');
    assert.equal(stateAfterRecovery.guesses[p2], null);

    // 5. 幂等性验证：再次调用 recovery 不触发额外 side effects
    const summary2 = runStartupRecovery(db2, silentLogger);
    assert.equal(summary2.timersFired, 0);
  } finally {
    closeDb(db2);
    cleanupDb(dbFile);
  }
});
