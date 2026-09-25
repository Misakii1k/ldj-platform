/**
 * Migration v7：add-session-ruleset-identity
 *
 * 重建 game_sessions，引入权威 ruleset_id、SUSPENDED 状态与失败列。
 * 覆盖：列结构、ruleset_id 回填（V2 信封 / werewolf config / legacy 模块兜底）、
 * 未注册模块 SUSPENDED 标记、子表数据保留、唯一活动索引、外键完整性与幂等。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, type Db } from '../src/persistence/db.ts';
import { migrate } from '../src/persistence/migrator.ts';
import { MIGRATIONS } from '../src/persistence/migrations.ts';

const UP_TO_V6 = MIGRATIONS.filter((m) => m.version <= 6);

const EXPECTED_COLUMNS = [
  'id',
  'room_id',
  'module_id',
  'module_version',
  'state_schema_version',
  'status',
  'snapshot_json',
  'seed',
  'rng_state_json',
  'last_seq',
  'created_at',
  'updated_at',
  'ruleset_id',
  'failure',
  'failure_details_json',
];

/** V2 快照信封（UNO / 卧底），顶层含权威 rulesetId */
function v2Envelope(gameId: string, rulesetId: string): string {
  return JSON.stringify({
    engineContractVersion: 2,
    gameId,
    rulesetId,
    schemaVersion: 1,
    createdAtSequence: 1,
    stateDigest: 'a'.repeat(64),
    rngState: { cursor: 0 },
    state: {},
  });
}

function insertRoom(db: Db, id: string, code: string) {
  const now = Date.now();
  db.prepare(
    `INSERT INTO rooms (id, code, status, seq, created_at, updated_at)
     VALUES (?, ?, 'IN_GAME', 0, ?, ?)`,
  ).run(id, code, now, now);
}

interface SessionSeed {
  id: string;
  roomId: string;
  moduleId: string;
  status: string;
  snapshotJson: string;
  stateSchemaVersion?: number;
}

function insertSession(db: Db, s: SessionSeed) {
  const now = Date.now();
  db.prepare(
    `INSERT INTO game_sessions
       (id, room_id, module_id, module_version, state_schema_version, status,
        snapshot_json, seed, rng_state_json, created_at, updated_at)
     VALUES (?, ?, ?, '1.0.0', ?, ?, ?, 'seed', '{}', ?, ?)`,
  ).run(s.id, s.roomId, s.moduleId, s.stateSchemaVersion ?? 1, s.status, s.snapshotJson, now, now);
}

/**
 * 构造只应用过 v1..v6 的库并插入 fixture，随后执行完整 migrate（应用 v7）。
 * 返回已迁移的 db 以及 v7 应用结果。
 */
function buildMigratedDb(): { db: Db; applied: number[] } {
  const db = openDb({ path: ':memory:' });
  migrate(db, UP_TO_V6);

  insertRoom(db, 'r-a', 'ROOMA');
  insertRoom(db, 'r-b', 'ROOMB');
  insertRoom(db, 'r-c', 'ROOMC');
  insertRoom(db, 'r-d', 'ROOMD');
  insertRoom(db, 'r-e', 'ROOME');

  // A：卧底 V2 信封（rulesetId 顶层字段）
  insertSession(db, {
    id: 's-uc',
    roomId: 'r-a',
    moduleId: 'undercover',
    status: 'ACTIVE',
    snapshotJson: v2Envelope('undercover', 'undercover_classic_v1'),
  });
  // B：UNO V2 信封
  insertSession(db, {
    id: 's-uno',
    roomId: 'r-a',
    moduleId: 'uno',
    status: 'FINISHED',
    snapshotJson: v2Envelope('uno', 'uno_legacy_platform_v1'),
  });
  // C：狼人 legacy 原始状态，config 无 rulesetId
  insertSession(db, {
    id: 's-ww',
    roomId: 'r-b',
    moduleId: 'werewolf',
    status: 'ACTIVE',
    stateSchemaVersion: 4,
    snapshotJson: JSON.stringify({ schemaVersion: 4, phase: 'night', config: {} }),
  });
  // C2：狼人 legacy 原始状态，config.rulesetId 显式为 legacy 基线
  insertSession(db, {
    id: 's-ww3',
    roomId: 'r-b',
    moduleId: 'werewolf',
    status: 'FINISHED',
    stateSchemaVersion: 4,
    snapshotJson: JSON.stringify({
      schemaVersion: 4,
      phase: 'night',
      config: { rulesetId: 'werewolf_legacy_platform_v2' },
    }),
  });
  // D：狼人原始状态，config.rulesetId = open_kill
  insertSession(db, {
    id: 's-ww2',
    roomId: 'r-b',
    moduleId: 'werewolf',
    status: 'FINISHED',
    stateSchemaVersion: 4,
    snapshotJson: JSON.stringify({
      schemaVersion: 4,
      phase: 'night',
      config: { rulesetId: 'werewolf_platform_open_kill_v1' },
    }),
  });
  // E：斗地主 legacy 原始状态
  insertSession(db, {
    id: 's-ll',
    roomId: 'r-c',
    moduleId: 'landlord',
    status: 'ACTIVE',
    snapshotJson: JSON.stringify({ phase: 'playing', players: {} }),
  });
  // F：未注册模块（richman）活动态
  insertSession(db, {
    id: 's-rm',
    roomId: 'r-d',
    moduleId: 'richman',
    status: 'ACTIVE',
    snapshotJson: JSON.stringify({ phase: 'x' }),
  });
  // G：未注册模块但 v5 已结算的历史行（ABORTED）——不得被 v7 反转
  insertSession(db, {
    id: 's-rm-aborted',
    roomId: 'r-d',
    moduleId: 'richman',
    status: 'ABORTED',
    snapshotJson: JSON.stringify({ phase: 'x' }),
  });

  // fixture A 的子表数据：迁移后必须原样保留引用
  const now = Date.now();
  db.prepare(
    `INSERT INTO game_events (session_id, seq, command_time, actor_json, action_json, events_json)
     VALUES ('s-uc', 0, ?, '{}', '{}', '[]')`,
  ).run(now);
  db.prepare(
    `INSERT INTO timers (session_id, timer_id, deadline_at, action_json, status)
     VALUES ('s-uc', 'turn-timer', ?, '{}', 'pending')`,
  ).run(now + 1000);
  db.prepare(
    `INSERT INTO game_results (id, session_id, module_id, result_json, created_at)
     VALUES ('res-uc', 's-uc', 'undercover', '{}', ?)`,
  ).run(now);

  const applied = migrate(db);
  return { db, applied };
}

test('v7：game_sessions 新增规则身份列且 status 允许 SUSPENDED', () => {
  const { db, applied } = buildMigratedDb();
  assert.ok(applied.includes(7));
  const migration = MIGRATIONS.find((m) => m.version === 7);
  assert.ok(migration);
  assert.equal(migration.name, 'add-session-ruleset-identity');

  const cols = (db.prepare('PRAGMA table_info(game_sessions)').all() as { name: string }[]).map(
    (c) => c.name,
  );
  assert.deepEqual(cols, EXPECTED_COLUMNS);
  const ddl = (db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'game_sessions'").get() as {
    sql: string;
  }).sql;
  assert.match(ddl, /SUSPENDED/);
  db.close();
});

test('v7：ruleset_id 回填（V2 信封 / werewolf config / legacy 模块兜底）', () => {
  const { db } = buildMigratedDb();
  const rows = db
    .prepare('SELECT id, ruleset_id FROM game_sessions')
    .all() as { id: string; ruleset_id: string }[];
  const byId = Object.fromEntries(rows.map((r) => [r.id, r.ruleset_id]));
  assert.deepEqual(byId, {
    's-uc': 'undercover_classic_v1',
    's-uno': 'uno_legacy_platform_v1',
    's-ww': 'werewolf_legacy_platform_v2',
    's-ww3': 'werewolf_legacy_platform_v2',
    's-ww2': 'werewolf_platform_open_kill_v1',
    's-ll': 'landlord_legacy_platform_v1',
    's-rm': 'unregistered_module',
    's-rm-aborted': 'unregistered_module',
  });
  db.close();
});

test('v7：未注册模块活动会话标记 SUSPENDED，已结算历史行不反转', () => {
  const { db } = buildMigratedDb();
  const active = db
    .prepare("SELECT status, failure FROM game_sessions WHERE id = 's-rm'")
    .get() as { status: string; failure: string | null };
  assert.equal(active.status, 'SUSPENDED');
  assert.equal(active.failure, 'FAILED_RULESET_UNAVAILABLE');
  const aborted = db
    .prepare("SELECT status, failure FROM game_sessions WHERE id = 's-rm-aborted'")
    .get() as { status: string; failure: string | null };
  assert.equal(aborted.status, 'ABORTED');
  assert.equal(aborted.failure, null);
  db.close();
});

test('v7：子表数据保留且仍可 join 回会话', () => {
  const { db } = buildMigratedDb();
  assert.equal(
    (db.prepare("SELECT count(*) AS c FROM game_events WHERE session_id = 's-uc'").get() as { c: number }).c,
    1,
  );
  assert.equal(
    (db.prepare("SELECT count(*) AS c FROM timers WHERE session_id = 's-uc'").get() as { c: number }).c,
    1,
  );
  assert.equal(
    (db.prepare("SELECT count(*) AS c FROM game_results WHERE session_id = 's-uc'").get() as { c: number }).c,
    1,
  );
  const joined = db
    .prepare(
      `SELECT e.seq, s.ruleset_id FROM game_events e
       JOIN game_sessions s ON s.id = e.session_id WHERE e.session_id = 's-uc'`,
    )
    .get() as { seq: number; ruleset_id: string };
  assert.equal(joined.seq, 0);
  assert.equal(joined.ruleset_id, 'undercover_classic_v1');
  const timerJoin = db
    .prepare(
      `SELECT t.timer_id, s.ruleset_id FROM timers t
       JOIN game_sessions s ON s.id = t.session_id WHERE t.session_id = 's-uc'`,
    )
    .get() as { timer_id: string; ruleset_id: string };
  assert.equal(timerJoin.timer_id, 'turn-timer');
  assert.equal(timerJoin.ruleset_id, 'undercover_classic_v1');
  db.close();
});

test('v7：唯一活动对局索引仍生效（SUSPENDED 计入活动集合）', () => {
  const { db } = buildMigratedDb();
  const now = Date.now();
  const insertActive = (id: string, roomId: string, rulesetId: string) =>
    db
      .prepare(
        `INSERT INTO game_sessions
           (id, room_id, module_id, module_version, state_schema_version, status,
            snapshot_json, seed, rng_state_json, created_at, updated_at, ruleset_id)
         VALUES (?, ?, 'uno', '1.0.0', 1, 'ACTIVE', '{}', 'seed', '{}', ?, ?, ?)`,
      )
      .run(id, roomId, now, now, rulesetId);

  // r-a 已有 ACTIVE（s-uc）：再插 ACTIVE 被拒
  assert.throws(() => insertActive('s-x', 'r-a', 'uno_legacy_platform_v1'), /UNIQUE/i);
  // FINISHED 不受限制
  db.prepare(
    `INSERT INTO game_sessions
       (id, room_id, module_id, module_version, state_schema_version, status,
        snapshot_json, seed, rng_state_json, created_at, updated_at, ruleset_id)
     VALUES ('s-y', 'r-a', 'uno', '1.0.0', 1, 'FINISHED', '{}', 'seed', '{}', ?, ?, 'uno_legacy_platform_v1')`,
  ).run(now, now);
  // r-d 的 richman 已 SUSPENDED：SUSPENDED 计入活动集合，再插 ACTIVE 被拒
  assert.throws(() => insertActive('s-z', 'r-d', 'uno_legacy_platform_v1'), /UNIQUE/i);
  // 空房 r-e 允许一个 ACTIVE
  insertActive('s-e1', 'r-e', 'uno_legacy_platform_v1');
  db.close();
});

test('v7：迁移后 PRAGMA foreign_key_check 无违规', () => {
  const { db } = buildMigratedDb();
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  db.close();
});

test('v7：幂等，重复 migrate 不再应用任何迁移', () => {
  const { db, applied } = buildMigratedDb();
  // v9（private-room-chat）是当前最末迁移
  assert.deepEqual(applied.slice(-1), [9]);
  assert.deepEqual(migrate(db), []);
  db.close();
});

test('v7：ruleset_id NOT NULL 强制', () => {
  const { db } = buildMigratedDb();
  const now = Date.now();
  assert.throws(() => {
    db.prepare(
      `INSERT INTO game_sessions
         (id, room_id, module_id, module_version, state_schema_version, status,
          snapshot_json, seed, rng_state_json, created_at, updated_at)
       VALUES ('s-no-ruleset', 'r-a', 'uno', '1.0.0', 1, 'FINISHED', '{}', 'seed', '{}', ?, ?)`,
    ).run(now, now);
  }, /NOT NULL/i);
  db.close();
});
