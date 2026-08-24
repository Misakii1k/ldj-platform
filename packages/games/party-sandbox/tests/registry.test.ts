import test from 'node:test';
import assert from 'node:assert/strict';
import { PARTY_SANDBOX_MANIFEST } from '../shared/manifest.ts';
import { partySandboxModule } from '../server/module.ts';

test('创意工坊 模块级注册一致性：manifest/identity/rulesets 互恰', () => {
  assert.equal(partySandboxModule.manifest.id, PARTY_SANDBOX_MANIFEST.id);
  assert.equal(partySandboxModule.identity.rulesetId, 'party_sandbox_v1');
  assert.equal(partySandboxModule.identity.engineContractVersion, 2);
  assert.equal(partySandboxModule.identity.viewVersion, 1);
  assert.ok(partySandboxModule.registeredRulesets?.includes('party_sandbox_v1'));
});
