import test from 'node:test';
import assert from 'node:assert/strict';
import { LOVELETTER_MANIFEST } from '../shared/manifest.ts';
import { loveLetterModule, LOVELETTER_VERSIONED_IDENTITY } from '../server/index.ts';

test('情书 manifest shape 与模块身份一致', () => {
  assert.equal(LOVELETTER_MANIFEST.id, 'loveletter');
  assert.equal(LOVELETTER_MANIFEST.displayName, '情书');
  assert.equal(LOVELETTER_MANIFEST.minPlayers, 2);
  assert.equal(LOVELETTER_MANIFEST.maxPlayers, 4);
  assert.equal(LOVELETTER_MANIFEST.stateSchemaVersion, 1);
  assert.deepEqual(LOVELETTER_MANIFEST.rulesets, ['loveletter_classic16_v1']);
  assert.equal(loveLetterModule.manifest.id, 'loveletter');
  assert.equal(loveLetterModule.identity.rulesetId, 'loveletter_classic16_v1');
  assert.equal(loveLetterModule.identity.engineContractVersion, 2);
  assert.equal(loveLetterModule.identity.viewVersion, 2);
  assert.deepEqual(LOVELETTER_VERSIONED_IDENTITY, { engineContractVersion: 2, rulesetId: 'loveletter_classic16_v1', viewVersion: 2 });
  assert.deepEqual(loveLetterModule.registeredRulesets, ['loveletter_classic16_v1']);
  assert.equal(loveLetterModule.defaultRulesetId, 'loveletter_classic16_v1');
});
