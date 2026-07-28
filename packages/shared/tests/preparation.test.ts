import test from 'node:test';
import assert from 'node:assert/strict';
import { GAME_PREPARATION_SPECS, getGamePreparationSpec } from '../src/game/preparation.ts';

test('new game preparation specs cover UNO, 斗地主, 狼人杀', () => {
  assert.deepEqual(GAME_PREPARATION_SPECS.map((spec) => spec.gameId), ['uno', 'landlord', 'werewolf']);
  for (const spec of GAME_PREPARATION_SPECS) {
    assert.ok(spec.ruleSteps.length >= 5);
    assert.ok(spec.actions.length >= 3);
    assert.ok(spec.uiPanels.length >= 4);
    assert.ok(spec.openSourceReferences.length >= 1);
    assert.ok(spec.nextMilestones.length >= 4);
  }
  assert.equal(getGamePreparationSpec('uno')?.displayName, 'UNO');
  assert.equal(getGamePreparationSpec('missing'), undefined);
});
