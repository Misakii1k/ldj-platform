import test from 'node:test';
import assert from 'node:assert/strict';
import { NIGHT_TESTIMONY_MANIFEST } from '../shared/manifest.ts';
import { nightTestimonyModule, NIGHT_TESTIMONY_VERSIONED_IDENTITY } from '../server/index.ts';

test('囚徒之夜 manifest shape 与模块身份一致', () => {
  assert.equal(NIGHT_TESTIMONY_MANIFEST.id, 'night-testimony');
  assert.equal(NIGHT_TESTIMONY_MANIFEST.displayName, '囚徒之夜');
  assert.equal(NIGHT_TESTIMONY_MANIFEST.minPlayers, 3);
  assert.equal(NIGHT_TESTIMONY_MANIFEST.maxPlayers, 6);
  assert.equal(NIGHT_TESTIMONY_MANIFEST.stateSchemaVersion, 1);
  assert.deepEqual(NIGHT_TESTIMONY_MANIFEST.rulesets, ['night_testimony_v1']);
  assert.equal(nightTestimonyModule.manifest.id, 'night-testimony');
  assert.equal(nightTestimonyModule.identity.rulesetId, 'night_testimony_v1');
  assert.equal(nightTestimonyModule.identity.engineContractVersion, 2);
  assert.equal(nightTestimonyModule.identity.viewVersion, 1);
  assert.deepEqual(NIGHT_TESTIMONY_VERSIONED_IDENTITY, {
    engineContractVersion: 2,
    rulesetId: 'night_testimony_v1',
    viewVersion: 1,
  });
  assert.deepEqual(nightTestimonyModule.registeredRulesets, ['night_testimony_v1']);
  assert.equal(nightTestimonyModule.defaultRulesetId, 'night_testimony_v1');
});
