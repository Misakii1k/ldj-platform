import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  nextTurnParticipant,
  rotateTurnOrder,
  type TurnDirection,
} from '../src/game/rules/turns.ts';

const seats = Object.freeze(['p1', 'p2', 'p3', 'p4']);

test('下一参与者按顺时针环绕且不修改输入', () => {
  assert.equal(nextTurnParticipant(seats, 'p1'), 'p2');
  assert.equal(nextTurnParticipant(seats, 'p4'), 'p1');
  assert.deepEqual(seats, ['p1', 'p2', 'p3', 'p4']);
});

test('下一参与者支持逆时针和跳过多名合格参与者', () => {
  assert.equal(nextTurnParticipant(seats, 'p1', { direction: -1 }), 'p4');
  assert.equal(nextTurnParticipant(seats, 'p1', { steps: 2 }), 'p3');
  assert.equal(nextTurnParticipant(seats, 'p1', { direction: -1, steps: 2 }), 'p3');
});

test('下一参与者排除不合格席位且允许当前席位已不合格', () => {
  const eligible = new Set(['p1', 'p3']);
  const isEligible = (playerId: string): boolean => eligible.has(playerId);

  assert.equal(nextTurnParticipant(seats, 'p1', { isEligible }), 'p3');
  assert.equal(nextTurnParticipant(seats, 'p2', { isEligible }), 'p3');
  assert.equal(nextTurnParticipant(seats, 'p3', { isEligible }), 'p1');
  assert.equal(nextTurnParticipant(seats, 'p1', { steps: 2, isEligible }), 'p1');
});

test('固定顺序从指定合格参与者开始旋转并过滤不可行动者', () => {
  const eligible = new Set(['p1', 'p3', 'p4']);
  const rotated = rotateTurnOrder(seats, 'p3', {
    isEligible: (playerId) => eligible.has(playerId),
  });

  assert.deepEqual(rotated, ['p3', 'p4', 'p1']);
  assert.deepEqual(seats, ['p1', 'p2', 'p3', 'p4']);
});

test('固定顺序拒绝从不合格参与者开始', () => {
  assert.throws(
    () => rotateTurnOrder(seats, 'p2', { isEligible: (playerId) => playerId !== 'p2' }),
    /起始参与者不在合格集合中/,
  );
});

test('轮转拒绝空顺序、重复参与者和未知当前参与者', () => {
  assert.throws(() => nextTurnParticipant([], 'p1'), /参与者顺序不能为空/);
  assert.throws(() => nextTurnParticipant(['p1', 'p1'], 'p1'), /参与者顺序不能重复/);
  assert.throws(() => nextTurnParticipant(seats, 'missing'), /当前参与者不在顺序中/);
  assert.throws(() => rotateTurnOrder(seats, 'missing'), /起始参与者不在顺序中/);
});

test('轮转拒绝无合格参与者、非法方向和非法步数', () => {
  assert.throws(
    () => nextTurnParticipant(seats, 'p1', { isEligible: () => false }),
    /没有合格参与者/,
  );
  assert.throws(
    () => rotateTurnOrder(seats, 'p1', { isEligible: () => false }),
    /没有合格参与者/,
  );
  assert.throws(
    () => nextTurnParticipant(seats, 'p1', { direction: 0 as TurnDirection }),
    /方向必须是 1 或 -1/,
  );
  for (const steps of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(
      () => nextTurnParticipant(seats, 'p1', { steps }),
      /步数必须是正安全整数/,
      String(steps),
    );
  }
});
