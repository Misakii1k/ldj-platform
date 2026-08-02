import test from 'node:test';
import assert from 'node:assert/strict';
import {
  completeHostedTurn,
  createHostedSequence,
  getHostedPrompt,
  getHostedProgress,
  timeoutHostedTurn,
} from '../src/game/rules/hosted.ts';

test('hosted sequence follows order and exposes the current public prompt', () => {
  const state = createHostedSequence({
    id: 'round-1',
    participantIds: ['a', 'b', 'c'],
    now: 1_000,
    turnDurationMs: 30_000,
    prompt: ({ participantId, position, total }) => `${position + 1}/${total} ${participantId} 发言`,
  });

  assert.equal(state.currentParticipantId, 'a');
  assert.equal(state.deadlineAt, 31_000);
  assert.equal(state.timerId, 'hosted:round-1:0:a');
  assert.equal(getHostedPrompt(state), '1/3 a 发言');
  assert.deepEqual(getHostedProgress(state), { completed: 0, total: 3, finished: false });
});

test('hosted completion is immutable, requires the current participant and advances once', () => {
  const initial = createHostedSequence({
    id: 'round-1',
    participantIds: ['a', 'b'],
    now: 100,
    turnDurationMs: 1_000,
    prompt: '请完成线下表演',
  });

  assert.throws(() => completeHostedTurn(initial, 'b', 200), /当前参与者/);
  const advanced = completeHostedTurn(initial, 'a', 200);
  assert.equal(initial.currentParticipantId, 'a');
  assert.equal(advanced.currentParticipantId, 'b');
  assert.deepEqual(advanced.completedParticipantIds, ['a']);
  assert.equal(advanced.deadlineAt, 1_200);
  assert.equal(advanced.timerId, 'hosted:round-1:1:b');

  const finished = completeHostedTurn(advanced, 'b', 300);
  assert.equal(finished.status, 'completed');
  assert.equal(finished.currentParticipantId, null);
  assert.equal(finished.deadlineAt, null);
  assert.equal(finished.timerId, null);
  assert.deepEqual(getHostedProgress(finished), { completed: 2, total: 2, finished: true });
});

test('hosted timeout advances deterministically and stale timer delivery is ignored', () => {
  const initial = createHostedSequence({
    id: 'performance',
    participantIds: ['a', 'b'],
    now: 10,
    turnDurationMs: 50,
    prompt: '轮流表演',
  });

  const early = timeoutHostedTurn(initial, initial.timerId!, 59);
  assert.equal(early, initial);
  const advanced = timeoutHostedTurn(initial, initial.timerId!, 60);
  assert.equal(advanced.currentParticipantId, 'b');
  assert.deepEqual(advanced.timedOutParticipantIds, ['a']);
  assert.deepEqual(advanced.completedParticipantIds, []);
  assert.equal(timeoutHostedTurn(advanced, initial.timerId!, 100), advanced);
});

test('hosted sequence validates unique participants and timing', () => {
  assert.throws(
    () => createHostedSequence({ id: 'x', participantIds: [], now: 0, turnDurationMs: 1, prompt: 'x' }),
    /参与者/,
  );
  assert.throws(
    () => createHostedSequence({ id: 'x', participantIds: ['a', 'a'], now: 0, turnDurationMs: 1, prompt: 'x' }),
    /重复/,
  );
  assert.throws(
    () => createHostedSequence({ id: 'x', participantIds: ['a'], now: 0, turnDurationMs: 0, prompt: 'x' }),
    /时长/,
  );
});
