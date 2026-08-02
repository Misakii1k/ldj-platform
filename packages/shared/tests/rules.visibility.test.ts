import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canObserve, type ObservationContext } from '../src/game/rules/visibility.ts';

const owner: ObservationContext = { role: 'participant', playerId: 'owner', revealed: false };
const other: ObservationContext = { role: 'participant', playerId: 'other', revealed: false };
const spectator: ObservationContext = { role: 'spectator', revealed: false };

test('public 对所有接收者可见', () => {
  assert.equal(canObserve('public', owner, 'owner'), true);
  assert.equal(canObserve('public', spectator, 'owner'), true);
});

test('owner_only 只对所属参与者可见', () => {
  assert.equal(canObserve('owner_only', owner, 'owner'), true);
  assert.equal(canObserve('owner_only', other, 'owner'), false);
  assert.equal(canObserve('owner_only', spectator, 'owner'), false);
  assert.equal(canObserve('owner_only', owner), false);
});

test('others_only 对本人隐藏且不向观战者公开', () => {
  assert.equal(canObserve('others_only', owner, 'owner'), false);
  assert.equal(canObserve('others_only', other, 'owner'), true);
  assert.equal(canObserve('others_only', spectator, 'owner'), false);
  assert.equal(canObserve('others_only', other), false);
});

test('participants 只对在局玩家可见', () => {
  assert.equal(canObserve('participants', owner), true);
  assert.equal(canObserve('participants', spectator), false);
});

test('after_reveal 仅在接收者可见阶段公开', () => {
  assert.equal(canObserve('after_reveal', owner), false);
  assert.equal(canObserve('after_reveal', { ...owner, revealed: true }), true);
  assert.equal(canObserve('after_reveal', { ...spectator, revealed: true }), true);
});
