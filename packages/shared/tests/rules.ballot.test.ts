import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createBallot,
  getBallotView,
  revealBallot,
  resolveBallot,
  submitBallot,
} from '../src/game/rules/ballot.ts';

test('秘密投票提交后锁定选票，揭示前不暴露目标', () => {
  const initial = createBallot({
    voterIds: ['a', 'b', 'c'],
    candidateIds: ['a', 'b', 'c'],
    visibility: 'secret',
    allowSelfVote: false,
    victory: 'plurality',
    tiePolicy: 'revote',
  });
  const first = submitBallot(initial, 'a', 'b');
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.deepEqual(getBallotView(first.state), {
    visibility: 'secret',
    locked: false,
    revealed: false,
    voterIds: ['a', 'b', 'c'],
    candidateIds: ['a', 'b', 'c'],
    submittedVoterIds: ['a'],
    submissions: null,
  });
  assert.equal(submitBallot(first.state, 'a', 'c').ok, false);
  assert.deepEqual(initial.submissions, {});
});

test('公开投票立即展示目标并拒绝非法选票', () => {
  const initial = createBallot({
    voterIds: ['a', 'b'],
    candidateIds: ['a', 'b'],
    visibility: 'public',
    allowSelfVote: false,
    victory: 'plurality',
    tiePolicy: 'no_winner',
  });
  assert.equal(submitBallot(initial, 'a', 'a').ok, false);
  assert.equal(submitBallot(initial, 'missing', 'b').ok, false);
  const submitted = submitBallot(initial, 'a', 'b');
  assert.equal(submitted.ok, true);
  if (!submitted.ok) return;
  assert.deepEqual(getBallotView(submitted.state).submissions, { a: 'b' });
});

test('秘密投票在锁定并揭示前不可结算', () => {
  const initial = createBallot({
    voterIds: ['a', 'b'],
    candidateIds: ['x', 'y'],
    visibility: 'secret',
    allowSelfVote: false,
    victory: 'plurality',
    tiePolicy: 'revote',
  });
  const partial = submitBallot(initial, 'a', 'x');
  assert.equal(partial.ok, true);
  if (!partial.ok) return;
  assert.deepEqual(resolveBallot(partial.state), { ok: false, code: 'BALLOT_NOT_COMPLETE' });
  const complete = submitBallot(partial.state, 'b', 'x');
  assert.equal(complete.ok, true);
  if (!complete.ok) return;
  assert.deepEqual(resolveBallot(complete.state), { ok: false, code: 'BALLOT_NOT_REVEALED' });
});

test('锁定后禁止提交，秘密选票同时揭示并按简单多数结算', () => {
  let state = createBallot({
    voterIds: ['a', 'b', 'c'],
    candidateIds: ['x', 'y'],
    visibility: 'secret',
    allowSelfVote: false,
    victory: 'plurality',
    tiePolicy: 'revote',
  });
  for (const [voterId, candidateId] of [['a', 'x'], ['b', 'x'], ['c', 'y']] as const) {
    const result = submitBallot(state, voterId, candidateId);
    assert.equal(result.ok, true);
    if (result.ok) state = result.state;
  }
  assert.equal(state.locked, true);
  assert.equal(submitBallot(state, 'a', 'y').ok, false);
  const revealed = revealBallot(state);
  assert.equal(revealed.ok, true);
  if (!revealed.ok) return;
  assert.deepEqual(getBallotView(revealed.state).submissions, { a: 'x', b: 'x', c: 'y' });
  assert.deepEqual(resolveBallot(revealed.state), {
    status: 'winner',
    winnerIds: ['x'],
    tally: { x: 2, y: 1 },
    submitted: 3,
    abstained: 0,
  });
});

test('平票策略区分重投与无人胜出，全票要求所有选民同选', () => {
  const build = (tiePolicy: 'revote' | 'no_winner', victory: 'plurality' | 'unanimous') => {
    let state = createBallot({
      voterIds: ['a', 'b'],
      candidateIds: ['x', 'y'],
      visibility: 'public' as const,
      allowSelfVote: false,
      victory,
      tiePolicy,
    });
    for (const [voterId, candidateId] of [['a', 'x'], ['b', 'y']] as const) {
      const result = submitBallot(state, voterId, candidateId);
      if (result.ok) state = result.state;
    }
    return state;
  };
  assert.equal(resolveBallot(build('revote', 'plurality')).status, 'revote');
  assert.equal(resolveBallot(build('no_winner', 'plurality')).status, 'no_winner');
  assert.equal(resolveBallot(build('no_winner', 'unanimous')).status, 'no_winner');
  const empty = createBallot({
    voterIds: ['a'],
    candidateIds: ['x'],
    visibility: 'public',
    allowSelfVote: false,
    victory: 'plurality',
    tiePolicy: 'revote',
  });
  assert.equal(resolveBallot(empty).status, 'no_winner');
});
