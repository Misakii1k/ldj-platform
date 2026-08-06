/**
 * D4-T：标准桌面视角严格解析器（纯函数，无 I/O）。
 * 与 D3 的严格 envelope/视角解析一脉相承：未经运行时验证的服务器对象
 * 不得进入统一桌面渲染；未知键、未知能力、越界 log、非法枚举一律失败关闭。
 */
import {
  MAX_PUBLIC_LOG_ENTRIES,
  TABLETOP_VIEW_VERSION,
  type StandardTabletopViewV1,
  type TabletopActivity,
  type TabletopClockKind,
  type TabletopLogCategory,
  type TabletopOperationState,
  type TabletopParticipation,
  type TabletopResultState,
  type TabletopTurnMode,
} from './contract.ts';
import { isKnownTabletopCapability } from './capabilities.ts';

const TURN_MODES: ReadonlySet<string> = new Set(['none', 'single', 'simultaneous', 'system']);
const PARTICIPATIONS: ReadonlySet<string> = new Set(['active', 'eliminated', 'forfeited']);
const ACTIVITIES: ReadonlySet<string> = new Set(['acting', 'available', 'submitted', 'waiting', 'none']);
const CLOCK_KINDS: ReadonlySet<string> = new Set(['phase', 'turn', 'response', 'result']);
const OPERATION_STATES: ReadonlySet<string> = new Set(['queued', 'processing', 'error']);
const RESULT_STATES: ReadonlySet<string> = new Set(['provisional', 'final', 'aborted', 'failed']);
const LOG_CATEGORIES: ReadonlySet<string> = new Set(['phase', 'action', 'system', 'result']);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(message: string): never {
  throw new Error(`标准桌面视角无效：${message}`);
}

function expectNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) fail(`${label}必须是非空字符串`);
  return value;
}

function expectSafeNonnegative(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) fail(`${label}必须是非负安全整数`);
  return value as number;
}

function expectStringArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    fail(`${label}必须是字符串数组`);
  }
  return value as readonly string[];
}

function expectEnum(value: unknown, label: string, allowed: ReadonlySet<string>): string {
  const text = expectNonEmptyString(value, label);
  if (!allowed.has(text)) fail(`${label}包含未知枚举值 ${text}`);
  return text;
}

function expectNullableString(value: unknown, label: string): string | null {
  if (value === null) return null;
  return expectNonEmptyString(value, label);
}

function parsePhase(value: unknown): StandardTabletopViewV1['phase'] {
  if (!isObject(value)) fail('phase 必须是对象');
  return {
    code: expectNonEmptyString(value.code, 'phase.code'),
    sequence: expectSafeNonnegative(value.sequence, 'phase.sequence'),
  };
}

function parseRound(value: unknown): StandardTabletopViewV1['round'] {
  if (value === null) return null;
  if (!isObject(value)) fail('round 必须是对象或 null');
  return {
    number: expectSafeNonnegative(value.number, 'round.number'),
    code: expectNonEmptyString(value.code, 'round.code'),
  };
}

function parseTurn(value: unknown): StandardTabletopViewV1['turn'] {
  if (!isObject(value)) fail('turn 必须是对象');
  return {
    mode: expectEnum(value.mode, 'turn.mode', TURN_MODES) as TabletopTurnMode,
    actorPlayerIds: expectStringArray(value.actorPlayerIds, 'turn.actorPlayerIds'),
  };
}

function parseSeat(value: unknown): StandardTabletopViewV1['seats'][number] {
  if (!isObject(value)) fail('seat 必须是对象');
  return {
    playerId: expectNonEmptyString(value.playerId, 'seat.playerId'),
    seat: expectSafeNonnegative(value.seat, 'seat.seat'),
    participation: expectEnum(value.participation, 'seat.participation', PARTICIPATIONS) as TabletopParticipation,
    activity: expectEnum(value.activity, 'seat.activity', ACTIVITIES) as TabletopActivity,
  };
}

function parseClock(value: unknown): StandardTabletopViewV1['clock'] {
  if (value === null) return null;
  if (!isObject(value)) fail('clock 必须是对象或 null');
  return {
    id: expectNonEmptyString(value.id, 'clock.id'),
    kind: expectEnum(value.kind, 'clock.kind', CLOCK_KINDS) as TabletopClockKind,
    deadlineAt: expectSafeNonnegative(value.deadlineAt, 'clock.deadlineAt'),
  };
}

function parseLogEntry(value: unknown): StandardTabletopViewV1['publicLog']['entries'][number] {
  if (!isObject(value)) fail('publicLog 条目必须是对象');
  return {
    id: expectNonEmptyString(value.id, 'log.id'),
    sequence: expectSafeNonnegative(value.sequence, 'log.sequence'),
    occurredAt: expectSafeNonnegative(value.occurredAt, 'log.occurredAt'),
    category: expectEnum(value.category, 'log.category', LOG_CATEGORIES) as TabletopLogCategory,
    summary: expectNonEmptyString(value.summary, 'log.summary'),
    actorPlayerId: expectNullableString(value.actorPlayerId, 'log.actorPlayerId'),
    subjectPlayerIds: expectStringArray(value.subjectPlayerIds, 'log.subjectPlayerIds'),
  };
}

function parsePublicLog(value: unknown): StandardTabletopViewV1['publicLog'] {
  if (!isObject(value)) fail('publicLog 必须是对象');
  const entriesRaw = value.entries;
  if (!Array.isArray(entriesRaw)) fail('publicLog.entries 必须是数组');
  if (entriesRaw.length > MAX_PUBLIC_LOG_ENTRIES) {
    fail(`publicLog 超过 ${MAX_PUBLIC_LOG_ENTRIES} 条上限`);
  }
  return {
    revision: expectSafeNonnegative(value.revision, 'publicLog.revision'),
    entries: entriesRaw.map((entry) => parseLogEntry(entry)),
  };
}

function parseOperation(value: unknown): StandardTabletopViewV1['operations'][number] {
  if (!isObject(value)) fail('operation 必须是对象');
  const state = expectEnum(value.state, 'operation.state', OPERATION_STATES) as TabletopOperationState;
  const retryCapabilityId = value.retryCapabilityId === null ? null : expectNonEmptyString(value.retryCapabilityId, 'operation.retryCapabilityId');
  if (retryCapabilityId !== null && !isKnownTabletopCapability(retryCapabilityId)) {
    fail(`operation.retryCapabilityId 未知能力 ${retryCapabilityId}`);
  }
  const scope = expectEnum(value.scope, 'operation.scope', new Set(['table', 'viewer']));
  if (typeof value.recoverable !== 'boolean') fail('operation.recoverable 必须是布尔');
  return {
    id: expectNonEmptyString(value.id, 'operation.id'),
    kind: expectNonEmptyString(value.kind, 'operation.kind'),
    state,
    scope: scope as 'table' | 'viewer',
    recoverable: value.recoverable,
    errorCode: value.errorCode === null ? null : expectNonEmptyString(value.errorCode, 'operation.errorCode'),
    retryCapabilityId,
  };
}

function parseResult(value: unknown): StandardTabletopViewV1['result'] {
  if (value === null) return null;
  if (!isObject(value)) fail('result 必须是对象或 null');
  return {
    state: expectEnum(value.state, 'result.state', RESULT_STATES) as TabletopResultState,
    outcomeCode: expectNonEmptyString(value.outcomeCode, 'result.outcomeCode'),
    summary: expectNonEmptyString(value.summary, 'result.summary'),
  };
}

const REQUIRED_KEYS = [
  'version',
  'phase',
  'round',
  'turn',
  'seats',
  'clock',
  'availableCapabilityIds',
  'publicLog',
  'operations',
  'result',
] as const;

/** 严格解析标准桌面视角；任何非法形状抛错（失败关闭）。 */
export function parseTabletopView(input: unknown): StandardTabletopViewV1 {
  if (!isObject(input)) fail('必须是对象');
  for (const key of REQUIRED_KEYS) {
    if (!(key in input)) fail(`缺少字段 ${key}`);
  }
  const unknown = Object.keys(input).filter((key) => !(REQUIRED_KEYS as readonly string[]).includes(key));
  if (unknown.length > 0) fail(`未知字段 ${unknown.join(',')}`);
  if (input.version !== TABLETOP_VIEW_VERSION) fail(`版本 ${String(input.version)} 不受支持`);

  const capabilityIds = expectStringArray(input.availableCapabilityIds, 'availableCapabilityIds');
  for (const id of capabilityIds) {
    if (!isKnownTabletopCapability(id)) fail(`未知能力 ${id}`);
  }
  if (!Array.isArray(input.seats)) fail('seats 必须是数组');

  return {
    version: TABLETOP_VIEW_VERSION,
    phase: parsePhase(input.phase),
    round: parseRound(input.round),
    turn: parseTurn(input.turn),
    seats: (input.seats as unknown[]).map((seat) => parseSeat(seat)),
    clock: parseClock(input.clock),
    availableCapabilityIds: capabilityIds,
    publicLog: parsePublicLog(input.publicLog),
    operations: (input.operations as unknown[]).map((operation) => parseOperation(operation)),
    result: parseResult(input.result),
  };
}
