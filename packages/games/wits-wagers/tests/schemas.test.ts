import test from 'node:test';
import assert from 'node:assert/strict';
import { parseConfig, parseAction } from '../server/schemas.ts';

test('schemas: parseConfig 校验', () => {
  assert.deepEqual(parseConfig({}), {});
  assert.deepEqual(parseConfig({ answerSeconds: 30, betSeconds: 60 }), { answerSeconds: 30, betSeconds: 60 });
  assert.deepEqual(parseConfig({ rulesetId: 'wits_wagers_platform_v1' }), { rulesetId: 'wits_wagers_platform_v1' });

  // 拒绝非 30/60/90 秒
  assert.throws(() => parseConfig({ answerSeconds: 45 }));
  // 拒绝未知配置键
  assert.throws(() => parseConfig({ unknownKey: 123 }));
});

test('schemas: submit_guess 动作校验', () => {
  const valid = {
    type: 'submit_guess',
    roundToken: 'tok123',
    expectedRevision: 0,
    value: 500,
  };
  assert.deepEqual(parseAction(valid), valid);

  // 拒绝额外字段（如试图携带 score/odds/answer）
  assert.throws(() => parseAction({ ...valid, score: 100 }));
  assert.throws(() => parseAction({ ...valid, answer: 500 }));

  // 拒绝小数、负数、0、超上限
  assert.throws(() => parseAction({ ...valid, value: 500.5 }));
  assert.throws(() => parseAction({ ...valid, value: 0 }));
  assert.throws(() => parseAction({ ...valid, value: -1 }));
  assert.throws(() => parseAction({ ...valid, value: 1_000_000_000_000 }));

  // expectedRevision 必须非负整数
  assert.throws(() => parseAction({ ...valid, expectedRevision: -1 }));
  assert.throws(() => parseAction({ ...valid, expectedRevision: 1.5 }));
});

test('schemas: set_bets 动作校验', () => {
  const valid = {
    type: 'set_bets',
    roundToken: 'tok123',
    expectedRevision: 0,
    chips: [
      { chipId: 'A', targetId: 'g:300', extraStake: 5 },
      { chipId: 'B', targetId: null, extraStake: 0 },
    ],
  };
  assert.deepEqual(parseAction(valid), valid);

  // 必须严格为 A 后 B
  assert.throws(() =>
    parseAction({
      ...valid,
      chips: [
        { chipId: 'B', targetId: null, extraStake: 0 },
        { chipId: 'A', targetId: null, extraStake: 0 },
      ],
    }),
  );

  // 未放置筹码 (targetId null) 必须 extraStake === 0
  assert.throws(() =>
    parseAction({
      ...valid,
      chips: [
        { chipId: 'A', targetId: null, extraStake: 2 },
        { chipId: 'B', targetId: null, extraStake: 0 },
      ],
    }),
  );

  // 拒绝 3 枚筹码或 1 枚筹码
  assert.throws(() => parseAction({ ...valid, chips: [valid.chips[0]] }));

  // 拒绝未知字段
  assert.throws(() => parseAction({ ...valid, odds: 3 }));
});

test('schemas: begin、phase_timeout、player_forfeited 动作校验', () => {
  assert.deepEqual(parseAction({ type: 'begin' }), { type: 'begin' });
  assert.throws(() => parseAction({ type: 'begin', extra: true }));

  const validTimeout = {
    type: 'phase_timeout',
    roundToken: 'tok123',
    phaseEpoch: 1,
    phase: 'answering',
  };
  assert.deepEqual(parseAction(validTimeout), validTimeout);
  assert.throws(() => parseAction({ ...validTimeout, phase: 'unknown_phase' }));

  const validForfeit = {
    type: 'player_forfeited',
    playerIds: ['p1'],
  };
  assert.deepEqual(parseAction(validForfeit), validForfeit);
  assert.throws(() => parseAction({ type: 'player_forfeited', playerIds: [] }));
});
