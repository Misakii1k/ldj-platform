import test from 'node:test';
import assert from 'node:assert/strict';
import { WEREWOLF_STATE_SCHEMA_VERSION, werewolfModule } from '../server/module.ts';
import { WEREWOLF_MANIFEST } from '../shared/manifest.ts';

test('werewolf manifest shape', () => {
  assert.equal(WEREWOLF_MANIFEST.id, 'werewolf');
  assert.equal(WEREWOLF_MANIFEST.displayName, '\u72fc\u4eba\u6740');
  assert.equal(WEREWOLF_MANIFEST.version, '0.4.0');
  assert.equal(WEREWOLF_MANIFEST.stateSchemaVersion, 4);
  assert.equal(WEREWOLF_MANIFEST.stateSchemaVersion, WEREWOLF_STATE_SCHEMA_VERSION);
  assert.equal(werewolfModule.manifest.stateSchemaVersion, WEREWOLF_STATE_SCHEMA_VERSION);
});
