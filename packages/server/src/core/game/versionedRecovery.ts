import {
  assertPrivateGameEvents,
  createSeededRandom,
  isVersionedGameModule,
  type Actor,
  type AdjudicationTaskEffect,
  type GameEffect,
} from '@ldj/shared';
import type { Db } from '../../persistence/db.ts';
import type { RegisteredGameModule } from './registry.ts';
import type { SessionRow } from './session.ts';
import { reconcileAdjudicationTask } from '../adjudication/taskStore.ts';
import {
  parseEventEnvelope,
  type EffectReceipt,
  type EventEnvelopeV2,
} from './eventEnvelope.ts';
import {
  createSnapshotEnvelope,
  parseSnapshotEnvelope,
  type SnapshotEnvelopeV2,
} from './snapshotEnvelope.ts';
import { canonicalJson, createStateDigest } from './stateDigest.ts';

interface EventRow {
  readonly seq: number;
  readonly command_time: number;
  readonly actor_json: string;
  readonly action_json: string;
  readonly events_json: string;
}

interface TimerRow {
  readonly deadline_at: number;
  readonly action_json: string;
  readonly status: string;
}

interface ChatRow {
  readonly room_id: string;
  readonly session_id: string | null;
  readonly from_player_id: string | null;
  readonly kind: string;
  readonly text: string;
  readonly created_at: number;
}

export interface VersionedReplayResult {
  readonly eventsReplayed: number;
  readonly snapshotJson: string;
  readonly rngStateJson: string;
}

function assertEqualJson(actual: unknown, expected: unknown, label: string): void {
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    throw new Error(`${label}与持久化记录不一致`);
  }
}

function participantIds(state: unknown): string[] {
  if (typeof state !== 'object' || state === null) return [];
  const players = (state as { players?: unknown }).players;
  if (Array.isArray(players) && players.every((entry) => typeof entry === 'string')) return [...players];
  if (typeof players === 'object' && players !== null && !Array.isArray(players)) return Object.keys(players);
  return [];
}

function receiptAt(
  receipts: readonly EffectReceipt[],
  effectIndex: number,
): EffectReceipt {
  const matches = receipts.filter((receipt) => receipt.effectIndex === effectIndex);
  if (matches.length !== 1) throw new Error(`effect ${effectIndex} 必须恰有一个 receipt`);
  return matches[0]!;
}

function reconcileTimerEffect(
  db: Db,
  session: SessionRow,
  effect: Extract<GameEffect, { type: 'schedule_timer' | 'cancel_timer' }>,
  receipt: EffectReceipt,
): void {
  if (receipt.kind !== 'timer') throw new Error('计时器 effect receipt 类型错误');
  const expectedSuffix = effect.type === 'schedule_timer' ? ':pending' : ':cancelled';
  if (receipt.receiptId !== `${effect.timerId}${expectedSuffix}`) {
    throw new Error('计时器 effect receipt 标识错误');
  }
  const row = db.prepare(
    `SELECT deadline_at, action_json, status FROM timers WHERE session_id = ? AND timer_id = ?`,
  ).get(session.id, effect.timerId) as TimerRow | undefined;

  if (effect.type === 'schedule_timer') {
    if (!row) {
      db.prepare(
        `INSERT INTO timers (session_id, timer_id, deadline_at, action_json, status)
         VALUES (?, ?, ?, ?, 'pending')`,
      ).run(session.id, effect.timerId, effect.deadlineAt, JSON.stringify(effect.action));
      return;
    }
    if (row.deadline_at !== effect.deadlineAt) throw new Error('计时器 deadline 与 effect 不一致');
    assertEqualJson(JSON.parse(row.action_json), effect.action, '计时器 action');
    if (!['pending', 'consumed', 'cancelled'].includes(row.status)) throw new Error('计时器状态无效');
    return;
  }

  if (!row) throw new Error('取消计时器 effect 缺少被取消的计时器记录');
  if (row.status !== 'cancelled' && row.status !== 'consumed') {
    throw new Error('取消计时器 effect 未完成');
  }
}

function reconcileChatEffect(
  db: Db,
  session: SessionRow,
  effect: Extract<GameEffect, { type: 'system_message' }>,
  receipt: EffectReceipt,
  commandTime: number,
): void {
  if (receipt.kind !== 'chat' || !/^[1-9]\d*$/.test(receipt.receiptId)) {
    throw new Error('系统消息 effect receipt 无效');
  }
  const id = Number(receipt.receiptId);
  if (!Number.isSafeInteger(id)) throw new Error('系统消息 receipt 超出安全整数');
  const row = db.prepare(
    `SELECT room_id, session_id, from_player_id, kind, text, created_at
     FROM chat_messages WHERE id = ?`,
  ).get(id) as ChatRow | undefined;
  if (!row) {
    db.prepare(
      `INSERT INTO chat_messages
         (id, room_id, session_id, from_player_id, kind, text, created_at)
       VALUES (?, ?, ?, NULL, 'system', ?, ?)`,
    ).run(id, session.room_id, session.id, effect.text, commandTime);
    return;
  }
  if (row.room_id !== session.room_id || row.session_id !== session.id
    || row.from_player_id !== null || row.kind !== 'system'
    || row.text !== effect.text || row.created_at !== commandTime) {
    throw new Error('系统消息 receipt 与持久化记录不一致');
  }
}

/**
 * D4-B T3：enqueue_adjudication effect 的对账（receipt kind:'none' 单独处理）。
 * 重放只对账 DB 行（恢复缺失 pending 行 / 校验已有行 immutable），
 * 绝不发起 provider 调用、不消费结果。
 */
function reconcileAdjudicationEffect(
  db: Db,
  effect: AdjudicationTaskEffect,
  receipt: EffectReceipt,
): void {
  if (receipt.kind !== 'none') throw new Error('外部裁判任务 effect receipt 类型错误');
  reconcileAdjudicationTask(db, effect);
}

function reconcileEffects(
  db: Db,
  session: SessionRow,
  effects: readonly GameEffect[],
  receipts: readonly EffectReceipt[],
  commandTime: number,
): void {
  if (receipts.length !== effects.length) throw new Error('effect receipt 数量不一致');
  for (const [index, effect] of effects.entries()) {
    const receipt = receiptAt(receipts, index);
    const type = (effect as { type?: unknown }).type;
    if (type === 'system_message') {
      reconcileChatEffect(db, session, effect as Extract<GameEffect, { type: 'system_message' }>, receipt, commandTime);
    } else if (type === 'enqueue_adjudication') {
      reconcileAdjudicationEffect(db, effect as unknown as AdjudicationTaskEffect, receipt);
    } else {
      reconcileTimerEffect(db, session, effect as Extract<GameEffect, { type: 'schedule_timer' | 'cancel_timer' }>, receipt);
    }
  }
}

function parseStoredCursor(json: string): number {
  const parsed = JSON.parse(json) as { cursor?: unknown };
  if (!Number.isSafeInteger(parsed.cursor) || (parsed.cursor as number) < 0) {
    throw new Error('会话随机游标无效');
  }
  return parsed.cursor as number;
}

function assertEnvelopeOutput(
  envelope: EventEnvelopeV2,
  result: Extract<ReturnType<Extract<RegisteredGameModule, { readonly identity: unknown }>['reduce']>, { ok: true }>,
  nextState: unknown,
  cursorAfter: number,
): void {
  assertEqualJson(result.publicEvents, envelope.publicEvents, '公开事件');
  assertEqualJson(result.privateEvents, envelope.privateEvents, '私有事件');
  assertEqualJson(result.effects, envelope.effects, 'effects');
  assertEqualJson(result.resultCandidate, envelope.resultCandidate, '结果候选');
  if (cursorAfter !== envelope.rngCursorAfter) throw new Error('动作后随机游标不一致');
  if (createStateDigest(nextState) !== envelope.nextStateDigest) throw new Error('重放状态摘要不一致');
}

/**
 * 从快照 createdAtSequence 后的 V2 event journal 确定性重放。
 * 重放只重建状态/RNG，并对账或恢复已持久化 effect；不会广播或再次调用外部系统。
 */
export function replayVersionedTrailingEvents(
  db: Db,
  session: SessionRow,
  module: RegisteredGameModule,
): VersionedReplayResult {
  if (!isVersionedGameModule(module)) throw new Error('legacy 模块不能走 V2 事件重放');
  const snapshot = parseSnapshotEnvelope(JSON.parse(session.snapshot_json), {
    gameId: module.manifest.id,
    rulesetId: module.identity.rulesetId,
    schemaVersion: module.manifest.stateSchemaVersion,
  });
  if (snapshot.createdAtSequence > session.last_seq) throw new Error('快照序号超过会话末序号');

  let state = module.parseState(snapshot.state);
  module.assertInvariants(state);
  let cursor = snapshot.rngState.cursor;
  const rows = db.prepare(
    `SELECT seq, command_time, actor_json, action_json, events_json
     FROM game_events
     WHERE session_id = ? AND seq > ? AND seq <= ?
     ORDER BY seq ASC`,
  ).all(session.id, snapshot.createdAtSequence, session.last_seq) as unknown as EventRow[];
  const expectedCount = session.last_seq - snapshot.createdAtSequence;
  if (rows.length !== expectedCount) throw new Error('快照后的事件流水不连续');

  let expectedSeq = snapshot.createdAtSequence + 1;
  for (const row of rows) {
    if (row.seq !== expectedSeq) throw new Error('快照后的事件序号不连续');
    const envelope = parseEventEnvelope(JSON.parse(row.events_json), module.identity.rulesetId);
    if (envelope.rngCursorBefore !== cursor) throw new Error('动作前随机游标不连续');
    const random = createSeededRandom(session.seed, cursor);
    const actor = JSON.parse(row.actor_json) as Actor;
    const action = module.parseAction(JSON.parse(row.action_json));
    const result = module.reduce({ now: row.command_time, random }, state, actor, action);
    if (!result.ok) throw new Error(`事件 ${row.seq} 重放被规则模块拒绝`);
    const nextState = module.parseState(result.nextState);
    module.assertInvariants(nextState);
    assertPrivateGameEvents(result.privateEvents, participantIds(nextState));
    assertEnvelopeOutput(envelope, result, nextState, random.getCursor());
    reconcileEffects(db, session, result.effects, envelope.effectReceipts, row.command_time);
    state = nextState;
    cursor = random.getCursor();
    expectedSeq += 1;
  }

  const storedCursor = parseStoredCursor(session.rng_state_json);
  if (rows.length === 0 && storedCursor !== cursor) throw new Error('快照与会话随机游标不一致');
  // 有 trailing journal 时，rng_state_json 可能与旧快照同步、也可能已先推进到末尾；
  // 任何介于两者之外的值都表示持久化边界损坏。
  if (rows.length > 0 && storedCursor !== snapshot.rngState.cursor && storedCursor !== cursor) {
    throw new Error('重放结果与会话随机游标不一致');
  }

  const rebuilt: SnapshotEnvelopeV2 = createSnapshotEnvelope({
    gameId: module.manifest.id,
    rulesetId: module.identity.rulesetId,
    schemaVersion: module.manifest.stateSchemaVersion,
    createdAtSequence: session.last_seq,
    rngState: { cursor },
    state,
  });
  return {
    eventsReplayed: rows.length,
    snapshotJson: JSON.stringify(rebuilt),
    rngStateJson: JSON.stringify({ cursor }),
  };
}
