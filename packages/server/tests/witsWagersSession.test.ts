import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { openDb, type Db } from '../src/persistence/db.ts';
import { migrate } from '../src/persistence/migrator.ts';
import { RoomCommandExecutor } from '../src/core/executor.ts';
import { seedRoom } from './helpers/seedRoom.ts';
import {
  applySessionAction,
  getActiveSession,
  loadSessionState,
} from '../src/core/game/session.ts';
import { consumeDueTimer } from '../src/core/game/timerRunner.ts';
import { createSnapshotEnvelope } from '../src/core/game/snapshotEnvelope.ts';
import { witsWagersModule } from '@ldj/game-wits-wagers/server';
import type { WitsWagersState } from '@ldj/game-wits-wagers/server';

function createTestDb(): Db {
  const db = openDb({ path: ':memory:' });
  migrate(db);
  return db;
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

test('witsWagersSession: begin -> answering -> 全员提交 -> arranging 事务链与 timer 表落盘', async () => {
  const db = createTestDb();
  const executor = new RoomCommandExecutor(db);
  const now = 100_000;

  const seeded = seedRoom(db, { gameId: 'wits-wagers' });
  const { roomId, hostId } = seeded;
  const p1 = hostId;
  const p2 = 'player-2';
  const p3 = 'player-3';

  addPlayer(db, roomId, p2, 'Player 2', 2, now);
  addPlayer(db, roomId, p3, 'Player 3', 3, now);

  const sessionId = createWitsWagersSession(db, roomId, [p1, p2, p3], now);

  // 1. 发送 begin 动作起表
  await executor.executeOnRoom({
    roomId,
    actorScope: 'conn:system-begin',
    requestId: 'req-begin',
    handler: (tx) => {
      const session = getActiveSession(tx.db, roomId)!;
      return applySessionAction(tx, session, { kind: 'system', source: 'admin' }, { type: 'begin' }, 'req-begin');
    },
  });

  // 验证 session 状态转为 answering
  const sAfterBegin = getActiveSession(db, roomId)!;
  const stateAfterBegin = loadSessionState(sAfterBegin, witsWagersModule).state as WitsWagersState;
  assert.equal(stateAfterBegin.phase, 'answering');
  assert.equal(stateAfterBegin.round, 1);

  // 验证 timers 表有 pending 记录
  const timersAfterBegin = db.prepare('SELECT * FROM timers WHERE session_id = ?').all(sessionId) as {
    timer_id: string;
    status: string;
    deadline_at: number;
  }[];
  assert.equal(timersAfterBegin.length, 1);
  assert.equal(timersAfterBegin[0]?.status, 'pending');
  assert.equal(timersAfterBegin[0]?.deadline_at, stateAfterBegin.deadlineAt);

  // 2. p1 和 p2 作答
  await executor.executeOnRoom({
    roomId,
    actorScope: 'conn:p1-guess',
    requestId: 'req-p1-guess',
    handler: (tx) => {
      const session = getActiveSession(tx.db, roomId)!;
      return applySessionAction(
        tx,
        session,
        { kind: 'player', playerId: p1 },
        { type: 'submit_guess', roundToken: stateAfterBegin.roundToken, expectedRevision: 0, value: 100 },
        'req-p1-guess',
      );
    },
  });

  await executor.executeOnRoom({
    roomId,
    actorScope: 'conn:p2-guess',
    requestId: 'req-p2-guess',
    handler: (tx) => {
      const session = getActiveSession(tx.db, roomId)!;
      return applySessionAction(
        tx,
        session,
        { kind: 'player', playerId: p2 },
        { type: 'submit_guess', roundToken: stateAfterBegin.roundToken, expectedRevision: 0, value: 200 },
        'req-p2-guess',
      );
    },
  });

  // 仍处于 answering
  const sMid = getActiveSession(db, roomId)!;
  const stateMid = loadSessionState(sMid, witsWagersModule).state as WitsWagersState;
  assert.equal(stateMid.phase, 'answering');

  // 3. p3 作答 -> 全员答齐触发提前进入 arranging
  await executor.executeOnRoom({
    roomId,
    actorScope: 'conn:p3-guess',
    requestId: 'req-p3-guess',
    handler: (tx) => {
      const session = getActiveSession(tx.db, roomId)!;
      return applySessionAction(
        tx,
        session,
        { kind: 'player', playerId: p3 },
        { type: 'submit_guess', roundToken: stateAfterBegin.roundToken, expectedRevision: 0, value: 300 },
        'req-p3-guess',
      );
    },
  });

  // 验证阶段变为 arranging
  const sAfterAll = getActiveSession(db, roomId)!;
  const stateAfterAll = loadSessionState(sAfterAll, witsWagersModule).state as WitsWagersState;
  assert.equal(stateAfterAll.phase, 'arranging');
  assert.ok(stateAfterAll.board.length >= 4);

  // 验证原 answering 计时器被 cancelled，新 arranging 计时器处于 pending
  const timersAfterAll = db.prepare('SELECT * FROM timers WHERE session_id = ?').all(sessionId) as {
    timer_id: string;
    status: string;
    deadline_at: number;
  }[];
  assert.equal(timersAfterAll.length, 2);
  const cancelledTimer = timersAfterAll.find((t) => t.status === 'cancelled');
  const pendingTimer = timersAfterAll.find((t) => t.status === 'pending');
  assert.ok(cancelledTimer, '原 answering 计时器应被取消');
  assert.ok(pendingTimer, '新 arranging 计时器应处于 pending');
  assert.equal(pendingTimer.deadline_at, stateAfterAll.deadlineAt);
});

test('witsWagersSession: arranging -> betting -> 下注 -> settlement 积分与历史沉淀', async () => {
  const db = createTestDb();
  const executor = new RoomCommandExecutor(db);
  const currentTime = 200_000;

  const seeded = seedRoom(db, { gameId: 'wits-wagers' });
  const { roomId, hostId } = seeded;
  const p1 = hostId;
  const p2 = 'player-2';
  const p3 = 'player-3';

  addPlayer(db, roomId, p2, 'Player 2', 2, currentTime);
  addPlayer(db, roomId, p3, 'Player 3', 3, currentTime);

  const sessionId = createWitsWagersSession(db, roomId, [p1, p2, p3], currentTime);

  // begin
  await executor.executeOnRoom({
    roomId,
    actorScope: 'conn:begin',
    requestId: 'req-begin',
    handler: (tx) => applySessionAction(tx, getActiveSession(tx.db, roomId)!, { kind: 'system', source: 'admin' }, { type: 'begin' }, null),
  });

  // p1, p2, p3 提交猜测
  const roundToken = (loadSessionState(getActiveSession(db, roomId)!, witsWagersModule).state as WitsWagersState).roundToken;
  await executor.executeOnRoom({ roomId, actorScope: 'p1', requestId: 'g1', handler: (tx) => applySessionAction(tx, getActiveSession(tx.db, roomId)!, { kind: 'player', playerId: p1 }, { type: 'submit_guess', roundToken, expectedRevision: 0, value: 100 }, null) });
  await executor.executeOnRoom({ roomId, actorScope: 'p2', requestId: 'g2', handler: (tx) => applySessionAction(tx, getActiveSession(tx.db, roomId)!, { kind: 'player', playerId: p2 }, { type: 'submit_guess', roundToken, expectedRevision: 0, value: 200 }, null) });
  await executor.executeOnRoom({ roomId, actorScope: 'p3', requestId: 'g3', handler: (tx) => applySessionAction(tx, getActiveSession(tx.db, roomId)!, { kind: 'player', playerId: p3 }, { type: 'submit_guess', roundToken, expectedRevision: 0, value: 300 }, null) });

  // 此时在 arranging。将时钟推进到 arranging 计时器截止时间并消费
  await executor.executeOnRoom({
    roomId,
    actorScope: 'conn:timer-arranging',
    requestId: 'req-arranging-timer',
    handler: (tx) => {
      const pendingTimer = tx.db.prepare('SELECT timer_id, deadline_at FROM timers WHERE session_id = ? AND status = ?').get(sessionId, 'pending') as { timer_id: string; deadline_at: number };
      assert.ok(pendingTimer);
      tx.now = pendingTimer.deadline_at;
      return consumeDueTimer(tx, sessionId, pendingTimer.timer_id);
    },
  });

  // 验证当前进入 betting 阶段
  const sBetting = getActiveSession(db, roomId)!;
  const stateBetting = loadSessionState(sBetting, witsWagersModule).state as WitsWagersState;
  assert.equal(stateBetting.phase, 'betting');

  // p1 下注两枚在 g:100 (0 extraStake)
  await executor.executeOnRoom({
    roomId,
    actorScope: 'conn:p1-bet',
    requestId: 'req-p1-bet',
    handler: (tx) => {
      const session = getActiveSession(tx.db, roomId)!;
      return applySessionAction(
        tx,
        session,
        { kind: 'player', playerId: p1 },
        {
          type: 'set_bets',
          roundToken: stateBetting.roundToken,
          expectedRevision: 0,
          chips: [
            { chipId: 'A', targetId: 'g:100', extraStake: 0 },
            { chipId: 'B', targetId: 'g:100', extraStake: 0 },
          ],
        },
        'req-p1-bet',
      );
    },
  });

  // 推进到 betting 计时器截止时间并消费
  await executor.executeOnRoom({
    roomId,
    actorScope: 'conn:timer-betting',
    requestId: 'req-betting-timer',
    handler: (tx) => {
      const pendingTimer = tx.db.prepare('SELECT timer_id, deadline_at FROM timers WHERE session_id = ? AND status = ?').get(sessionId, 'pending') as { timer_id: string; deadline_at: number };
      assert.ok(pendingTimer);
      tx.now = pendingTimer.deadline_at;
      return consumeDueTimer(tx, sessionId, pendingTimer.timer_id);
    },
  });

  // 验证结算后进入 settlement 阶段，history 有 1 条记录
  const sSettled = getActiveSession(db, roomId)!;
  const stateSettled = loadSessionState(sSettled, witsWagersModule).state as WitsWagersState;
  assert.equal(stateSettled.phase, 'settlement');
  assert.equal(stateSettled.history.length, 1);
  assert.ok(stateSettled.scores[p1]! >= 0);
});
