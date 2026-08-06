/**
 * D4-T：标准桌面契约与严格解析测试。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_PUBLIC_LOG_ENTRIES,
  TABLETOP_VIEW_VERSION,
  isKnownTabletopCapability,
  parseTabletopView,
  type StandardTabletopViewV1,
} from '../src/game/tabletop/index.ts';

function validView(overrides: Partial<StandardTabletopViewV1> = {}): StandardTabletopViewV1 {
  return {
    version: TABLETOP_VIEW_VERSION,
    phase: { code: 'speaking', sequence: 3 },
    round: { number: 1, code: 'round' },
    turn: { mode: 'single', actorPlayerIds: ['p1'] },
    seats: [{ playerId: 'p1', seat: 0, participation: 'active', activity: 'acting' }],
    clock: { id: 'turn:1', kind: 'turn', deadlineAt: 1_700_000_000_000 },
    availableCapabilityIds: ['canSpeak', 'canVote'],
    publicLog: {
      revision: 2,
      entries: [
        {
          id: 'e1',
          sequence: 1,
          occurredAt: 1_700_000_000_000,
          category: 'phase',
          summary: '进入发言阶段',
          actorPlayerId: null,
          subjectPlayerIds: [],
        },
      ],
    },
    operations: [],
    result: null,
    ...overrides,
  };
}

test('T：合法标准桌面视角通过严格解析', () => {
  const parsed = parseTabletopView(validView());
  assert.equal(parsed.version, TABLETOP_VIEW_VERSION);
  assert.equal(parsed.seats.length, 1);
  assert.deepEqual(parsed.availableCapabilityIds, ['canSpeak', 'canVote']);
});

test('T：未知字段、缺失字段与错误版本一律拒绝', () => {
  assert.throws(() => parseTabletopView({ ...validView(), extra: true }), /未知字段/);
  const { phase: _phase, ...missing } = validView();
  assert.throws(() => parseTabletopView(missing), /缺少字段/);
  assert.throws(() => parseTabletopView({ ...validView(), version: 2 }), /版本/);
});

test('T：未知能力 ID 与非法枚举按契约错误处理', () => {
  assert.throws(
    () => parseTabletopView({ ...validView(), availableCapabilityIds: ['canDoMagic'] }),
    /未知能力/,
  );
  assert.throws(
    () => parseTabletopView({ ...validView(), turn: { mode: 'warp', actorPlayerIds: [] } }),
    /未知枚举/,
  );
  assert.throws(
    () => parseTabletopView({ ...validView(), result: { state: 'winning', outcomeCode: 'x', summary: 'y' } }),
    /未知枚举/,
  );
  assert.equal(isKnownTabletopCapability('canVote'), true);
  assert.equal(isKnownTabletopCapability('canDoMagic'), false);
});

test('T：publicLog 有界且条目严格校验', () => {
  const entries = Array.from({ length: MAX_PUBLIC_LOG_ENTRIES + 1 }, (_, index) => ({
    id: `e${index}`,
    sequence: index,
    occurredAt: 1,
    category: 'system',
    summary: 'x',
    actorPlayerId: null,
    subjectPlayerIds: [],
  }));
  assert.throws(
    () => parseTabletopView({ ...validView(), publicLog: { revision: 1, entries } }),
    /上限/,
  );
  assert.throws(
    () =>
      parseTabletopView({
        ...validView(),
        publicLog: {
          revision: 1,
          entries: [{ ...entries[0]!, category: 'top_secret' }],
        },
      }),
    /未知枚举/,
  );
});

test('T：operations 的 retryCapabilityId 必须是已知能力', () => {
  assert.throws(
    () =>
      parseTabletopView({
        ...validView(),
        operations: [
          {
            id: 't1',
            kind: 'guess',
            state: 'queued',
            scope: 'table',
            recoverable: true,
            errorCode: null,
            retryCapabilityId: 'canDoMagic',
          },
        ],
      }),
    /未知能力/,
  );
  const parsed = parseTabletopView({
    ...validView(),
    operations: [
      {
        id: 't1',
        kind: 'guess',
        state: 'processing',
        scope: 'viewer',
        recoverable: true,
        errorCode: 'PROVIDER_TIMEOUT',
        retryCapabilityId: 'canGuessWord',
      },
    ],
  });
  assert.equal(parsed.operations[0]?.state, 'processing');
});

test('T：provisional / final / aborted / failed 结果状态闭合', () => {
  for (const state of ['provisional', 'final', 'aborted', 'failed'] as const) {
    const parsed = parseTabletopView({
      ...validView(),
      result: { state, outcomeCode: 'civilian', summary: '平民胜' },
    });
    assert.equal(parsed.result?.state, state);
  }
});
