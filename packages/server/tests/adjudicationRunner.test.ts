/**
 * D4-A2：白板猜词外部裁判 runner 测试（blank-adjudication-v1）。
 * 裁决链：本地精确匹配 → 主模型 → 备用模型 → 失败关闭为猜错。
 * 全程使用可编程替身：不调用真实模型、不发起网络。
 * 覆盖：本地零调用、主模型终局、四类非终局触发备用、备用翻转/失败关闭、
 * 主备载荷隔离、payload 键白名单与日志红线、受控超时/非法响应/双失败/AbortError、
 * 非法输入零 provider 调用与可重试性，以及与 A1 taskQueue 的集成消费。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import {
  ADJUDICATION_POLICY_VERSION,
  type AnyGameModuleV2,
  type GameContext,
  type GameEffect,
} from '@ldj/shared';
import { openDb, closeDb, type Db } from '../src/persistence/db.ts';
import { migrate } from '../src/persistence/migrator.ts';
import { RoomCommandExecutor } from '../src/core/executor.ts';
import { RoomQueues } from '../src/core/queue.ts';
import { seedRoom } from './helpers/seedRoom.ts';
import { createSnapshotEnvelope } from '../src/core/game/snapshotEnvelope.ts';
import { AdjudicationTaskQueue } from '../src/core/adjudication/taskQueue.ts';
import { createLogger } from '../src/boot/logger.ts';
import { LlmProvider } from '../src/core/game/llmProvider.ts';
import { createAdjudicationInvoker } from '../src/app.ts';
import {
  getAdjudicationTask,
  type AdjudicationTaskStatus,
} from '../src/core/adjudication/taskStore.ts';
import {
  AdjudicationRunner,
  type AdjudicationDispatchResult,
  type AdjudicationProviderInvoker,
} from '../src/core/adjudication/runner.ts';
import {
  buildAdjudicationSystemPrompt,
  buildAdjudicationUserPrompt,
} from '../src/core/llmProtocol.ts';
import type { AdjudicationProviderPayload } from '@ldj/shared';

/** 构造合法输入（三字段齐备、policyVersion 匹配） */
function validInput(
  normalizedStandardAnswer: string,
  normalizedGuess: string,
): AdjudicationProviderPayload {
  return {
    normalizedStandardAnswer,
    normalizedGuess,
    adjudicationPolicyVersion: ADJUDICATION_POLICY_VERSION,
  };
}

// ---------------------------------------------------------------------------
// 与 A1 adjudicationTask.test.ts 一致的 stub 模块与内存 DB 组装（仅复制必要部分）
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
// runner 行为测试（1–9）
// ---------------------------------------------------------------------------

test('A2：本地精确匹配零次 provider 调用，source local，attempts 空', async () => {
  let primaryCalls = 0;
  let fallbackCalls = 0;
  const runner = new AdjudicationRunner({
    primary: async () => {
      primaryCalls += 1;
      return { classification: 'equivalent' };
    },
    fallback: async () => {
      fallbackCalls += 1;
      return { classification: 'equivalent' };
    },
  });
  const result = await runner.dispatch(validInput('苹果', '苹果'));
  assert.equal(result.classification, 'equivalent');
  assert.equal(result.verdict, 'equivalent');
  assert.equal(result.source, 'local');
  assert.equal(result.policyVersion, ADJUDICATION_POLICY_VERSION);
  assert.deepEqual([...result.attempts], []);
  assert.equal(primaryCalls, 0);
  assert.equal(fallbackCalls, 0);

  // 归一化后相等也走本地（大小写不敏感 / 空白折叠）
  const folded = await runner.dispatch(validInput('APPLE', ' apple '));
  assert.equal(folded.source, 'local');
  assert.equal(folded.verdict, 'equivalent');
  assert.equal(primaryCalls, 0, '归一化命中不得调用 provider');
});

test('A2：主模型 equivalent 为终局，不再调备用，source primary', async () => {
  let primaryCalls = 0;
  let fallbackCalls = 0;
  const runner = new AdjudicationRunner({
    primary: async () => {
      primaryCalls += 1;
      return { classification: 'equivalent' };
    },
    fallback: async () => {
      fallbackCalls += 1;
      return { classification: 'equivalent' };
    },
  });
  const result = await runner.dispatch(validInput('西瓜', 'melon'));
  assert.equal(result.source, 'primary');
  assert.equal(result.verdict, 'equivalent');
  assert.equal(result.classification, 'equivalent');
  assert.equal(primaryCalls, 1);
  assert.equal(fallbackCalls, 0);
  assert.equal(result.attempts.length, 1);
  assert.equal(result.attempts[0]!.stage, 'primary');
  assert.equal(result.attempts[0]!.classification, 'equivalent');
});

test('A2：主模型 not_equivalent 为终局，不再调备用，source primary', async () => {
  let primaryCalls = 0;
  let fallbackCalls = 0;
  const runner = new AdjudicationRunner({
    primary: async () => {
      primaryCalls += 1;
      return { classification: 'not_equivalent' };
    },
    fallback: async () => {
      fallbackCalls += 1;
      return { classification: 'not_equivalent' };
    },
  });
  const result = await runner.dispatch(validInput('卧底', '平民'));
  assert.equal(result.source, 'primary');
  assert.equal(result.verdict, 'not_equivalent');
  assert.equal(result.classification, 'not_equivalent');
  assert.equal(primaryCalls, 1);
  assert.equal(fallbackCalls, 0, '主模型终局不得调备用');
});

test('A2：主模型非终局四类各触发恰好一次独立备用调用', async () => {
  for (const classification of [
    'uncertain',
    'provider_error',
    'timeout',
    'invalid_response',
  ] as const) {
    let primaryCalls = 0;
    let fallbackCalls = 0;
    const runner = new AdjudicationRunner({
      primary: async () => {
        primaryCalls += 1;
        return { classification };
      },
      fallback: async () => {
        fallbackCalls += 1;
        return { classification: 'not_equivalent' };
      },
    });
    const result = await runner.dispatch(validInput('卧底', '平民'));
    assert.equal(primaryCalls, 1, `${classification} 应恰好调用一次主模型`);
    assert.equal(fallbackCalls, 1, `${classification} 应恰好触发一次备用`);
    assert.equal(result.attempts.length, 2);
    assert.deepEqual(
      result.attempts.map((a) => a.stage),
      ['primary', 'fallback'],
    );
    assert.equal(result.attempts[0]!.classification, classification);
    assert.equal(result.attempts[1]!.classification, 'not_equivalent');
    assert.equal(result.source, 'fallback');
    assert.equal(result.verdict, 'not_equivalent');
  }
});

test('A2：备用模型可翻转判定、判错与失败关闭', async () => {
  // 备用 equivalent → 翻转为正确
  const flipped = await new AdjudicationRunner({
    primary: async () => ({ classification: 'uncertain' }),
    fallback: async () => ({ classification: 'equivalent' }),
  }).dispatch(validInput('猫', '猫咪'));
  assert.equal(flipped.verdict, 'equivalent');
  assert.equal(flipped.source, 'fallback');
  assert.equal(flipped.classification, 'equivalent');

  // 备用 not_equivalent → fallback 判错
  const denied = await new AdjudicationRunner({
    primary: async () => ({ classification: 'timeout' }),
    fallback: async () => ({ classification: 'not_equivalent' }),
  }).dispatch(validInput('狗', '犬'));
  assert.equal(denied.verdict, 'not_equivalent');
  assert.equal(denied.source, 'fallback');

  // 备用仍非终局 → fail_closed 猜错，最终分类取 fallback 分类
  const closed = await new AdjudicationRunner({
    primary: async () => ({ classification: 'provider_error' }),
    fallback: async () => ({ classification: 'uncertain' }),
  }).dispatch(validInput('鸟', '雀'));
  assert.equal(closed.verdict, 'not_equivalent');
  assert.equal(closed.source, 'fail_closed');
  assert.equal(closed.classification, 'uncertain', '最终分类应取备用分类');
});

test('A2：主备 payload 独立重建，备用载荷不含主模型结论痕迹', async () => {
  let primaryPayload: unknown;
  let fallbackPayload: unknown;
  const runner = new AdjudicationRunner({
    primary: async (p) => {
      primaryPayload = p;
      return { classification: 'uncertain' };
    },
    fallback: async (p) => {
      fallbackPayload = p;
      return { classification: 'not_equivalent' };
    },
  });
  const input = validInput('  APPLE\u3000PIE  ', ' APPLE   TART ');
  const expectedPayload = validInput('apple pie', 'apple tart');
  await runner.dispatch(input);
  assert.ok(primaryPayload !== undefined && fallbackPayload !== undefined, '主备均应被调用');
  assert.notStrictEqual(primaryPayload, fallbackPayload, '主备载荷必须是独立对象');
  assert.deepEqual(primaryPayload, expectedPayload, '主载荷应只含归一化后的最小输入');
  assert.deepEqual(fallbackPayload, expectedPayload, '备用载荷应独立重建归一化后的最小输入');
  assert.deepEqual(
    Object.keys(fallbackPayload as object).sort(),
    ['adjudicationPolicyVersion', 'normalizedGuess', 'normalizedStandardAnswer'],
    '备用载荷仅含白名单三字段',
  );
  assert.ok(
    !JSON.stringify(fallbackPayload).includes('uncertain'),
    '备用载荷不得含主模型 classification 痕迹',
  );
});

test('A2：payload 键白名单与日志有界摘要红线', async () => {
  const logs: { level: string; msg: string; fields?: Record<string, unknown> }[] = [];
  const logger = {
    info: (msg: string, fields?: Record<string, unknown>) => logs.push({ level: 'info', msg, fields }),
    warn: (msg: string, fields?: Record<string, unknown>) => logs.push({ level: 'warn', msg, fields }),
    error: (msg: string, fields?: Record<string, unknown>) => logs.push({ level: 'error', msg, fields }),
  };
  const secret = 'SUPER_SECRET_API_KEY_9988';
  const roomHint = 'room:r-001';
  const rawMarker = 'RAW_UNIQUE_MARKER_7788';
  const captured: unknown[] = [];
  const runner = new AdjudicationRunner({
    primary: async (p) => {
      captured.push(p);
      return { classification: 'uncertain' };
    },
    fallback: async (p) => {
      captured.push(p);
      return { classification: 'equivalent' };
    },
    logger,
  });
  const result = await runner.dispatch({
    normalizedStandardAnswer: secret,
    normalizedGuess: roomHint,
    adjudicationPolicyVersion: ADJUDICATION_POLICY_VERSION,
  });

  // payload 键白名单：恰好三项
  for (const p of captured) {
    assert.deepEqual(
      Object.keys(p as object).sort(),
      ['adjudicationPolicyVersion', 'normalizedGuess', 'normalizedStandardAnswer'],
      'payload 必须严格只含三个业务字段',
    );
  }
  // 日志红线：不得泄露明文、密钥、房间信息与原始响应
  const serializedLogs = logs.map((l) => JSON.stringify({ msg: l.msg, fields: l.fields ?? null }));
  for (const sensitive of [secret, roomHint, rawMarker]) {
    for (const line of serializedLogs) {
      assert.ok(!line.includes(sensitive), `日志不得包含敏感内容：${sensitive}`);
    }
  }
  // 日志记录有界摘要：最终来源与分类
  assert.ok(logs.some((l) => l.fields?.source === 'fallback'), '日志应记录最终来源');
  assert.ok(logs.some((l) => l.fields?.classification === 'equivalent'), '日志应记录最终分类');
  // runner 返回结构有界：六类分类、verdict、source、policyVersion、attempts
  assert.deepEqual(
    Object.keys(result).sort(),
    ['attempts', 'classification', 'policyVersion', 'source', 'verdict'],
  );
  for (const attempt of result.attempts) {
    assert.deepEqual(Object.keys(attempt).sort(), ['classification', 'elapsedMs', 'stage']);
  }
});

test('A2：受控超时映射 timeout，备用等效可翻转为正确', async () => {
  const never: AdjudicationProviderInvoker = () => new Promise(() => {});
  const runner = new AdjudicationRunner({
    primary: never,
    fallback: async () => ({ classification: 'equivalent' }),
    timeoutMs: 5,
  });
  const result = await runner.dispatch(validInput('苹果', '苹果派'));
  assert.equal(result.attempts.length, 2);
  assert.equal(result.attempts[0]!.stage, 'primary');
  assert.equal(result.attempts[0]!.classification, 'timeout', '受控超时应映射 timeout');
  assert.equal(result.attempts[1]!.classification, 'equivalent');
  assert.equal(result.verdict, 'equivalent');
  assert.equal(result.source, 'fallback');
});

test('A2：AbortError 抛出映射 timeout 并触发备用', async () => {
  const runner = new AdjudicationRunner({
    primary: async () => {
      const err = new Error('外部中断');
      err.name = 'AbortError';
      throw err;
    },
    fallback: async () => ({ classification: 'equivalent' }),
  });
  const result = await runner.dispatch(validInput('猫', '猫咪'));
  assert.equal(result.attempts[0]!.classification, 'timeout');
  assert.equal(result.verdict, 'equivalent');
  assert.equal(result.source, 'fallback');
});

test('A2：非法响应映射 invalid_response 并触发备用', async () => {
  for (const garbage of ['not json', { unexpected: 1 }]) {
    const runner = new AdjudicationRunner({
      primary: async () => garbage,
      fallback: async () => ({ classification: 'equivalent' }),
    });
    const result = await runner.dispatch(validInput('狗', '犬'));
    assert.equal(result.attempts[0]!.classification, 'invalid_response', `垃圾输入 ${JSON.stringify(garbage)}`);
    assert.equal(result.attempts[1]!.classification, 'equivalent');
    assert.equal(result.source, 'fallback');
    assert.equal(result.verdict, 'equivalent');
  }
});

test('A2：严格 JSON 文本响应可解析，裸字符串与额外字段仍为 invalid_response', async () => {
  const accepted = await new AdjudicationRunner({
    primary: async () => '{"classification":"equivalent"}',
    fallback: async () => ({ classification: 'not_equivalent' }),
  }).dispatch(validInput('猫', '猫咪'));
  assert.equal(accepted.classification, 'equivalent');
  assert.equal(accepted.source, 'primary');
  assert.equal(accepted.attempts.length, 1);

  for (const invalid of [
    '"equivalent"',
    '{"classification":"equivalent","reason":"same"}',
    '```json\n{"classification":"equivalent"}\n```',
    '',
  ]) {
    const result = await new AdjudicationRunner({
      primary: async () => invalid,
      fallback: async () => ({ classification: 'not_equivalent' }),
    }).dispatch(validInput('狗', '犬'));
    assert.equal(result.attempts[0]!.classification, 'invalid_response');
    assert.equal(result.source, 'fallback');
  }
});

test('A2：主备双失败 fail_closed 猜错，结果结构完整', async () => {
  const runner = new AdjudicationRunner({
    primary: async () => {
      throw new Error('主模型崩溃');
    },
    fallback: async () => {
      throw new Error('备用模型崩溃');
    },
  });
  const result = await runner.dispatch(validInput('鸟', '雀'));
  assert.equal(result.attempts.length, 2);
  assert.deepEqual(
    result.attempts.map((a) => a.classification),
    ['provider_error', 'provider_error'],
  );
  assert.equal(result.classification, 'provider_error');
  assert.equal(result.verdict, 'not_equivalent');
  assert.equal(result.source, 'fail_closed');
  assert.equal(result.policyVersion, ADJUDICATION_POLICY_VERSION);
  assert.ok(
    result.attempts.every((a) => typeof a.elapsedMs === 'number' && a.elapsedMs >= 0),
    'attempts 应含非负 elapsedMs',
  );
  assert.deepEqual(
    Object.keys(result).sort(),
    ['attempts', 'classification', 'policyVersion', 'source', 'verdict'],
  );
});

test('A2：非法输入抛错且零 provider 调用；修正后成功；重复调用结果一致', async () => {
  let primaryCalls = 0;
  let fallbackCalls = 0;
  const runner = new AdjudicationRunner({
    primary: async () => {
      primaryCalls += 1;
      return { classification: 'not_equivalent' };
    },
    fallback: async () => {
      fallbackCalls += 1;
      return { classification: 'not_equivalent' };
    },
    now: () => 0, // 可控时钟：elapsedMs 恒定，保证重复调用结果深度相等
  });
  const input = validInput('卧底', '平民');

  // 多余键 → 抛错
  await assert.rejects(runner.dispatch({ ...input, extra: 1 }), /未知字段/);
  // policyVersion 不匹配 → 抛错
  await assert.rejects(
    runner.dispatch({ ...input, adjudicationPolicyVersion: 'bogus-v1' }),
    /政策版本不匹配/,
  );
  // 空串 → 抛错
  await assert.rejects(runner.dispatch({ ...input, normalizedGuess: '' }), /长度非法/);
  // Unicode 空白折叠后为空 → 抛错，不得被本地误判为等价
  await assert.rejects(
    runner.dispatch({ ...input, normalizedStandardAnswer: '\u3000', normalizedGuess: '   ' }),
    /长度非法/,
  );
  // 长度越界（65 个 emoji）→ 抛错
  await assert.rejects(runner.dispatch({ ...input, normalizedGuess: '😀'.repeat(65) }), /长度非法/);
  // 类型错 → 抛错
  await assert.rejects(runner.dispatch({ ...input, normalizedStandardAnswer: 123 }), /必须是字符串/);
  assert.equal(primaryCalls, 0, '非法输入不得调用任何 provider');
  assert.equal(fallbackCalls, 0);

  // 修正输入后成功
  const ok = await runner.dispatch(input);
  assert.equal(ok.source, 'primary');
  assert.equal(ok.verdict, 'not_equivalent');

  // 同一合法输入连续两次 dispatch 结果深度相等（无副作用、可重试）
  const first = await runner.dispatch(input);
  const second = await runner.dispatch(input);
  assert.deepEqual(second, first);
});

test('A2：裁判提示词不含敏感上下文与密钥字样，用户提示最小化', () => {
  const system = buildAdjudicationSystemPrompt();
  for (const forbidden of [
    'room',
    'player',
    'nickname',
    'role',
    'chat',
    'ballot',
    'api key',
    'apikey',
    'authorization',
    'x-api-key',
    'token',
    '密钥',
    '请求头',
    '房间',
    '昵称',
    '角色',
    '聊天',
    '选票',
  ]) {
    assert.ok(
      !system.toLowerCase().includes(forbidden),
      `系统提示词不得包含 ${forbidden}`,
    );
  }
  for (const c of [
    'equivalent',
    'not_equivalent',
    'uncertain',
    'provider_error',
    'timeout',
    'invalid_response',
  ]) {
    assert.ok(system.includes(c), `系统提示词应解释 ${c}`);
  }
  assert.ok(system.includes('classification'), '系统提示词应要求输出 classification');

  const user = buildAdjudicationUserPrompt(validInput('苹果', '苹果派'));
  assert.ok(user.includes('苹果'));
  assert.ok(user.includes('苹果派'));
  assert.ok(user.includes(ADJUDICATION_POLICY_VERSION));
  assert.ok(!user.includes('room') && !user.includes('player'), '用户提示只含最小输入');
});

// ---------------------------------------------------------------------------
// TDD 步骤 10：与 A1 taskQueue 集成（照抄 adjudicationTask.test.ts 组装模式）
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// D4-B T2：超时真取消——invoker 契约注入 AbortSignal
// ---------------------------------------------------------------------------

test('T2：invoker 收到 AbortSignal，超时 abort 且不泄漏超时计时器', async () => {
  let receivedSignal: AbortSignal | undefined;
  let observedAbort = false;
  const runner = new AdjudicationRunner({
    primary: (_payload, signal) =>
      new Promise((_resolve, reject) => {
        receivedSignal = signal;
        signal.addEventListener('abort', () => {
          observedAbort = true;
          reject(new DOMException('aborted', 'AbortError'));
        });
      }),
    fallback: async () => ({ classification: 'equivalent' }),
    timeoutMs: 10,
  });
  const timeoutResourcesBefore = process.getActiveResourcesInfo().filter((r) => r === 'Timeout').length;
  const result = await runner.dispatch(validInput('苹果', '苹果派'));
  await new Promise((r) => setImmediate(r));
  const timeoutResourcesAfter = process.getActiveResourcesInfo().filter((r) => r === 'Timeout').length;
  assert.ok(receivedSignal instanceof AbortSignal, 'invoker 应收到 AbortSignal');
  assert.equal(receivedSignal!.aborted, true, '超时后 signal 应已 abort');
  assert.equal(observedAbort, true, 'invoker 应观察到 abort 事件');
  assert.equal(result.attempts[0]!.classification, 'timeout', 'AbortError 应映射 timeout');
  assert.equal(result.attempts[1]!.classification, 'equivalent');
  assert.equal(result.source, 'fallback');
  assert.ok(timeoutResourcesAfter <= timeoutResourcesBefore, 'dispatch 后不得泄漏超时计时器');
});

test('A2：与 A1 taskQueue 集成——runner 产出直接消费且不重复应用', async () => {
  const db = openDb({ path: ':memory:' });
  try {
    migrate(db);
    const seeded = seedRoom(db);
    const sessionId = 's-a2-integrate';
    insertSessionRow(db, { sessionId, roomId: seeded.roomId });
    insertTaskRow(db, {
      taskId: 'task-a2',
      sessionId,
      submittedAtSeq: 1,
      inputPlaintextJson: JSON.stringify(validInput('西瓜', 'melon')),
    });
    const stub: StubContext = { applied: [], emitted: [] };
    const module = stubModule(stub);
    let dispatchCount = 0;
    const runner = new AdjudicationRunner({
      primary: async () => {
        dispatchCount += 1;
        return { classification: 'not_equivalent' };
      },
      fallback: async () => ({ classification: 'not_equivalent' }),
    });
    const executor = new RoomCommandExecutor(db, new RoomQueues());
    const queue = new AdjudicationTaskQueue({
      db,
      executor,
      dispatchTask: async (task) => runner.dispatch(JSON.parse(task.inputPlaintextJson ?? '{}')),
      resolveModule: () => module,
      onError: () => {},
    });
    queue.start();
    await waitFor(() => getAdjudicationTask(db, 'task-a2')?.status === 'done');
    queue.stop();

    // 一轮 claim → dispatch → applyTaskResult：任务转 done、结果已应用
    assert.equal(dispatchCount, 1, '任务应恰好调度一次');
    assert.equal(stub.applied.length, 1, '结果应恰好回灌一次');
    assert.equal(stub.applied[0]!.taskId, 'task-a2');
    assert.equal(stub.applied[0]!.expectedSequence, 1);

    const task = getAdjudicationTask(db, 'task-a2')!;
    assert.equal(task.status, 'done');
    assert.equal(task.inputPlaintextJson, null, '结果应用后明文输入应擦除');
    assert.ok(task.resultJson, '结果应持久化');
    const persisted = JSON.parse(task.resultJson!) as AdjudicationDispatchResult;
    assert.equal(persisted.source, 'primary');
    assert.equal(persisted.verdict, 'not_equivalent');
    assert.equal(persisted.policyVersion, ADJUDICATION_POLICY_VERSION);
    assert.ok(Array.isArray(persisted.attempts) && persisted.attempts.length === 1);

    // 同一 taskId 重复应用被丢弃（不产生重复 reducer 副作用）
    await queue.applyTaskResult('task-a2', persisted);
    assert.equal(stub.applied.length, 1, '同 taskId 重复应用应被丢弃');
  } finally {
    closeDb(db);
  }
});

// ---------------------------------------------------------------------------
// D4-B P3：生产接线链路（真实 invoker；LLM 用本地 mock 上游，禁止真实供应商调用）
// ---------------------------------------------------------------------------

async function listen(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => void,
): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = http.createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () => {
      server.closeAllConnections();
      server.close();
      await once(server, 'close');
    },
  };
}

test('P3：dispatchTask 链路——本地 mock 上游 + 真实 invoker + runner + queue 端到端', async () => {
  let capturedBody: string | null = null;
  const upstream = await listen((req, res) => {
    void (async () => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      capturedBody = Buffer.concat(chunks).toString('utf8');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: '{"classification":"equivalent"}' } }] }));
    })();
  });
  try {
    const db = openDb({ path: ':memory:' });
    try {
      migrate(db);
      const seeded = seedRoom(db);
      const sessionId = 's-p3-chain';
      insertSessionRow(db, { sessionId, roomId: seeded.roomId });
      insertTaskRow(db, {
        taskId: 'task-p3',
        sessionId,
        submittedAtSeq: 1,
        inputPlaintextJson: JSON.stringify(validInput('苹果', 'melon')),
      });
      const stub: StubContext = { applied: [], emitted: [] };
      const module = stubModule(stub);
      const llm = new LlmProvider(
        {
          provider: 'openai',
          baseUrl: upstream.baseUrl,
          apiKey: null,
          model: 'mock-model',
          thinkingDepth: 'off',
          timeoutMs: 5000,
        },
        createLogger('error', {}, () => {}),
        { allowPrivateNetwork: false },
      );
      const invoker = createAdjudicationInvoker(llm, false);
      const runner = new AdjudicationRunner({ primary: invoker, fallback: invoker });
      const executor = new RoomCommandExecutor(db, new RoomQueues());
      const queue = new AdjudicationTaskQueue({
        db,
        executor,
        dispatchTask: async (task) => runner.dispatch(JSON.parse(task.inputPlaintextJson ?? '{}')),
        resolveModule: () => module,
        onError: () => {},
      });
      queue.start();
      await waitFor(() => getAdjudicationTask(db, 'task-p3')?.status === 'done');
      queue.stop();

      const task = getAdjudicationTask(db, 'task-p3')!;
      const result = JSON.parse(task.resultJson!) as AdjudicationDispatchResult;
      assert.equal(result.classification, 'equivalent');
      assert.equal(result.verdict, 'equivalent');
      assert.equal(result.source, 'primary');
      assert.equal(stub.applied.length, 1, '结果应恰好回灌一次');
      assert.equal(stub.applied[0]!.taskId, 'task-p3');
      // capturedBody 在请求处理闭包内赋值：先拷贝到局部再断言，保证 TS 收窄正确
      const capturedText: string = capturedBody ?? '';
      assert.ok(capturedText, 'invoker 应发起上游请求');
      const body = JSON.parse(capturedText) as {
        messages?: { role: string; content: string }[];
      };
      const system = body.messages?.find((m) => m.role === 'system')?.content ?? '';
      const user = body.messages?.find((m) => m.role === 'user')?.content ?? '';
      assert.ok(system.includes('classification'), '系统提示词应含裁判指令');
      assert.ok(user.includes('标准答案') && user.includes('苹果'), '用户提示应含最小输入');
      assert.ok(
        !capturedText.toLowerCase().includes('room')
          && !capturedText.toLowerCase().includes('player')
          && !capturedText.includes('authorization'),
        '裁判载荷不含敏感上下文与密钥',
      );
    } finally {
      closeDb(db);
    }
  } finally {
    await upstream.close();
  }
});
