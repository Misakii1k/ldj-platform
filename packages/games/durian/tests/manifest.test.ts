import test from 'node:test';
import assert from 'node:assert/strict';
import { DURIAN_MANIFEST } from '../shared/manifest.ts';
import { durianModule, DURIAN_VERSIONED_IDENTITY } from '../server/index.ts';

test('Durian manifest shape 与模块身份一致', () => {
  assert.equal(DURIAN_MANIFEST.id, 'durian');
  assert.equal(DURIAN_MANIFEST.displayName, 'Durian：榴莲店长');
  assert.equal(DURIAN_MANIFEST.minPlayers, 2);
  assert.equal(DURIAN_MANIFEST.maxPlayers, 7);
  assert.equal(DURIAN_MANIFEST.stateSchemaVersion, 1);
  assert.deepEqual(DURIAN_MANIFEST.rulesets, ['durian_orchard_v1']);
  assert.equal(durianModule.manifest.id, 'durian');
  assert.equal(durianModule.identity.rulesetId, 'durian_orchard_v1');
  assert.equal(durianModule.identity.engineContractVersion, 2);
  assert.equal(durianModule.identity.viewVersion, 1);
  assert.deepEqual(DURIAN_VERSIONED_IDENTITY, { engineContractVersion: 2, rulesetId: 'durian_orchard_v1', viewVersion: 1 });
  assert.deepEqual(durianModule.registeredRulesets, ['durian_orchard_v1']);
  assert.equal(durianModule.defaultRulesetId, 'durian_orchard_v1');
});
