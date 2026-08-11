/**
 * G2-A：注册一致性（模块级）。
 * 平台目录（GAME_CATALOG）与服务端注册表（registry）的接线断言随 G2-B 集成阶段补齐。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GOOSE_RELAY_MANIFEST } from '../shared/manifest.ts';
import { gooseRelayModule } from '../server/module.ts';

test('以鹅传鹅 模块级注册一致性：manifest/identity/rulesets 互恰', () => {
  assert.equal(gooseRelayModule.manifest.id, 'goose-relay');
  assert.equal(gooseRelayModule.identity.rulesetId, 'goose_relay_classic_v1');
  assert.equal(gooseRelayModule.identity.rulesetId, gooseRelayModule.defaultRulesetId);
  assert.deepEqual(gooseRelayModule.registeredRulesets, ['goose_relay_classic_v1']);
  assert.deepEqual(gooseRelayModule.registeredRulesets, GOOSE_RELAY_MANIFEST.rulesets);
  assert.equal(GOOSE_RELAY_MANIFEST.minPlayers, 5);
  assert.equal(GOOSE_RELAY_MANIFEST.maxPlayers, 9);
});
