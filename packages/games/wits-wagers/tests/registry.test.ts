import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getGameModule,
  getDefaultRuleset,
  resolveRulesetForStart,
  listGameManifests,
} from '../../../../packages/server/src/core/game/registry.ts';
import { witsWagersModule } from '../server/module.ts';

test('registry: wits-wagers 模块注册与规则集解析', () => {
  const mod = getGameModule('wits-wagers', 'wits_wagers_platform_v1');
  assert.ok(mod);
  assert.equal(mod.manifest.id, 'wits-wagers');
  assert.equal(mod, witsWagersModule);

  assert.equal(getDefaultRuleset('wits-wagers'), 'wits_wagers_platform_v1');
  assert.equal(resolveRulesetForStart('wits-wagers', {}), 'wits_wagers_platform_v1');
  assert.equal(
    resolveRulesetForStart('wits-wagers', { rulesetId: 'wits_wagers_platform_v1' }),
    'wits_wagers_platform_v1',
  );

  const manifests = listGameManifests();
  const wwManifest = manifests.find((m) => m.id === 'wits-wagers');
  assert.ok(wwManifest);
  assert.equal(wwManifest.minPlayers, 3);
  assert.equal(wwManifest.maxPlayers, 7);

  // 未知规则集返回 undefined
  assert.equal(getGameModule('wits-wagers', 'unknown_ruleset'), undefined);
});
