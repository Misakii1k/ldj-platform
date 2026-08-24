import test from 'node:test';
import assert from 'node:assert/strict';
import { PARTY_SANDBOX_MANIFEST } from '../shared/manifest.ts';
import { partySandboxModule } from '../server/module.ts';

test('创意工坊 模块身份、manifest 与规则集声明一致', () => {
  assert.equal(partySandboxModule.manifest.id, PARTY_SANDBOX_MANIFEST.id);
  assert.equal(partySandboxModule.manifest.displayName, '创意工坊');
  assert.equal(partySandboxModule.identity.rulesetId, 'party_sandbox_v1');
  assert.deepEqual(partySandboxModule.registeredRulesets, ['party_sandbox_v1']);
  assert.equal(PARTY_SANDBOX_MANIFEST.rulesets.includes('party_sandbox_v1'), true);
});
