import test from 'node:test';
import assert from 'node:assert/strict';
import { GOOSE_RELAY_MANIFEST } from '../shared/manifest.ts';
import { gooseRelayModule, GOOSE_RELAY_VERSIONED_IDENTITY } from '../server/index.ts';

test('以鹅传鹅 manifest shape 与模块身份一致', () => {
  assert.equal(GOOSE_RELAY_MANIFEST.id, 'goose-relay');
  assert.equal(GOOSE_RELAY_MANIFEST.displayName, '以鹅传鹅');
  assert.equal(GOOSE_RELAY_MANIFEST.minPlayers, 5);
  assert.equal(GOOSE_RELAY_MANIFEST.maxPlayers, 9);
  assert.equal(GOOSE_RELAY_MANIFEST.stateSchemaVersion, 2);
  assert.deepEqual(GOOSE_RELAY_MANIFEST.rulesets, ['goose_relay_classic_v1']);
  assert.equal(gooseRelayModule.manifest.id, 'goose-relay');
  assert.equal(gooseRelayModule.identity.rulesetId, 'goose_relay_classic_v1');
  assert.equal(gooseRelayModule.identity.engineContractVersion, 2);
  assert.equal(gooseRelayModule.identity.viewVersion, 2);
  assert.deepEqual(GOOSE_RELAY_VERSIONED_IDENTITY, {
    engineContractVersion: 2,
    rulesetId: 'goose_relay_classic_v1',
    viewVersion: 2,
  });
  assert.deepEqual(gooseRelayModule.registeredRulesets, ['goose_relay_classic_v1']);
  assert.equal(gooseRelayModule.defaultRulesetId, 'goose_relay_classic_v1');
});
