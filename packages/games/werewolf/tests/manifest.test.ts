import test from 'node:test';
import assert from 'node:assert/strict';
import { WEREWOLF_MANIFEST } from '../shared/manifest.ts';

test('狼人杀 manifest shape', () => {
  assert.equal(WEREWOLF_MANIFEST.id, 'werewolf');
  assert.equal(WEREWOLF_MANIFEST.displayName, '狼人杀');
  assert.equal(WEREWOLF_MANIFEST.stateSchemaVersion, 1);
});
