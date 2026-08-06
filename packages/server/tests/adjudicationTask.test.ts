/**
 * D4-A1：持久化外部裁判任务（migration v8 adjudication_tasks）。
 * 覆盖（TDD 步骤 1–6）：
 *   1. migration v8 升级（列集合 / status CHECK / 索引 / FK CASCADE / 幂等）
 *   2. enqueue_adjudication effect → 房间事务提交后落库（提交前不存在）
 *   3. external_task_result 再入 exactly-once（同 task_id 第二次丢弃；重放不重复）
 *   4. 重启续跑 pending/running 任务且不重复消耗；已结算会话迟到结果丢弃
 *   6. Refactor：外部结果只经 system 动作 external_task_result 进入串行事务链
 * 全程使用可编程 stub 模块：不调用真实模型、不发起网络。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unlinkSync, existsSync } from 'node:fs';
import {
  type AnyGameModuleV2,
  type GameContext,
  type GameEffect,
} from '@ldj/shared';
import { openDb, closeDb, type Db } from '../src/persistence/db.ts';
import { migrate } from '../src/persistence/migrator.ts';
import { MIGRATIONS } from '../src/persistence/migrations.ts';
import { RoomCommandExecutor } from '../src/core/executor.ts';
import { RoomQueues } from '../src/core/queue.ts';
import { seedRoom } from './helpers/seedRoom.ts';
import { applyJoinRoom } from '../src/core/commands/joinRoom.ts';
import {
  applySessionAction,
  loadSessionState,
  startGame,
  type SessionRow,
} from '../src/core/game/session.ts';
import { runStartupRecovery } from '../src/core/recovery.ts';
import { createSnapshotEnvelope } from '../src/core/game/snapshotEnvelope.ts';
import { AdjudicationTaskQueue, replayUnappliedAdjudicationResults } from '../src/core/adjudication/taskQueue.ts';
import {
  adjudicationRetryDelayMs,
  getAdjudicationTask,
  markAdjudicationTaskErrored,
  nextPendingAdjudicationTask,
  settleAdjudicationTasks,
  type AdjudicationTaskStatus,
} from '../src/core/adjudication/taskStore.ts';
import { createLogger } from '../src/boot/logger.ts';

const silentLogger = createLogger('error', {}, () => {});

const EXPECTED_TASK_COLUMNS = [
  'task_id',
  'session_id',
  'ruleset_id',
  'task_type',
  'submitted_at_seq',
  'eligibility_digest',
  'input_digest',
  'input_plaintext_json',
  'status',
  'primary_attempt_json',
  'fallback_attempt_json',
  'result_json',
  'created_at',
  'updated_at',
];

test('v8：MIGRATIONS 包含 version 8 且名称正确', () => {
  const migration = MIGRATIONS.find((m) => m.version === 8);
  assert.ok(migration, 'MIGRATIONS 应包含 v8');
  assert.equal(migration.name, 'add-adjudication-tasks');
});

test('v8：adjudication_tasks 列集合、主键与约束', () => {
  const db = openDb({ path: ':memory:' });
  try {
    migrate(db);
    const cols = (db.prepare('PRAGMA table_info(adjudication_tasks)').all() as {
      name: string;
      type: string;
      notnull: number;
      pk: number;
    }[]);
    assert.deepEqual(
      cols.map((c) => c.name),
      EXPECTED_TASK_COLUMNS,
    );
    const pk = cols.find((c) => c.pk === 1);
    assert.equal(pk?.name, 'task_id');
    // task_id 是 TEXT PRIMARY KEY（rowid 别名，隐含 NOT NULL，table_info 的 notnull 报 0）
    for (const required of [
      'session_id',
      'ruleset_id',
      'task_type',
      'submitted_at_seq',
      'eligibility_digest',
      'input_digest',
      'status',
      'created_at',
      'updated_at',
    ]) {
      assert.equal(cols.find((c) => c.name === required)?.notnull, 1, `${required} 应 NOT NULL`);
    }
    assert.equal(
      cols.find((c) => c.name === 'input_plaintext_json')?.notnull,
      0,
      'input_plaintext_json 应可空（结果应用后擦除）',
    );
    const ddl = (db.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'adjudication_tasks'",
    ).get() as { sql: string }).sql;
    assert.match(ddl, /REFERENCES game_sessions\(id\) ON DELETE CASCADE/);
    assert.match(ddl, /CHECK \(status IN \('pending','running','done','discarded','errored'\)\)/);
    const idx = db.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'idx_adjudication_tasks_session'",
    ).get() as { sql: string };
    assert.ok(idx, '会话索引应存在');
    assert.match(idx.sql, /session_id/);
    assert.match(idx.sql, /status/);
  } finally {
    closeDb(db);
  }
});

test('v8：status CHECK 枚举拒绝非法状态', () => {
  const db = openDb({ path: ':memory:' });
  try {
    migrate(db);
    assert.throws(
      () =>
        db
          .prepare(
            `INSERT INTO adjudication_tasks
               (task_id, session_id, ruleset_id, task_type, submitted_at_seq,
                eligibility_digest, input_digest, status, created_at, updated_at)
             VALUES ('t-bad', 's-none', 'r', 'x', 1, 'a', 'b', 'bogus', 1, 1)`,
          )
          .run(),
      /CHECK/i,
    );
  } finally {
    closeDb(db);
  }
});

test('v8：FK ON DELETE CASCADE、foreign_key_check 干净且迁移幂等', () => {
  const db = openDb({ path: ':memory:' });
  try {
    migrate(db);
    const now = Date.now();
    const roomId = 'r-v8-fk';
    db.prepare(
      `INSERT INTO rooms (id, code, status, seq, created_at, updated_at)
       VALUES (?, ?, 'IN_GAME', 0, ?, ?)`,
    ).run(roomId, 'V8FKA', now, now);
    const sessionId = 's-v8-fk';
    db.prepare(
      `INSERT INTO game_sessions
         (id, room_id, module_id, module_version, state_schema_version, status,
          snapshot_json, seed, rng_state_json, ruleset_id, last_seq, created_at, updated_at)
       VALUES (?, ?, 'uno', '1.0.0', 1, 'ACTIVE', '{}', 'seed', '{}',
               'uno_legacy_platform_v1', 0, ?, ?)`,
    ).run(sessionId, roomId, now, now);
    db.prepare(
      `INSERT INTO adjudication_tasks
         (task_id, session_id, ruleset_id, task_type, submitted_at_seq,
          eligibility_digest, input_digest, status, created_at, updated_at)
       VALUES ('t-fk', ?, 'uno_legacy_platform_v1', 'verdict', 1, 'elig', 'inp', 'pending', ?, ?)`,
    ).run(sessionId, now, now);

    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);

    // 删除会话 → 任务级联删除
    db.prepare('DELETE FROM game_sessions WHERE id = ?').run(sessionId);
    const remaining = db
      .prepare("SELECT COUNT(*) AS n FROM adjudication_tasks WHERE task_id = 't-fk'")
      .get() as { n: number };
    assert.equal(remaining.n, 0, '会话删除后任务应级联删除');
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);

    // 幂等：重复 migrate 不再应用任何迁移
    assert.deepEqual(migrate(db), []);
  } finally {
    closeDb(db);
  }
});

function tempDbPath(): string {
  return join(tmpdir(), `ldj-a1-${randomUUID()}.db`);
}

function cleanupDb(path: string): void {
  for (const f of [path, `${path}-wal`, `${path}-shm`]) {
    try {
      if (existsSync(f)) unlinkSync(f);
    } catch {
      // 忽略清理失败
    }
  }
}

// ---------------------------------------------------------------------------
// 可编程 stub 模块：接受 emit_adjudication（声明任务）与 external_task_result
// （应用结果），其余动作拒绝。状态 { players: [], log }；结果回灌时记录 applied。
// 绝不调用真实模型、不发起网络。
// ---------------------------------------------------------------------------

const STUB_MANIFEST = {
  id: 'adjudication-stub',
  version: '1.0.0',
  displayName: 'A1 外部裁判任务桩',
  minPlayers: 1,
  maxPlayers: 8,
  stateSchemaVersion: 1,
} as const;

const STUB_RULESET = 'adjudication_stub_v1';

const STUB_IDENTITY = {
  engineContractVersion: 2,
  rulesetId: STUB_RULESET,
  viewVersion: 1,
} as const;

interface StubState {
  players: string[];
  log: { type: string; taskId?: string; seq?: number }[];
}

interface StubContext {
  applied: { taskId: string; expectedSequence: number }[];
  emitted: string[];
}

function stubModule(stub: StubContext): AnyGameModuleV2 {
  return {
    manifest: STUB_MANIFEST,
    identity: STUB_IDENTITY,
    registeredRulesets: [STUB_RULESET],
    defaultRulesetId: STUB_RULESET,
    parseConfig: (input) => input as Record<string, unknown>,
    parseAction: (input) => {
      const action = input as { type?: unknown };
      if (action.type === 'emit_adjudication' || action.type === 'external_task_result') {
        return input;
      }
      throw new Error('stub：未知动作');
    },
    parseState: (input) => input as StubState,
    parsePlayerView: (state) => state as StubState,
    parseSpectatorView: (state) => state as StubState,
    assertInvariants: () => {},
    snapshotMigrations: {},
    createInitialState: () => ({ players: [], log: [] }),
    reduce: (_ctx: GameContext, state: unknown, _actor: unknown, action: unknown) => {
      const current = state as StubState;
      const typed = action as { type?: string };
      if (typed.type === 'emit_adjudication') {
        const a = action as {
          taskId: string;
          sessionId: string;
          rulesetId: string;
          taskType: string;
          submittedAtSeq: number;
          eligibilityDigest: string;
          inputDigest: string;
          inputPlaintextJson: string | null;
        };
        stub.emitted.push(a.taskId);
        return {
          ok: true,
          nextState: { ...current, log: [...current.log, { type: 'emitted', taskId: a.taskId }] },
          publicEvents: [{ type: 'adjudication_requested', taskId: a.taskId }],
          privateEvents: [],
          effects: [
            {
              type: 'enqueue_adjudication',
              taskId: a.taskId,
              sessionId: a.sessionId,
              rulesetId: a.rulesetId,
              taskType: a.taskType,
              submittedAtSeq: a.submittedAtSeq,
              eligibilityDigest: a.eligibilityDigest,
              inputDigest: a.inputDigest,
              inputPlaintextJson: a.inputPlaintextJson,
            },
          ] as unknown as readonly GameEffect[],
          resultCandidate: null,
        };
      }
      if (typed.type === 'external_task_result') {
        const a = action as { taskId: string; expectedSequence: number; result: unknown };
        stub.applied.push({ taskId: a.taskId, expectedSequence: a.expectedSequence });
        return {
          ok: true,
          nextState: {
            ...current,
            log: [...current.log, { type: 'applied', taskId: a.taskId, seq: a.expectedSequence }],
          },
          publicEvents: [{ type: 'adjudication_applied', taskId: a.taskId }],
          privateEvents: [],
          effects: [],
          resultCandidate: null,
        };
      }
      return { ok: false, code: 'NOT_ALLOWED', message: 'stub：未知动作' };
    },
    getPlayerView: (state) => state as StubState,
    getSpectatorView: (state) => state as StubState,
  };
}

function insertSessionRow(
  db: Db,
  opts: { sessionId: string; roomId: string; status?: string; lastSeq?: number },
): void {
  const now = Date.now();
  const snapshot = createSnapshotEnvelope({
    gameId: STUB_MANIFEST.id,
    rulesetId: STUB_RULESET,
    schemaVersion: STUB_MANIFEST.stateSchemaVersion,
    createdAtSequence: 0,
    rngState: { cursor: 0 },
    state: { players: [], log: [] },
  });
  db.prepare(
    `INSERT INTO game_sessions
       (id, room_id, module_id, module_version, state_schema_version, status,
        snapshot_json, seed, rng_state_json, ruleset_id, last_seq, created_at, updated_at)
     VALUES (?, ?, 'adjudication-stub', '1.0.0', 1, ?, ?, 'seed', ?, ?, ?, ?, ?)`,
  ).run(
    opts.sessionId,
    opts.roomId,
    opts.status ?? 'ACTIVE',
    JSON.stringify(snapshot),
    JSON.stringify({ cursor: 0 }),
    STUB_RULESET,
    opts.lastSeq ?? 0,
    now,
    now,
  );
}

function insertTaskRow(
  db: Db,
  opts: {
    taskId: string;
    sessionId: string;
    status?: AdjudicationTaskStatus;
    submittedAtSeq?: number;
    inputPlaintextJson?: string | null;
  },
): void {
  const now = Date.now();
  db.prepare(
    `INSERT INTO adjudication_tasks
       (task_id, session_id, ruleset_id, task_type, submitted_at_seq,
        eligibility_digest, input_digest, input_plaintext_json, status, created_at, updated_at)
     VALUES (?, ?, ?, 'verdict', ?, 'elig', 'inp', ?, ?, ?, ?)`,
  ).run(
    opts.taskId,
    opts.sessionId,
    STUB_RULESET,
    opts.submittedAtSeq ?? 1,
    opts.inputPlaintextJson ?? '{"guess":"西瓜"}',
    opts.status ?? 'pending',
    now,
    now,
  );
}

async function waitFor(cond: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  for (;;) {
    if (cond()) return;
    if (Date.now() - start > timeoutMs) throw new Error('waitFor 超时');
    await new Promise((r) => setTimeout(r, 10));
  }
}

// ---------------------------------------------------------------------------
// TDD 步骤 2：enqueue_adjudication → 房间事务提交后落库
// ---------------------------------------------------------------------------

test('A1：enqueue_adjudication 在房间事务提交后落库（提交前不存在）', async () => {
  const db = openDb({ path: ':memory:' });
  try {
    migrate(db);
    const seeded = seedRoom(db);
    const sessionId = 's-a1-emit';
    insertSessionRow(db, { sessionId, roomId: seeded.roomId });
    const session = db
      .prepare('SELECT * FROM game_sessions WHERE id = ?')
      .get(sessionId) as unknown as SessionRow;
    const stub: StubContext = { applied: [], emitted: [] };
    const module = stubModule(stub);

    const postCommitRef: { fn?: (roomId: string, outcome: unknown) => void } = {};
    const executor = new RoomCommandExecutor(db, new RoomQueues(), (roomId, outcome) =>
      postCommitRef.fn?.(roomId, outcome),
    );
    const queue = new AdjudicationTaskQueue({
      db,
      executor,
      dispatchTask: async () => ({}),
      resolveModule: () => module,
      onError: () => {},
    });
    postCommitRef.fn = (roomId, outcome) => queue.handleCommitted(roomId, outcome);

    const taskId = 'task-emit-1';
    const submittedAtSeq = session.last_seq + 1;
    let insideCount = -1;
    const result = await executor.executeOnRoom({
      roomId: seeded.roomId,
      actorScope: 'conn:a1',
      requestId: 'req-a1-emit',
      handler: (tx) => {
        const outcome = applySessionAction(
          tx,
          session,
          { kind: 'system', source: 'admin' },
          {
            type: 'emit_adjudication',
            taskId,
            sessionId,
            rulesetId: STUB_RULESET,
            taskType: 'verdict',
            submittedAtSeq,
            eligibilityDigest: 'elig-1',
            inputDigest: 'inp-1',
            inputPlaintextJson: '{"word":"西瓜"}',
          },
          'req-a1-emit',
          module,
        );
        insideCount = (
          tx.db.prepare('SELECT COUNT(*) AS n FROM adjudication_tasks').get() as { n: number }
        ).n;
        return outcome;
      },
    });

    assert.equal(result.replayed, false);
    assert.equal(insideCount, 0, '房间事务提交前任务行不应存在');

    const task = getAdjudicationTask(db, taskId);
    assert.ok(task, '提交后任务应已落库');
    assert.equal(task.sessionId, sessionId);
    assert.equal(task.rulesetId, STUB_RULESET);
    assert.equal(task.taskType, 'verdict');
    assert.equal(task.status, 'pending');
    assert.equal(task.submittedAtSeq, submittedAtSeq);
    assert.equal(task.eligibilityDigest, 'elig-1');
    assert.equal(task.inputDigest, 'inp-1');
    assert.equal(task.inputPlaintextJson, '{"word":"西瓜"}');
    assert.equal(stub.emitted.length, 1, 'reduce 声明一次任务');
  } finally {
    closeDb(db);
  }
});

test('A1：任务创建失败不影响已提交的房间事务', async () => {
  const db = openDb({ path: ':memory:' });
  try {
    migrate(db);
    const seeded = seedRoom(db);
    const sessionId = 's-a1-fail';
    insertSessionRow(db, { sessionId, roomId: seeded.roomId });
    const session = db
      .prepare('SELECT * FROM game_sessions WHERE id = ?')
      .get(sessionId) as unknown as SessionRow;
    const stub: StubContext = { applied: [], emitted: [] };
    const module = stubModule(stub);

    // postCommit 直接抛错（模拟任务落库失败）：不得影响已提交的房间事务
    const executor = new RoomCommandExecutor(db, new RoomQueues(), () => {
      throw new Error('post-commit boom');
    });
    const result = await executor.executeOnRoom({
      roomId: seeded.roomId,
      actorScope: 'conn:a1f',
      requestId: 'req-a1-fail',
      handler: (tx) =>
        applySessionAction(
          tx,
          session,
          { kind: 'system', source: 'admin' },
          {
            type: 'emit_adjudication',
            taskId: 'task-fail',
            sessionId,
            rulesetId: STUB_RULESET,
            taskType: 'verdict',
            submittedAtSeq: session.last_seq + 1,
            eligibilityDigest: 'e',
            inputDigest: 'i',
            inputPlaintextJson: null,
          },
          'req-a1-fail',
          module,
        ),
    });

    assert.equal(result.replayed, false);
    // 房间事务已提交：seq 推进 + 回执写入 + 事件流水写入
    const room = db
      .prepare('SELECT seq FROM rooms WHERE id = ?')
      .get(seeded.roomId) as { seq: number };
    assert.equal(room.seq, 2, '命令 seq 应已推进');
    const receipt = db
      .prepare("SELECT 1 FROM command_receipts WHERE request_id = 'req-a1-fail'")
      .get();
    assert.ok(receipt, '幂等回执应已写入');
    const events = db
      .prepare('SELECT COUNT(*) AS n FROM game_events WHERE session_id = ?')
      .get(sessionId) as { n: number };
    assert.equal(events.n, 1);
    // 任务创建失败被吞掉：命令不因 post-commit 失败而回滚
    assert.equal(getAdjudicationTask(db, 'task-fail'), undefined);
  } finally {
    closeDb(db);
  }
});

// ---------------------------------------------------------------------------
// TDD 步骤 3：external_task_result 再入 exactly-once
// ---------------------------------------------------------------------------

test('A1：external_task_result 再入 exactly-once（第二次丢弃；重放不重复）', async () => {
  const db = openDb({ path: ':memory:' });
  try {
    migrate(db);
    const seeded = seedRoom(db);
    const sessionId = 's-a1-exactly';
    insertSessionRow(db, { sessionId, roomId: seeded.roomId });
    insertTaskRow(db, { taskId: 'task-x1', sessionId, submittedAtSeq: 1 });
    const stub: StubContext = { applied: [], emitted: [] };
    const module = stubModule(stub);
    let dispatchCount = 0;
    const executor = new RoomCommandExecutor(db, new RoomQueues());
    const queue = new AdjudicationTaskQueue({
      db,
      executor,
      dispatchTask: async () => {
        dispatchCount += 1;
        return { verdict: 'civilian', confidence: 0.9 };
      },
      resolveModule: () => module,
    });
    queue.start();
    await waitFor(() => getAdjudicationTask(db, 'task-x1')?.status === 'done');
    queue.stop();

    assert.equal(dispatchCount, 1, '任务只调度一次');
    assert.equal(stub.applied.length, 1, '结果只回灌一次');
    assert.equal(stub.applied[0]!.taskId, 'task-x1');
    assert.equal(stub.applied[0]!.expectedSequence, 1);

    const task = getAdjudicationTask(db, 'task-x1')!;
    assert.equal(task.status, 'done');
    assert.equal(task.inputPlaintextJson, null, '结果应用后明文输入应擦除');
    assert.ok(task.resultJson, '结果应持久化到任务行');
    assert.equal((JSON.parse(task.resultJson!) as { verdict: string }).verdict, 'civilian');

    // Refactor：结果必须经系统动作 external_task_result 进入房间串行事务链
    const injected = db
      .prepare('SELECT actor_json, action_json FROM game_events WHERE session_id = ? AND seq = ?')
      .get(sessionId, 1) as { actor_json: string; action_json: string } | undefined;
    assert.ok(injected, '结果应作为事件写入流水');
    assert.deepEqual(JSON.parse(injected.actor_json), { kind: 'system', source: 'recovery' });
    const injectedAction = JSON.parse(injected.action_json) as {
      type: string;
      taskId: string;
      expectedSequence: number;
    };
    assert.equal(injectedAction.type, 'external_task_result');
    assert.equal(injectedAction.taskId, 'task-x1');
    assert.equal(injectedAction.expectedSequence, 1);
    const sessionAfter = db
      .prepare('SELECT last_seq FROM game_sessions WHERE id = ?')
      .get(sessionId) as { last_seq: number };
    assert.equal(sessionAfter.last_seq, 1, '会话序号应恰好推进一次');
    const state = loadSessionState(
      db.prepare('SELECT * FROM game_sessions WHERE id = ?').get(sessionId) as unknown as SessionRow,
      module,
    ).state as StubState;
    assert.equal(state.log.filter((e) => e.type === 'applied').length, 1);

    // 同 task_id 第二次回灌：丢弃
    await queue.applyTaskResult('task-x1', { verdict: 'undercover' });
    assert.equal(stub.applied.length, 1, '第二次回灌应被丢弃');

    // 重放/重复轮询：任务已 done，不再调用模型
    queue.start();
    await new Promise((r) => setTimeout(r, 100));
    queue.stop();
    assert.equal(dispatchCount, 1, '重放不再次调用模型');
    assert.equal(stub.applied.length, 1, '重放不重新回灌');
  } finally {
    closeDb(db);
  }
});

// ---------------------------------------------------------------------------
// TDD 步骤 4：重启续跑 + 已结算会话迟到结果丢弃
// ---------------------------------------------------------------------------

test('A1：重启续跑 pending/running 任务且不重复消耗（stub 计数）', async () => {
  const dbPath = tempDbPath();
  try {
    let db = openDb({ path: dbPath });
    migrate(db);
    const seeded = seedRoom(db);
    const sessionId = 's-a1-restart';
    insertSessionRow(db, { sessionId, roomId: seeded.roomId });
    insertTaskRow(db, { taskId: 'task-r1', sessionId, status: 'pending', submittedAtSeq: 1 });
    insertTaskRow(db, { taskId: 'task-r2', sessionId, status: 'running', submittedAtSeq: 2 });
    closeDb(db);

    // 重启：migrate（幂等）→ 恢复结算（running → pending）
    db = openDb({ path: dbPath });
    migrate(db);
    const settled = settleAdjudicationTasks(db);
    assert.equal(settled.reset, 1, 'running 任务应重置为 pending');
    assert.equal(settled.discarded, 0);
    const after = (
      db.prepare('SELECT task_id, status FROM adjudication_tasks ORDER BY submitted_at_seq').all() as {
        task_id: string;
        status: string;
      }[]
    ).map((r) => ({ ...r }));
    assert.deepEqual(after, [
      { task_id: 'task-r1', status: 'pending' },
      { task_id: 'task-r2', status: 'pending' },
    ]);

    let dispatchCount = 0;
    const stub: StubContext = { applied: [], emitted: [] };
    const module = stubModule(stub);
    const executor = new RoomCommandExecutor(db, new RoomQueues());
    const queue = new AdjudicationTaskQueue({
      db,
      executor,
      dispatchTask: async () => {
        dispatchCount += 1;
        return { verdict: 'civilian' };
      },
      resolveModule: () => module,
    });
    queue.start();
    await waitFor(() => {
      const done = db
        .prepare("SELECT COUNT(*) AS n FROM adjudication_tasks WHERE status = 'done'")
        .get() as { n: number };
      return done.n === 2;
    });
    queue.stop();

    assert.equal(dispatchCount, 2, '两个任务各续跑一次');
    assert.equal(stub.applied.length, 2, '两个结果各回灌一次（不重复消耗）');
    const r1 = getAdjudicationTask(db, 'task-r1')!;
    const r2 = getAdjudicationTask(db, 'task-r2')!;
    assert.equal(r1.status, 'done');
    assert.equal(r2.status, 'done');
    assert.equal(r1.inputPlaintextJson, null, '结果应用后明文输入应擦除');
    assert.equal(r2.inputPlaintextJson, null);
  } finally {
    cleanupDb(dbPath);
  }
});

test('A1：runStartupRecovery 集成——活动会话任务保留续跑、已结算会话任务丢弃', async () => {
  const dbPath = tempDbPath();
  try {
    let db = openDb({ path: dbPath });
    migrate(db);
    const executor = new RoomCommandExecutor(db);
    const seeded = seedRoom(db, { gameId: 'undercover' });
    for (let i = 2; i <= 4; i++) {
      await executor.executeOnRoom({
        roomId: seeded.roomId,
        actorScope: `conn:j${i}`,
        requestId: `join-${i}`,
        handler: (tx) =>
          applyJoinRoom(tx, seeded.roomId, {
            roomCode: seeded.roomCode,
            nickname: `玩家${i}`,
            asSpectator: false,
          }),
      });
    }
    db.prepare(
      `UPDATE room_members SET ready = 1 WHERE room_id = ? AND seat_role = 'player'`,
    ).run(seeded.roomId);
    await executor.executeOnRoom({
      roomId: seeded.roomId,
      actorScope: 'conn:start',
      requestId: 'start',
      handler: (tx) => startGame(tx, seeded.roomId, { speechSeconds: 60, voteSeconds: 45 }),
    });
    const session = db
      .prepare('SELECT * FROM game_sessions WHERE room_id = ?')
      .get(seeded.roomId) as unknown as SessionRow;
    assert.equal(session.status, 'ACTIVE');
    insertTaskRow(db, { taskId: 'task-ia', sessionId: session.id, status: 'pending', submittedAtSeq: 1 });
    insertTaskRow(db, { taskId: 'task-ib', sessionId: session.id, status: 'running', submittedAtSeq: 2 });
    // 已结算会话（FINISHED）的迟到任务
    const room2 = seedRoom(db, { gameId: 'undercover' });
    insertSessionRow(db, { sessionId: 's-finished', roomId: room2.roomId, status: 'FINISHED' });
    insertTaskRow(db, { taskId: 'task-id', sessionId: 's-finished', status: 'pending', submittedAtSeq: 1 });
    closeDb(db);

    db = openDb({ path: dbPath });
    migrate(db);
    const summary = runStartupRecovery(db, silentLogger);
    assert.equal(summary.sessionsRecovered, 1);
    assert.equal(summary.sessionsAborted, 0);
    assert.equal(summary.adjudicationTasksReset, 1, '活动会话 running → pending');
    assert.equal(summary.adjudicationTasksDiscarded, 1, '已结算会话任务丢弃');
    const rows = (
      db.prepare('SELECT task_id, status FROM adjudication_tasks ORDER BY task_id').all() as {
        task_id: string;
        status: string;
      }[]
    ).map((r) => ({ ...r }));
    assert.deepEqual(rows, [
      { task_id: 'task-ia', status: 'pending' },
      { task_id: 'task-ib', status: 'pending' },
      { task_id: 'task-id', status: 'discarded' },
    ]);
    closeDb(db);
  } finally {
    cleanupDb(dbPath);
  }
});

// ---------------------------------------------------------------------------
// D4-B T1：attempts 持久化 + 指数退避 + 8 次后终态 + 无热循环
// ---------------------------------------------------------------------------

test('T1：markAdjudicationTaskErrored 把 attempts 持久化到 primary_attempt_json', () => {
  const db = openDb({ path: ':memory:' });
  try {
    migrate(db);
    const seeded = seedRoom(db);
    const sessionId = 's-t1-attempts';
    insertSessionRow(db, { sessionId, roomId: seeded.roomId });
    insertTaskRow(db, { taskId: 'task-t1-1', sessionId, status: 'pending', submittedAtSeq: 1 });
    assert.equal(markAdjudicationTaskErrored(db, 'task-t1-1'), true, '第一次失败应转换成功');
    const task = getAdjudicationTask(db, 'task-t1-1')!;
    assert.equal(task.status, 'errored');
    assert.ok(task.primaryAttemptJson, 'attempts 应持久化到 primary_attempt_json');
    assert.deepEqual(JSON.parse(task.primaryAttemptJson!), { attempts: 1 });
    // 第二次失败递增
    markAdjudicationTaskErrored(db, 'task-t1-1');
    const again = getAdjudicationTask(db, 'task-t1-1')!;
    assert.equal(again.status, 'errored');
    assert.deepEqual(JSON.parse(again.primaryAttemptJson!), { attempts: 2 });
  } finally {
    closeDb(db);
  }
});

test('T1：退避时间按 attempts 指数增长并封顶', () => {
  assert.equal(adjudicationRetryDelayMs(0), 0);
  assert.equal(adjudicationRetryDelayMs(1), 1000);
  assert.equal(adjudicationRetryDelayMs(2), 2000);
  assert.equal(adjudicationRetryDelayMs(3), 4000);
  assert.equal(adjudicationRetryDelayMs(4), 8000);
  assert.equal(adjudicationRetryDelayMs(5), 16000);
  assert.equal(adjudicationRetryDelayMs(6), 30000);
  assert.equal(adjudicationRetryDelayMs(7), 30000);
  assert.equal(adjudicationRetryDelayMs(8), 30000);
});

test('T1：nextPendingAdjudicationTask 用 json_extract 按退避跳过未到期 errored 任务', () => {
  const db = openDb({ path: ':memory:' });
  try {
    migrate(db);
    const seeded = seedRoom(db);
    const sessionId = 's-t1-backoff';
    insertSessionRow(db, { sessionId, roomId: seeded.roomId });
    insertTaskRow(db, { taskId: 'task-t1-2', sessionId, status: 'pending', submittedAtSeq: 1 });
    markAdjudicationTaskErrored(db, 'task-t1-2');
    const task = getAdjudicationTask(db, 'task-t1-2')!;
    // 半程（500ms）：未到期 → 不可调度
    assert.equal(nextPendingAdjudicationTask(db, task.updatedAt + 500), undefined, '退避未到期不得调度');
    // 到期（>= 1000ms）：可调度
    const due = nextPendingAdjudicationTask(db, task.updatedAt + 1000);
    assert.equal(due?.taskId, 'task-t1-2', '退避到期后应可调度');
    // pending 任务不受退避约束
    insertTaskRow(db, { taskId: 'task-t1-3', sessionId, status: 'pending', submittedAtSeq: 2 });
    const immediate = nextPendingAdjudicationTask(db, 0);
    assert.equal(immediate?.taskId, 'task-t1-3', 'pending 任务应立即可调度');
  } finally {
    closeDb(db);
  }
});

test('T1：8 次失败进入终态（discarded），不再被调度', () => {
  const db = openDb({ path: ':memory:' });
  try {
    migrate(db);
    const seeded = seedRoom(db);
    const sessionId = 's-t1-terminal';
    insertSessionRow(db, { sessionId, roomId: seeded.roomId });
    insertTaskRow(db, { taskId: 'task-t1-4', sessionId, status: 'pending', submittedAtSeq: 1 });
    for (let i = 0; i < 8; i++) markAdjudicationTaskErrored(db, 'task-t1-4');
    const task = getAdjudicationTask(db, 'task-t1-4')!;
    assert.equal(task.status, 'discarded', 'attempts>=8 应进入终态');
    assert.deepEqual(JSON.parse(task.primaryAttemptJson!), { attempts: 8 });
    assert.equal(nextPendingAdjudicationTask(db), undefined, '终态任务不再被调度');
    // 第 9 次失败不再改变状态（已终态，不可重试）
    assert.equal(markAdjudicationTaskErrored(db, 'task-t1-4'), false, '终态任务不应再次转换');
  } finally {
    closeDb(db);
  }
});

test('T1：errored 任务退避窗口内不被热循环重试', async () => {
  const db = openDb({ path: ':memory:' });
  try {
    migrate(db);
    const seeded = seedRoom(db);
    const sessionId = 's-t1-hotloop';
    insertSessionRow(db, { sessionId, roomId: seeded.roomId });
    insertTaskRow(db, { taskId: 'task-t1-hot', sessionId, status: 'pending', submittedAtSeq: 1 });
    let dispatchCount = 0;
    const stub: StubContext = { applied: [], emitted: [] };
    const module = stubModule(stub);
    const executor = new RoomCommandExecutor(db, new RoomQueues());
    const queue = new AdjudicationTaskQueue({
      db,
      executor,
      dispatchTask: async () => {
        dispatchCount += 1;
        throw new Error('provider down');
      },
      resolveModule: () => module,
      onError: () => {},
    });
    queue.start();
    await waitFor(() => dispatchCount === 1);
    await new Promise((r) => setTimeout(r, 200));
    queue.stop();
    assert.equal(dispatchCount, 1, '退避窗口内不得立即热循环重试');
    const task = getAdjudicationTask(db, 'task-t1-hot')!;
    assert.equal(task.status, 'errored');
    assert.deepEqual(JSON.parse(task.primaryAttemptJson!), { attempts: 1 });
  } finally {
    closeDb(db);
  }
});

// ---------------------------------------------------------------------------
// D4-B T4：replayUnappliedAdjudicationResults at-most-once 幂等
// ---------------------------------------------------------------------------

test('T4：replayUnappliedAdjudicationResults 幂等——同 taskId 不重复 reducer 副作用', async () => {
  const db = openDb({ path: ':memory:' });
  try {
    migrate(db);
    const seeded = seedRoom(db);
    const sessionId = 's-t4-replay';
    insertSessionRow(db, { sessionId, roomId: seeded.roomId });
    insertTaskRow(db, { taskId: 'task-t4-1', sessionId, status: 'pending', submittedAtSeq: 1 });
    // 模拟崩溃窗口：结果已落库（done）但 external_task_result 尚未注入事件流水
    db.prepare(
      `UPDATE adjudication_tasks SET status = 'done', result_json = ? WHERE task_id = ?`,
    ).run(JSON.stringify({ verdict: 'civilian' }), 'task-t4-1');
    const stub: StubContext = { applied: [], emitted: [] };
    const module = stubModule(stub);
    const executor = new RoomCommandExecutor(db, new RoomQueues());
    const replayed1 = await replayUnappliedAdjudicationResults(db, executor, () => module);
    assert.equal(replayed1, 1, '未应用结果应补注入一次');
    assert.equal(stub.applied.length, 1);
    assert.equal(stub.applied[0]!.taskId, 'task-t4-1');
    // 再次重放：事件已存在 → 跳过，reducer 副作用不重复
    const replayed2 = await replayUnappliedAdjudicationResults(db, executor, () => module);
    assert.equal(replayed2, 0, '已应用结果不应重复注入');
    assert.equal(stub.applied.length, 1, '同 taskId 不得重复 reducer 副作用');
    const injected = db.prepare(
      `SELECT COUNT(*) AS n FROM game_events WHERE session_id = ? AND action_json LIKE '%external_task_result%'`,
    ).get(sessionId) as { n: number };
    assert.equal(injected.n, 1, '事件流水应恰好一条 external_task_result');
  } finally {
    closeDb(db);
  }
});

test('A1：已结算会话（FINISHED/ABORTED）的迟到任务结果丢弃，不回灌', async () => {
  const db = openDb({ path: ':memory:' });
  try {
    migrate(db);
    for (const [sessionId, status] of [
      ['s-late-fin', 'FINISHED'],
      ['s-late-abort', 'ABORTED'],
    ] as const) {
      const seeded = seedRoom(db);
      insertSessionRow(db, { sessionId, roomId: seeded.roomId, status });
      insertTaskRow(db, { taskId: `task-late-${sessionId}`, sessionId, status: 'running', submittedAtSeq: 1 });
    }
    const stub: StubContext = { applied: [], emitted: [] };
    const module = stubModule(stub);
    const executor = new RoomCommandExecutor(db, new RoomQueues());
    const queue = new AdjudicationTaskQueue({
      db,
      executor,
      dispatchTask: async () => ({}),
      resolveModule: () => module,
    });
    // 结果迟到到达（任务已 running）：会话已结算 → 丢弃，不回灌
    await queue.applyTaskResult('task-late-s-late-fin', { verdict: 'civilian' });
    await queue.applyTaskResult('task-late-s-late-abort', { verdict: 'civilian' });
    assert.equal(getAdjudicationTask(db, 'task-late-s-late-fin')?.status, 'discarded');
    assert.equal(getAdjudicationTask(db, 'task-late-s-late-abort')?.status, 'discarded');
    assert.equal(stub.applied.length, 0, '已结算会话不应回灌结果');
    // 无 external_task_result 事件写入
    const events = db
      .prepare("SELECT COUNT(*) AS n FROM game_events WHERE action_json LIKE '%external_task_result%'")
      .get() as { n: number };
    assert.equal(events.n, 0);
  } finally {
    closeDb(db);
  }
});
