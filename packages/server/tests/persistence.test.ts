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

/** 从迁移表派生期望版本号：新增迁移时不必再改断言 */
const ALL_VERSIONS = MIGRATIONS.map((m) => m.version);

test('migrate：版本唯一且 v5 退役旧游戏先于 v6 增加准备状态', () => {
  assert.deepEqual(ALL_VERSIONS, [...new Set(ALL_VERSIONS)].sort((a, b) => a - b));
  const v5Index = MIGRATIONS.findIndex((migration) => migration.name === 'retire-removed-game-sessions');
  const v6Index = MIGRATIONS.findIndex((migration) => migration.name === 'add-member-ready');
  assert.ok(v5Index >= 0);
  assert.ok(v6Index > v5Index);
  assert.equal(MIGRATIONS[v5Index]?.version, 5);
  assert.equal(MIGRATIONS[v6Index]?.version, 6);
});

test('migrate：重复执行幂等', () => {
  const db = openDb({ path: ':memory:' });
  const first = migrate(db);
  assert.deepEqual(first, ALL_VERSIONS);
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

  // 只应用过 v1，余下版本一次补齐
  assert.deepEqual(migrate(db), ALL_VERSIONS.slice(1));
  const room = db.prepare("SELECT game_id FROM rooms WHERE id = 'legacy'").get() as {
    game_id: string | null;
  };
  assert.equal(room.game_id, 'undercover');
  db.close();
});

test('migrate：v4 既有数据经 v5/v6 安全升级且重复执行幂等', () => {
  const db = openDb({ path: ':memory:' });
  assert.deepEqual(migrate(db, MIGRATIONS.slice(0, 4)), [1, 2, 3, 4]);
  const now = Date.now();
  db.prepare(
    `INSERT INTO rooms (id, code, status, game_id, seq, created_at, updated_at)
     VALUES ('removed-room', 'OLD01', 'IN_GAME', 'richman', 0, ?, ?)`,
  ).run(now, now);
  db.prepare(
    `INSERT INTO room_members
       (room_id, player_id, nickname, seat_role, seat, connection_status,
        resume_token_hash, joined_at, is_bot, bot_kind)
     VALUES ('removed-room', 'legacy-player', '旧玩家', 'player', 1, 'CONNECTED',
             'hash', ?, 0, NULL)`,
  ).run(now);
  db.prepare(
    `INSERT INTO game_sessions
       (id, room_id, module_id, module_version, state_schema_version, status,
        snapshot_json, seed, rng_state_json, created_at, updated_at)
     VALUES ('removed-session', 'removed-room', 'richman', '1.0.0', 1, 'ACTIVE',
             '{}', 'seed-active', '{}', ?, ?)`,
  ).run(now, now);
  db.prepare(
    `INSERT INTO timers (session_id, timer_id, deadline_at, action_json, status)
     VALUES ('removed-session', 'turn', ?, '{}', 'pending')`,
  ).run(now + 1000);
  db.prepare(
    `INSERT INTO game_sessions
       (id, room_id, module_id, module_version, state_schema_version, status,
        snapshot_json, seed, rng_state_json, created_at, updated_at)
     VALUES ('finished-session', 'removed-room', 'richman', '1.0.0', 1, 'FINISHED',
             '{"winner":"p1"}', 'seed-finished', '{}', ?, ?)`,
  ).run(now, now);
  db.prepare(
    `INSERT INTO game_results (id, session_id, module_id, result_json, created_at)
     VALUES ('finished-result', 'finished-session', 'richman', '{"winner":"p1"}', ?)`,
  ).run(now);

  // v7 重建 game_sessions 后：已 ABORTED/FINISHED 的历史行不被反转（与 v5 退役语义一致）；
  // 只有仍处于活动态的未注册 module 会话会被标 SUSPENDED + FAILED_RULESET_UNAVAILABLE。
  // D4-A1：v8 追加 adjudication_tasks（普通 CREATE TABLE，不触碰既有数据）。
  assert.deepEqual(migrate(db), [5, 6, 7, 8]);
  assert.deepEqual(migrate(db), []);
  assert.equal(
    (db.prepare("SELECT status FROM rooms WHERE id = 'removed-room'").get() as { status: string }).status,
    'CLOSED',
  );
  const removedSession = db
    .prepare("SELECT status, failure FROM game_sessions WHERE id = 'removed-session'")
    .get() as { status: string; failure: string | null };
  assert.equal(removedSession.status, 'ABORTED');
  assert.equal(removedSession.failure, null);
  assert.equal(
    (db.prepare("SELECT status FROM timers WHERE session_id = 'removed-session'").get() as { status: string }).status,
    'cancelled',
  );
  assert.equal(
    (db.prepare("SELECT status FROM game_sessions WHERE id = 'finished-session'").get() as { status: string }).status,
    'FINISHED',
  );
  assert.equal(
    (db.prepare("SELECT result_json FROM game_results WHERE id = 'finished-result'").get() as { result_json: string }).result_json,
    '{"winner":"p1"}',
  );
  const member = db
    .prepare("SELECT nickname, is_bot, ready FROM room_members WHERE player_id = 'legacy-player'")
    .get() as { nickname: string; is_bot: number; ready: number };
  assert.equal(member.nickname, '旧玩家');
  assert.equal(member.is_bot, 0);
  assert.equal(member.ready, 0);
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
        `INSERT INTO game_sessions (id, room_id, module_id, module_version, state_schema_version, status, snapshot_json, seed, rng_state_json, ruleset_id, created_at, updated_at)
         VALUES (?, 'r1', 'undercover', '1.0.0', 1, ?, '{}', 'seed', '{}', 'undercover_classic_v1', ?, ?)`,
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
