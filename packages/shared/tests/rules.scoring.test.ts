import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addScores,
  advanceScoringRound,
  createScoreLedger,
  getScoringResult,
} from '../src/game/rules/scoring.ts';

test('个人与阵营分数独立累计且不修改原账本', () => {
  const initial = createScoreLedger({
    playerIds: ['a', 'b'],
    teamIds: ['red', 'blue'],
    endCondition: { type: 'target', targetScore: 10 },
  });
  const updated = addScores(initial, {
    players: { a: 3, b: -1 },
    teams: { red: 2 },
  });
  assert.equal(updated.ok, true);
  if (!updated.ok) return;
  assert.deepEqual(updated.state.playerScores, { a: 3, b: -1 });
  assert.deepEqual(updated.state.teamScores, { red: 2, blue: 0 });
  assert.deepEqual(initial.playerScores, { a: 0, b: 0 });
  assert.equal(addScores(updated.state, { players: { missing: 1 } }).ok, false);
});

test('目标分终局返回所有并列领先者', () => {
  const initial = createScoreLedger({
    playerIds: ['a', 'b', 'c'],
    teamIds: [],
    endCondition: { type: 'target', targetScore: 5 },
  });
  const updated = addScores(initial, { players: { a: 5, b: 5, c: 2 } });
  assert.equal(updated.ok, true);
  if (!updated.ok) return;
  assert.deepEqual(getScoringResult(updated.state, 'players'), {
    finished: true,
    winnerIds: ['a', 'b'],
    tied: true,
    highScore: 5,
  });
});

test('固定轮数仅在轮数完成后结算个人与阵营排名', () => {
  let state = createScoreLedger({
    playerIds: ['a', 'b'],
    teamIds: ['red', 'blue'],
    endCondition: { type: 'rounds', rounds: 2 },
  });
  let updated = addScores(state, { players: { a: 2 }, teams: { red: 1 } });
  assert.equal(updated.ok, true);
  if (!updated.ok) return;
  state = advanceScoringRound(updated.state);
  assert.equal(getScoringResult(state, 'players').finished, false);
  updated = addScores(state, { players: { b: 3 }, teams: { blue: 1 } });
  assert.equal(updated.ok, true);
  if (!updated.ok) return;
  state = advanceScoringRound(updated.state);
  assert.deepEqual(getScoringResult(state, 'players'), {
    finished: true,
    winnerIds: ['b'],
    tied: false,
    highScore: 3,
  });
  assert.deepEqual(getScoringResult(state, 'teams').winnerIds, ['red', 'blue']);
  assert.equal(advanceScoringRound(state), state);
});

test('计分拒绝非有限值并在无阵营时返回空结果集合', () => {
  const state = createScoreLedger({
    playerIds: ['a'],
    teamIds: [],
    endCondition: { type: 'rounds', rounds: 1 },
  });
  assert.equal(addScores(state, { players: { a: Number.NaN } }).ok, false);
  const finished = advanceScoringRound(state);
  assert.deepEqual(getScoringResult(finished, 'teams'), {
    finished: true,
    winnerIds: [],
    tied: false,
    highScore: null,
  });
});

test('计分配置拒绝无效终局条件并阻止累计分溢出', () => {
  assert.throws(
    () => createScoreLedger({
      playerIds: ['a'],
      teamIds: [],
      endCondition: { type: 'rounds', rounds: 0 },
    }),
    /终局轮数必须为正整数/,
  );
  assert.throws(
    () => createScoreLedger({
      playerIds: ['a'],
      teamIds: [],
      endCondition: { type: 'target', targetScore: Number.POSITIVE_INFINITY },
    }),
    /目标分必须为正有限值/,
  );
  const state = createScoreLedger({
    playerIds: ['a'],
    teamIds: [],
    endCondition: { type: 'target', targetScore: Number.MAX_VALUE },
  });
  const first = addScores(state, { players: { a: Number.MAX_VALUE } });
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.deepEqual(addScores(first.state, { players: { a: Number.MAX_VALUE } }), {
    ok: false,
    code: 'INVALID_SCORE',
  });
});
