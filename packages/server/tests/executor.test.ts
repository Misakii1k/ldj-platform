import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, type Db } from '../src/persistence/db.ts';
import { migrate } from '../src/persistence/migrator.ts';
import { RoomCommandExecutor, CommandError } from '../src/core/executor.ts';
import { prepareCreateRoom, applyCreateRoom } from '../src/core/commands/createRoom.ts';
import { newRoomCode, hashRoomPassword, verifyRoomPassword, newResumeToken, hashResumeToken } from '../src/core/ids.ts';
import { buildRoomSnapshot } from '../src/core/snapshot.ts';
import { seedRoom } from './helpers/seedRoom.ts';
import type { CreateRoomPayload } from '@ldj/shared';

function setup() {
  const db = openDb({ path: ':memory:' });
  migrate(db);
  return { db, executor: new RoomCommandExecutor(db) };
}

function seedExecutorRoom(db: Db) {
  const seeded = seedRoom(db);
  return {
    roomSeq: 1,
    replayed: false,
    outcome: {
      roomId: seeded.roomId,
      roomCode: seeded.roomCode,
      playerId: seeded.hostId,
      resumeToken: seeded.hostResumeToken,
      snapshot: buildRoomSnapshot(db, seeded.roomId),
    },
  };
}

test('create_room 默认生产路径：无已批准游戏时明确拒绝且不落脏数据', async () => {
  const { db, executor } = setup();
  try {
    const { roomId } = prepareCreateRoom();
    await assert.rejects(
      executor.executeCreate({
        roomId,
        actorScope: 'conn:c1',
        requestId: 'req-create-1',
        handler: (tx) => applyCreateRoom(tx, roomId, { nickname: '房主' }),
      }),
      (error: unknown) => {
        assert.ok(error instanceof CommandError);
        assert.equal(error.code, 'ACTION_NOT_ALLOWED');
        assert.equal(error.message, '所选游戏暂未开放');
        return true;
      },
    );
    const counts = db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM rooms) AS rooms,
           (SELECT COUNT(*) FROM room_members) AS members,
           (SELECT COUNT(*) FROM command_receipts) AS receipts`,
      )
      .get() as { rooms: number; members: number; receipts: number };
    assert.equal(counts.rooms, 0);
    assert.equal(counts.members, 0);
    assert.equal(counts.receipts, 0);
  } finally {
    db.close();
  }
});

test('历史房间夹具：合法 room/host/member 可供真实 executor 与快照读取', () => {
  const { db } = setup();
  try {
    const result = seedExecutorRoom(db);
    assert.equal(result.roomSeq, 1);
    assert.equal(result.replayed, false);
    const o = result.outcome;
    assert.match(o.roomCode, /^[A-HJ-NP-Z2-9]{5}$/);
    assert.equal(o.snapshot.status, 'LOBBY');
    assert.equal(o.snapshot.seq, 1);
    assert.equal(o.snapshot.members.length, 1);
    assert.equal(o.snapshot.members[0]!.isHost, true);
    assert.equal(o.snapshot.members[0]!.nickname, '房主');

    // 快照白名单：不得携带凭证/密码哈希（SEC-003）
    const json = JSON.stringify(o.snapshot);
    assert.ok(!json.includes('resume_token_hash') && !json.includes('password'));

    const room = db.prepare('SELECT seq, status, host_player_id, game_id FROM rooms WHERE id = ?').get(o.roomId) as {
      seq: number;
      status: string;
      host_player_id: string;
      game_id: string | null;
    };
    assert.equal(room.seq, 1);
    assert.equal(room.status, 'LOBBY');
    assert.equal(room.host_player_id, o.playerId);
    assert.equal(room.game_id, 'undercover');
    assert.equal(o.snapshot.gameId, 'undercover');

    const member = db
      .prepare('SELECT resume_token_hash, connection_status, ready FROM room_members WHERE room_id = ? AND player_id = ?')
      .get(o.roomId, o.playerId) as { resume_token_hash: string; connection_status: string; ready: number };
    assert.equal(member.resume_token_hash, hashResumeToken(o.resumeToken));
    assert.notEqual(member.resume_token_hash, o.resumeToken);
    assert.equal(member.connection_status, 'CONNECTED');
    assert.equal(member.ready, 0);
  } finally {
    db.close();
  }
});

test('create_room：未开放或未定的游戏不能创建房间', async () => {
  const { db, executor } = setup();
  try {
    const { roomId } = prepareCreateRoom();
    for (const [requestId, gameId] of [
      ['req-coming-soon', 'unreleased_game'],
      ['req-null-game', null],
    ] as const) {
      const invalidGamePayload: unknown = { nickname: '房主', gameId };
      await assert.rejects(
        executor.executeCreate({
          roomId,
          actorScope: `conn:${requestId}`,
          requestId,
          handler: (tx) => applyCreateRoom(tx, roomId, invalidGamePayload as CreateRoomPayload),
        }),
        (err: unknown) => {
          assert.ok(err instanceof CommandError);
          assert.equal(err.code, 'ACTION_NOT_ALLOWED');
          return true;
        },
      );
    }
    const count = db.prepare('SELECT COUNT(*) AS count FROM rooms').get() as { count: number };
    assert.equal(count.count, 0);
  } finally {
    db.close();
  }
});

test('D1：证据未批准的游戏不能通过默认生产路径新建房间', async () => {
  const { db, executor } = setup();
  try {
    for (const gameId of ['undercover', 'uno', 'landlord', 'werewolf'] as const) {
      const { roomId } = prepareCreateRoom();
      await assert.rejects(
        executor.executeCreate({
          roomId,
          actorScope: `conn:${gameId}`,
          requestId: `req-d1-${gameId}`,
          handler: (tx) => applyCreateRoom(tx, roomId, { nickname: '房主', gameId }),
        }),
        (error: unknown) => {
          assert.ok(error instanceof CommandError);
          assert.equal(error.code, 'ACTION_NOT_ALLOWED');
          assert.equal(error.message, '所选游戏暂未开放');
          return true;
        },
      );
    }
  } finally {
    db.close();
  }
});

test('executeOnRoom seq increments and idempotent receipt returns first result', async () => {
  const { db, executor } = setup();
  const created = seedExecutorRoom(db);
  const roomId = created.outcome.roomId;

  let executions = 0;
  const run = () =>
    executor.executeOnRoom({
      roomId,
      actorScope: `player:${created.outcome.playerId}`,
      requestId: 'req-x',
      handler: () => {
        executions += 1;
        return { value: executions };
      },
    });

  const first = await run();
  assert.equal(first.roomSeq, 2);
  assert.equal(first.replayed, false);
  assert.deepEqual(first.outcome, { value: 1 });

  // 同一 requestId 重放：不重复执行，返回第一次结果（§9.4）
  const second = await run();
  assert.equal(second.replayed, true);
  assert.equal(second.roomSeq, 2);
  assert.deepEqual(second.outcome, { value: 1 });
  assert.equal(executions, 1);

  // 新 requestId：正常执行，seq 继续递增
  const third = await executor.executeOnRoom({
    roomId,
    actorScope: `player:${created.outcome.playerId}`,
    requestId: 'req-y',
    handler: () => 'next',
  });
  assert.equal(third.roomSeq, 3);
  db.close();
});

test('executeOnRoom：回执安全投影不改变首次结果，重试只恢复投影', async () => {
  const { db, executor } = setup();
  const created = seedExecutorRoom(db);
  const roomId = created.outcome.roomId;
  let executions = 0;
  const run = () => executor.executeOnRoom({
    roomId,
    actorScope: `player:${created.outcome.playerId}`,
    requestId: 'req-projected',
    receiptOutcome: (outcome: { ack: string; privateEvents: string[] }) => ({
      ...outcome,
      privateEvents: [],
    }),
    handler: () => {
      executions += 1;
      return { ack: 'ok', privateEvents: ['secret'] };
    },
  });

  const first = await run();
  assert.equal(first.replayed, false);
  assert.deepEqual(first.outcome, { ack: 'ok', privateEvents: ['secret'] });
  const replay = await run();
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.outcome, { ack: 'ok', privateEvents: [] });
  assert.equal(executions, 1);
  db.close();
});

test('executeOnRoom：handler 抛错时事务回滚，seq 不变', async () => {
  const { db, executor } = setup();
  const created = seedExecutorRoom(db);
  const roomId = created.outcome.roomId;

  await assert.rejects(
    executor.executeOnRoom({
      roomId,
      actorScope: 'player:p',
      requestId: 'req-fail',
      handler: (tx) => {
        tx.db
          .prepare("INSERT INTO chat_messages (room_id, kind, text, created_at) VALUES (?, 'system', 'x', ?)")
          .run(roomId, tx.now);
        throw new CommandError('ACTION_NOT_ALLOWED');
      },
    }),
    (err: unknown) => err instanceof CommandError && err.code === 'ACTION_NOT_ALLOWED',
  );

  const room = db.prepare('SELECT seq FROM rooms WHERE id = ?').get(roomId) as { seq: number };
  assert.equal(room.seq, 1); // 未被失败命令推进
  const chat = db.prepare('SELECT COUNT(*) AS n FROM chat_messages').get() as { n: number };
  assert.equal(chat.n, 0); // 部分写入已回滚
  // 失败命令不留回执
  const receipt = db.prepare("SELECT 1 FROM command_receipts WHERE request_id = 'req-fail'").get();
  assert.equal(receipt, undefined);
  db.close();
});

test('executeOnRoom：房间不存在返回 ROOM_NOT_FOUND', async () => {
  const { db, executor } = setup();
  await assert.rejects(
    executor.executeOnRoom({
      roomId: 'room_missing',
      actorScope: 'player:p',
      requestId: 'r1',
      handler: () => null,
    }),
    (err: unknown) => err instanceof CommandError && err.code === 'ROOM_NOT_FOUND',
  );
  db.close();
});

test('房间码：字符集排除 0/O/1/I', () => {
  for (let i = 0; i < 200; i++) {
    const code = newRoomCode();
    assert.match(code, /^[A-HJ-NP-Z2-9]{5}$/);
  }
});

test('password hash verifies with random salt and no plaintext storage', () => {
  const h1 = hashRoomPassword('secret-1');
  const h2 = hashRoomPassword('secret-1');
  assert.notEqual(h1, h2); // 盐不同
  assert.ok(!h1.includes('secret-1'));
  assert.equal(verifyRoomPassword('secret-1', h1), true);
  assert.equal(verifyRoomPassword('wrong', h1), false);
  assert.equal(verifyRoomPassword('secret-1', 'garbage'), false);
});

test('resumeToken：高熵且哈希稳定', () => {
  const t1 = newResumeToken();
  const t2 = newResumeToken();
  assert.notEqual(t1, t2);
  assert.ok(Buffer.from(t1, 'base64url').length >= 32); // ≥256 bit
  assert.equal(hashResumeToken(t1), hashResumeToken(t1));
});

test('buildRoomSnapshot：被踢成员不出现在快照中', async () => {
  const { db } = setup();
  const created = seedExecutorRoom(db);
  const roomId = created.outcome.roomId;
  db.prepare(
    `INSERT INTO room_members (room_id, player_id, nickname, seat_role, seat, connection_status, resume_token_hash, joined_at)
     VALUES (?, 'p_kicked', '捣乱', 'player', 2, 'KICKED', 'h', ?)`,
  ).run(roomId, Date.now());

  const snapshot = buildRoomSnapshot(db, roomId);
  assert.equal(snapshot.members.length, 1);
  assert.ok(!snapshot.members.some((m) => m.playerId === 'p_kicked'));
  db.close();
});
