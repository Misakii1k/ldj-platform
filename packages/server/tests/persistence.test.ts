import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, withTransaction } from '../src/persistence/db.ts';
import { migrate, integrityCheck } from '../src/persistence/migrator.ts';
import { MIGRATIONS } from '../src/persistence/migrations.ts';

const EXPECTED_TABLES = [
  'schema_migrations',
  'rooms',
  'room_members',
  'game_sessions',
  'game_events',
  'command_receipts',
  'timers',
  'chat_messages',
  'game_results',
  'audit_log',
];

function freshDb() {
  const db = openDb({ path: ':memory:' });
  migrate(db);
  return db;
}

test('migrate：十张逻辑表全部创建', () => {
  const db = freshDb();
  const rows = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all() as { name: string }[];
  const names = new Set(rows.map((r) => r.name));
  for (const t of EXPECTED_TABLES) {
    assert.ok(names.has(t), `缺少表 ${t}`);
  }
  db.close();
});

test('migrate：重复执行幂等', () => {
  const db = openDb({ path: ':memory:' });
  const first = migrate(db);
  assert.deepEqual(first, [1, 2]);
  const second = migrate(db);
  assert.deepEqual(second, []);
  db.close();
});

test('migrate：v2 为历史房间回填默认游戏', () => {
  const db = openDb({ path: ':memory:' });
  assert.deepEqual(migrate(db, [MIGRATIONS[0]!]), [1]);
  const now = Date.now();
  db.prepare(
    `INSERT INTO rooms (id, code, status, game_id, seq, created_at, updated_at)
     VALUES ('legacy', 'ABCDE', 'LOBBY', NULL, 0, ?, ?)`,
  ).run(now, now);

  assert.deepEqual(migrate(db), [2]);
  const room = db.prepare("SELECT game_id FROM rooms WHERE id = 'legacy'").get() as {
    game_id: string | null;
  };
  assert.equal(room.game_id, 'undercover');
  db.close();
});

test('外键约束：孤儿成员行被拒绝', () => {
  const db = freshDb();
  assert.throws(() => {
    db.prepare(
      `INSERT INTO room_members (room_id, player_id, nickname, seat_role, resume_token_hash, joined_at)
       VALUES ('no_such_room', 'p1', 'x', 'player', 'h', 0)`,
    ).run();
  }, /FOREIGN KEY/i);
  db.close();
});

test('唯一约束：房间码、同房昵称、玩家席位', () => {
  const db = freshDb();
  const now = Date.now();
  db.prepare(
    `INSERT INTO rooms (id, code, status, seq, created_at, updated_at) VALUES ('r1', 'ABCDE', 'LOBBY', 0, ?, ?)`,
  ).run(now, now);

  // 房间码唯一
  assert.throws(() => {
    db.prepare(
      `INSERT INTO rooms (id, code, status, seq, created_at, updated_at) VALUES ('r2', 'ABCDE', 'LOBBY', 0, ?, ?)`,
    ).run(now, now);
  }, /UNIQUE/i);

  db.prepare(
    `INSERT INTO room_members (room_id, player_id, nickname, seat_role, seat, resume_token_hash, joined_at)
     VALUES ('r1', 'p1', '小明', 'player', 1, 'h1', ?)`,
  ).run(now);

  // 同房间昵称唯一（FR-ROOM-003）
  assert.throws(() => {
    db.prepare(
      `INSERT INTO room_members (room_id, player_id, nickname, seat_role, seat, resume_token_hash, joined_at)
       VALUES ('r1', 'p2', '小明', 'player', 2, 'h2', ?)`,
    ).run(now);
  }, /UNIQUE/i);

  // 玩家席位唯一
  assert.throws(() => {
    db.prepare(
      `INSERT INTO room_members (room_id, player_id, nickname, seat_role, seat, resume_token_hash, joined_at)
       VALUES ('r1', 'p3', '小红', 'player', 1, 'h3', ?)`,
    ).run(now);
  }, /UNIQUE/i);
  db.close();
});

test('一个房间最多一个活动对局（部分唯一索引）', () => {
  const db = freshDb();
  const now = Date.now();
  db.prepare(
    `INSERT INTO rooms (id, code, status, seq, created_at, updated_at) VALUES ('r1', 'ABCDE', 'IN_GAME', 0, ?, ?)`,
  ).run(now, now);
  const insertSession = (id: string, status: string) =>
    db
      .prepare(
        `INSERT INTO game_sessions (id, room_id, module_id, module_version, state_schema_version, status, snapshot_json, seed, rng_state_json, created_at, updated_at)
         VALUES (?, 'r1', 'undercover', '1.0.0', 1, ?, '{}', 'seed', '{}', ?, ?)`,
      )
      .run(id, status, now, now);

  insertSession('s1', 'ACTIVE');
  assert.throws(() => insertSession('s2', 'PREPARING'), /UNIQUE/i);
  // 已结束的对局不受限制
  insertSession('s3', 'FINISHED');
  db.close();
});

test('状态枚举 CHECK 约束', () => {
  const db = freshDb();
  const now = Date.now();
  assert.throws(() => {
    db.prepare(
      `INSERT INTO rooms (id, code, status, seq, created_at, updated_at) VALUES ('r1', 'ABCDE', 'BAD_STATUS', 0, ?, ?)`,
    ).run(now, now);
  }, /CHECK/i);
  db.close();
});

test('withTransaction：失败回滚不留部分状态', () => {
  const db = freshDb();
  const now = Date.now();
  assert.throws(() => {
    withTransaction(db, () => {
      db.prepare(
        `INSERT INTO rooms (id, code, status, seq, created_at, updated_at) VALUES ('r1', 'ABCDE', 'LOBBY', 0, ?, ?)`,
      ).run(now, now);
      throw new Error('模拟失败');
    });
  }, /模拟失败/);
  const row = db.prepare("SELECT 1 FROM rooms WHERE id = 'r1'").get();
  assert.equal(row, undefined);
  db.close();
});

test('integrityCheck：新库通过', () => {
  const db = freshDb();
  assert.equal(integrityCheck(db), true);
  db.close();
});
