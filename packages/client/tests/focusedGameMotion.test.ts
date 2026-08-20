import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBlankPhaseKey } from '../src/game/undercover/motion.ts';
import { buildWerewolfPhaseKey } from '../src/game/werewolf/motion.ts';

test('狼人杀阶段键忽略重复快照中的非阶段字段', () => {
  const first = buildWerewolfPhaseKey({ phase: 'discussion', dayLabel: '第 2 天' });
  const repeatedSnapshot = buildWerewolfPhaseKey({ phase: 'discussion', dayLabel: '第 2 天' });

  assert.equal(first, repeatedSnapshot);
  assert.notEqual(first, buildWerewolfPhaseKey({ phase: 'voting', dayLabel: '第 2 天' }));
  assert.notEqual(first, buildWerewolfPhaseKey({ phase: 'discussion', dayLabel: '第 3 天' }));
});

test('谁是卧底阶段键只随轮次或阶段推进', () => {
  const speaking = buildBlankPhaseKey({ phase: 'speaking', round: 3 });
  const repeatedSnapshot = buildBlankPhaseKey({ phase: 'speaking', round: 3 });

  assert.equal(speaking, repeatedSnapshot);
  assert.notEqual(speaking, buildBlankPhaseKey({ phase: 'voting', round: 3 }));
  assert.notEqual(speaking, buildBlankPhaseKey({ phase: 'speaking', round: 4 }));
});
