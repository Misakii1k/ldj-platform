import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSnapshotEnvelope,
  parseSnapshotEnvelope,
} from '../src/core/game/snapshotEnvelope.ts';
import { createStateDigest } from '../src/core/game/stateDigest.ts';
import {
  createEventEnvelope,
  parseEventEnvelope,
} from '../src/core/game/eventEnvelope.ts';

const identity = {
  gameId: 'undercover',
  rulesetId: 'undercover_classic_v1',
  schemaVersion: 1,
};

test('状态摘要不依赖对象键顺序且拒绝不可序列化值', () => {
  assert.equal(
    createStateDigest({ b: [2, { y: true, x: null }], a: 1 }),
    createStateDigest({ a: 1, b: [2, { x: null, y: true }] }),
  );
  assert.throws(() => createStateDigest({ bad: Number.NaN }), /有限数值/);
  assert.throws(() => createStateDigest({ bad: undefined }), /JSON/);
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  assert.throws(() => createStateDigest(cyclic), /循环引用/);
});

test('快照信封保留 state 字段顺序并校验摘要、身份、序号与 RNG', () => {
  const state = { z: 1, a: { second: 2, first: 1 } };
  const envelope = createSnapshotEnvelope({
    ...identity,
    createdAtSequence: 7,
    rngState: { cursor: 9 },
    state,
  });

  assert.deepEqual(Object.keys(envelope.state as object), ['z', 'a']);
  assert.deepEqual(parseSnapshotEnvelope(envelope, identity), envelope);
  assert.throws(
    () => parseSnapshotEnvelope({ ...envelope, state: { z: 2, a: state.a } }, identity),
    /摘要/,
  );
  assert.throws(
    () => parseSnapshotEnvelope(envelope, { ...identity, rulesetId: 'wrong' }),
    /规则集/,
  );
  assert.throws(
    () => createSnapshotEnvelope({ ...identity, createdAtSequence: -1, rngState: { cursor: 0 }, state }),
    /序号/,
  );
  assert.throws(
    () => createSnapshotEnvelope({ ...identity, createdAtSequence: 0, rngState: { cursor: 1.5 }, state }),
    /随机游标/,
  );
});

test('快照信封严格拒绝未知字段和非 V2 contract', () => {
  const envelope = createSnapshotEnvelope({
    ...identity,
    createdAtSequence: 0,
    rngState: { cursor: 0 },
    state: { ok: true },
  });
  assert.throws(() => parseSnapshotEnvelope({ ...envelope, extra: true }, identity), /未知字段/);
  assert.throws(() => parseSnapshotEnvelope({ ...envelope, engineContractVersion: 3 }, identity), /契约版本/);
});

test('事件信封记录 roomSeq、公共/私有事件、effect receipt、结果与 RNG 边界', () => {
  const envelope = createEventEnvelope({
    rulesetId: identity.rulesetId,
    roomSeq: 12,
    publicEvents: [{ type: 'phase_changed' }],
    privateEvents: [{ recipients: ['p1'], event: { type: 'secret' } }],
    effects: [{ type: 'cancel_timer', timerId: 't1' }],
    effectReceipts: [{ effectIndex: 0, kind: 'timer', receiptId: 't1:cancelled' }],
    resultCandidate: null,
    rngCursorBefore: 3,
    rngCursorAfter: 4,
    nextStateDigest: createStateDigest({ n: 2 }),
  });

  assert.deepEqual(parseEventEnvelope(envelope, identity.rulesetId), envelope);
  assert.throws(() => parseEventEnvelope({ ...envelope, roomSeq: -1 }, identity.rulesetId), /房间序号/);
  assert.throws(() => parseEventEnvelope({ ...envelope, nextStateDigest: 'bad' }, identity.rulesetId), /摘要/);
  assert.throws(() => parseEventEnvelope(envelope, 'wrong'), /规则集/);
});
