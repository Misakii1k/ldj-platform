import test from 'node:test';
import assert from 'node:assert/strict';
import {
  confirmParticipant,
  createConfirmationBarrier,
  createFlowTimerId,
  defineFlow,
  getConfirmationProgress,
  getPhaseDefinition,
  isActionAllowed,
  resolveSafeTimeout,
  syncConfirmationParticipants,
} from '../src/game/rules/flow.ts';

test('flow defines phases and limits actions to the active window', () => {
  const flow = defineFlow([
    {
      id: 'reveal',
      allowedActions: ['confirm'],
      timeout: { afterMs: 10_000, strategy: 'confirm_current', action: { type: 'reveal_timeout' } },
    },
    {
      id: 'vote',
      allowedActions: ['vote', 'abstain'],
      timeout: { afterMs: 20_000, strategy: 'skip', action: { type: 'vote_timeout' } },
    },
  ] as const);

  const reveal = getPhaseDefinition(flow, 'reveal');
  assert.equal(isActionAllowed(reveal, 'confirm'), true);
  assert.equal(isActionAllowed(reveal, 'vote'), false);
  assert.deepEqual(resolveSafeTimeout(reveal), {
    afterMs: 10_000,
    strategy: 'confirm_current',
    action: { type: 'reveal_timeout' },
  });
  assert.throws(() => getPhaseDefinition(flow, 'missing'), /未知阶段/);
});

test('confirmation barrier is immutable, idempotent and only counts current participants', () => {
  const initial = createConfirmationBarrier(['a', 'b', 'c']);
  const first = confirmParticipant(initial, 'a');
  const duplicate = confirmParticipant(first, 'a');

  assert.deepEqual(initial.confirmedParticipantIds, []);
  assert.deepEqual(duplicate.confirmedParticipantIds, ['a']);
  assert.deepEqual(getConfirmationProgress(duplicate), {
    confirmed: 1,
    expected: 3,
    complete: false,
    pendingParticipantIds: ['b', 'c'],
  });
  assert.throws(() => confirmParticipant(initial, 'outside'), /不在确认范围/);

  const synced = syncConfirmationParticipants(duplicate, ['a', 'c']);
  assert.deepEqual(getConfirmationProgress(synced), {
    confirmed: 1,
    expected: 2,
    complete: false,
    pendingParticipantIds: ['c'],
  });
  const completed = confirmParticipant(synced, 'c');
  assert.equal(getConfirmationProgress(completed).complete, true);
});

test('flow timer IDs are deterministic and reject unsafe segments', () => {
  assert.equal(createFlowTimerId('loveletter', 'reveal', 3), 'flow:loveletter:reveal:3');
  assert.equal(createFlowTimerId('loveletter', 'reveal', 3), 'flow:loveletter:reveal:3');
  assert.throws(() => createFlowTimerId('love:letter', 'reveal', 3), /计时器段/);
  assert.throws(() => createFlowTimerId('loveletter', 'reveal', -1), /序号/);
});

test('safe timeout action is cloned and timeout policy must be explicit', () => {
  const action = { type: 'forfeit', choices: ['a'] };
  const flow = defineFlow([
    {
      id: 'perform',
      allowedActions: ['done'],
      timeout: { afterMs: 5_000, strategy: 'forfeit_turn', action },
    },
    { id: 'paused', allowedActions: [], timeout: null },
  ] as const);
  const perform = getPhaseDefinition(flow, 'perform');
  const timeout = resolveSafeTimeout(perform);
  assert.ok(timeout);
  if (timeout) timeout.action.choices.push('b');
  assert.deepEqual(resolveSafeTimeout(perform)?.action, { type: 'forfeit', choices: ['a'] });
  assert.equal(resolveSafeTimeout(getPhaseDefinition(flow, 'paused')), null);
  assert.throws(
    () => defineFlow([{ id: 'bad', allowedActions: [], timeout: { afterMs: 0, strategy: 'pause', action: null } }]),
    /超时时长/,
  );
});
