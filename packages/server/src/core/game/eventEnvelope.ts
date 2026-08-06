import type { GameEffect, PrivateGameEvent } from '@ldj/shared';
import { isSha256 } from './stateDigest.ts';

export const EVENT_ENGINE_CONTRACT_VERSION = 2 as const;

export interface EffectReceipt {
  readonly effectIndex: number;
  readonly kind: 'timer' | 'chat' | 'none';
  readonly receiptId: string;
}

export interface EventEnvelopeV2 {
  readonly engineContractVersion: typeof EVENT_ENGINE_CONTRACT_VERSION;
  readonly rulesetId: string;
  readonly roomSeq: number;
  readonly publicEvents: readonly unknown[];
  readonly privateEvents: readonly PrivateGameEvent[];
  readonly effects: readonly GameEffect[];
  readonly effectReceipts: readonly EffectReceipt[];
  readonly resultCandidate: unknown | null;
  readonly rngCursorBefore: number;
  readonly rngCursorAfter: number;
  readonly nextStateDigest: string;
}

const KEYS = [
  'engineContractVersion',
  'rulesetId',
  'roomSeq',
  'publicEvents',
  'privateEvents',
  'effects',
  'effectReceipts',
  'resultCandidate',
  'rngCursorBefore',
  'rngCursorAfter',
  'nextStateDigest',
] as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertSafeNonnegative(value: unknown, label: string): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error(`${label}必须是非负安全整数`);
}

function assertExactKeys(record: Record<string, unknown>): void {
  const allowed = new Set<string>(KEYS);
  const unknown = Object.keys(record).filter((key) => !allowed.has(key));
  if (unknown.length > 0) throw new Error(`事件信封包含未知字段：${unknown.join(',')}`);
  const missing = KEYS.filter((key) => !(key in record));
  if (missing.length > 0) throw new Error(`事件信封缺少字段：${missing.join(',')}`);
}

function validate(value: unknown, expectedRulesetId: string): asserts value is EventEnvelopeV2 {
  if (!isObject(value)) throw new Error('事件信封必须是对象');
  assertExactKeys(value);
  if (value.engineContractVersion !== EVENT_ENGINE_CONTRACT_VERSION) throw new Error('事件契约版本不兼容');
  if (value.rulesetId !== expectedRulesetId) throw new Error('事件规则集不匹配');
  assertSafeNonnegative(value.roomSeq, '房间序号');
  assertSafeNonnegative(value.rngCursorBefore, '动作前随机游标');
  assertSafeNonnegative(value.rngCursorAfter, '动作后随机游标');
  if (!Array.isArray(value.publicEvents) || !Array.isArray(value.privateEvents)
    || !Array.isArray(value.effects) || !Array.isArray(value.effectReceipts)) {
    throw new Error('事件信封列表字段无效');
  }
  if (!isSha256(value.nextStateDigest)) throw new Error('事件下一状态摘要无效');
  for (const receipt of value.effectReceipts) {
    if (!isObject(receipt)) throw new Error('effect receipt 无效');
    assertSafeNonnegative(receipt.effectIndex, 'effect 索引');
    if (!['timer', 'chat', 'none'].includes(String(receipt.kind)) || typeof receipt.receiptId !== 'string') {
      throw new Error('effect receipt 无效');
    }
  }
}

export function createEventEnvelope(
  input: Omit<EventEnvelopeV2, 'engineContractVersion'>,
): EventEnvelopeV2 {
  const envelope: EventEnvelopeV2 = {
    engineContractVersion: EVENT_ENGINE_CONTRACT_VERSION,
    ...input,
  };
  validate(envelope, input.rulesetId);
  return envelope;
}

export function isVersionedEventEnvelope(value: unknown): value is EventEnvelopeV2 {
  return isObject(value) && value.engineContractVersion === EVENT_ENGINE_CONTRACT_VERSION;
}

export function parseEventEnvelope(value: unknown, expectedRulesetId: string): EventEnvelopeV2 {
  validate(value, expectedRulesetId);
  return value;
}
