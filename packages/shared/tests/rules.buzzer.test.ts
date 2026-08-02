import test from 'node:test';
import assert from 'node:assert/strict';
import {
  claimBuzzer,
  closeBuzzerWindow,
  openBuzzerWindow,
} from '../src/game/rules/buzzer.ts';

test('buzzer locks the first legal claim and freezes its snapshot reference', () => {
  const opened = openBuzzerWindow<string>('round-1');
  const rejected = claimBuzzer(opened, {
    playerId: 'p1',
    roomSeq: 7,
    snapshotRef: 'snapshot-7',
    legal: false,
  });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, 'ILLEGAL_CLAIM');
  assert.equal(rejected.state, opened);

  const won = claimBuzzer(opened, {
    playerId: 'p2',
    roomSeq: 8,
    snapshotRef: 'snapshot-8',
    legal: true,
  });
  assert.equal(won.ok, true);
  assert.deepEqual(won.state, {
    windowId: 'round-1',
    status: 'locked',
    winner: {
      playerId: 'p2',
      roomSeq: 8,
      snapshotRef: 'snapshot-8',
    },
  });

  const late = claimBuzzer(won.state, {
    playerId: 'p3',
    roomSeq: 9,
    snapshotRef: 'snapshot-9',
    legal: true,
  });
  assert.equal(late.ok, false);
  assert.equal(late.code, 'WINDOW_LOCKED');
  assert.equal(late.state, won.state);
});

test('closing a buzzer window is immutable, idempotent, and rejects later claims', () => {
  const opened = openBuzzerWindow<{ revision: number }>('round-2');
  const closed = closeBuzzerWindow(opened);
  assert.notEqual(closed, opened);
  assert.deepEqual(closed, { windowId: 'round-2', status: 'closed', winner: null });
  assert.equal(closeBuzzerWindow(closed), closed);

  const late = claimBuzzer(closed, {
    playerId: 'p1',
    roomSeq: 1,
    snapshotRef: { revision: 1 },
    legal: true,
  });
  assert.equal(late.ok, false);
  assert.equal(late.code, 'WINDOW_CLOSED');
  assert.equal(late.state, closed);
});

test('closing a locked buzzer preserves the winning claim', () => {
  const won = claimBuzzer(openBuzzerWindow<string>('round-3'), {
    playerId: 'p1',
    roomSeq: 3,
    snapshotRef: 'snapshot-3',
    legal: true,
  });
  assert.equal(won.ok, true);
  const closed = closeBuzzerWindow(won.state);
  assert.deepEqual(closed, {
    windowId: 'round-3',
    status: 'closed',
    winner: {
      playerId: 'p1',
      roomSeq: 3,
      snapshotRef: 'snapshot-3',
    },
  });
});
