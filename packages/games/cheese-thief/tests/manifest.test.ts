import test from 'node:test';
import assert from 'node:assert/strict';
import { CHEESE_THIEF_MANIFEST } from '../shared/manifest.ts';
import { cheeseThiefModule, CHEESE_THIEF_VERSIONED_IDENTITY } from '../server/index.ts';

test('奶酪大盗 manifest shape 与模块身份一致', () => {
  assert.equal(CHEESE_THIEF_MANIFEST.id, 'cheese-thief');
  assert.equal(CHEESE_THIEF_MANIFEST.displayName, '奶酪大盗');
  assert.equal(CHEESE_THIEF_MANIFEST.minPlayers, 4);
  assert.equal(CHEESE_THIEF_MANIFEST.maxPlayers, 8);
  assert.equal(CHEESE_THIEF_MANIFEST.stateSchemaVersion, 1);
  assert.deepEqual(CHEESE_THIEF_MANIFEST.rulesets, ['cheese_thief_classic_v1']);
  assert.equal(cheeseThiefModule.manifest.id, 'cheese-thief');
  assert.equal(cheeseThiefModule.identity.rulesetId, 'cheese_thief_classic_v1');
  assert.equal(cheeseThiefModule.identity.engineContractVersion, 2);
  assert.equal(cheeseThiefModule.identity.viewVersion, 1);
  assert.deepEqual(CHEESE_THIEF_VERSIONED_IDENTITY, {
    engineContractVersion: 2,
    rulesetId: 'cheese_thief_classic_v1',
    viewVersion: 1,
  });
  assert.deepEqual(cheeseThiefModule.registeredRulesets, ['cheese_thief_classic_v1']);
  assert.equal(cheeseThiefModule.defaultRulesetId, 'cheese_thief_classic_v1');
});
