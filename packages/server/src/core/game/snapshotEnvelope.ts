import { createStateDigest, isSha256 } from './stateDigest.ts';

export const SNAPSHOT_ENGINE_CONTRACT_VERSION = 2 as const;

export interface SnapshotIdentity {
  readonly gameId: string;
  readonly rulesetId: string;
  readonly schemaVersion: number;
}

export interface SnapshotEnvelopeV2<S = unknown> extends SnapshotIdentity {
  readonly engineContractVersion: typeof SNAPSHOT_ENGINE_CONTRACT_VERSION;
  readonly createdAtSequence: number;
  readonly stateDigest: string;
  readonly rngState: { readonly cursor: number };
  readonly state: S;
}

const KEYS = [
  'engineContractVersion',
  'gameId',
  'rulesetId',
  'schemaVersion',
  'createdAtSequence',
  'stateDigest',
  'rngState',
  'state',
] as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertExactKeys(record: Record<string, unknown>, keys: readonly string[], label: string): void {
  const allowed = new Set(keys);
  const unknown = Object.keys(record).filter((key) => !allowed.has(key));
  if (unknown.length > 0) throw new Error(`${label}包含未知字段：${unknown.join(',')}`);
  const missing = keys.filter((key) => !(key in record));
  if (missing.length > 0) throw new Error(`${label}缺少字段：${missing.join(',')}`);
}

function assertSafeNonnegative(value: unknown, label: string): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error(`${label}必须是非负安全整数`);
}

function assertIdentity(record: Record<string, unknown>, expected: SnapshotIdentity): void {
  if (record.gameId !== expected.gameId) throw new Error('快照游戏 ID 不匹配');
  if (record.rulesetId !== expected.rulesetId) throw new Error('快照规则集不匹配');
  if (record.schemaVersion !== expected.schemaVersion) throw new Error('快照状态版本不匹配');
}

export function createSnapshotEnvelope<S>(input: SnapshotIdentity & {
  readonly createdAtSequence: number;
  readonly rngState: { readonly cursor: number };
  readonly state: S;
}): SnapshotEnvelopeV2<S> {
  assertSafeNonnegative(input.createdAtSequence, '快照创建序号');
  assertSafeNonnegative(input.rngState.cursor, '随机游标');
  if (!input.gameId || !input.rulesetId) throw new Error('快照身份不能为空');
  assertSafeNonnegative(input.schemaVersion, '状态版本');
  return {
    engineContractVersion: SNAPSHOT_ENGINE_CONTRACT_VERSION,
    gameId: input.gameId,
    rulesetId: input.rulesetId,
    schemaVersion: input.schemaVersion,
    createdAtSequence: input.createdAtSequence,
    stateDigest: createStateDigest(input.state),
    rngState: { cursor: input.rngState.cursor },
    state: input.state,
  };
}

export function parseSnapshotEnvelope<S = unknown>(
  value: unknown,
  expected: SnapshotIdentity,
): SnapshotEnvelopeV2<S> {
  if (!isObject(value)) throw new Error('快照信封必须是对象');
  assertExactKeys(value, KEYS, '快照信封');
  if (value.engineContractVersion !== SNAPSHOT_ENGINE_CONTRACT_VERSION) {
    throw new Error('快照引擎契约版本不兼容');
  }
  assertIdentity(value, expected);
  assertSafeNonnegative(value.createdAtSequence, '快照创建序号');
  if (!isSha256(value.stateDigest)) throw new Error('快照摘要格式无效');
  if (!isObject(value.rngState)) throw new Error('快照随机状态无效');
  assertExactKeys(value.rngState, ['cursor'], '快照随机状态');
  assertSafeNonnegative(value.rngState.cursor, '随机游标');
  const digest = createStateDigest(value.state);
  if (digest !== value.stateDigest) throw new Error('快照状态摘要不匹配');
  return value as unknown as SnapshotEnvelopeV2<S>;
}

export function isSnapshotEnvelopeV2(value: unknown): value is SnapshotEnvelopeV2 {
  return isObject(value) && value.engineContractVersion === SNAPSHOT_ENGINE_CONTRACT_VERSION;
}
