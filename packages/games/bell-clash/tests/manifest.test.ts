import test from 'node:test';
import assert from 'node:assert/strict';
import { BELL_CLASH_MANIFEST } from '../shared/manifest.ts';
import { bellClashModule, BELL_CLASH_VERSIONED_IDENTITY } from '../server/index.ts';

test('Ding manifest shape 与模块身份一致', () => {
  assert.equal(BELL_CLASH_MANIFEST.id, 'bell-clash');
  assert.equal(BELL_CLASH_MANIFEST.displayName, '铃铛对决');
  assert.equal(BELL_CLASH_MANIFEST.minPlayers, 2);
  assert.equal(BELL_CLASH_MANIFEST.maxPlayers, 7);
  assert.equal(BELL_CLASH_MANIFEST.stateSchemaVersion, 1);
  assert.deepEqual(BELL_CLASH_MANIFEST.rulesets, ['bell_clash_v1']);
  assert.equal(bellClashModule.manifest.id, 'bell-clash');
  assert.equal(bellClashModule.identity.rulesetId, 'bell_clash_v1');
  assert.equal(bellClashModule.identity.engineContractVersion, 2);
  assert.equal(bellClashModule.identity.viewVersion, 1);
  assert.deepEqual(BELL_CLASH_VERSIONED_IDENTITY, {
    engineContractVersion: 2,
    rulesetId: 'bell_clash_v1',
    viewVersion: 1,
  });
  assert.deepEqual(bellClashModule.registeredRulesets, ['bell_clash_v1']);
  assert.equal(bellClashModule.defaultRulesetId, 'bell_clash_v1');
});
