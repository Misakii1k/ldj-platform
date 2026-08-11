/**
 * G2-A：注册一致性（模块级）。
 * 平台目录（GAME_CATALOG）与服务端注册表（registry）的接线断言随 G2-B 集成阶段补齐。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHEESE_THIEF_MANIFEST } from '../shared/manifest.ts';
import { cheeseThiefModule } from '../server/module.ts';

test('奶酪大盗 模块级注册一致性：manifest/identity/rulesets 互恰', () => {
  assert.equal(cheeseThiefModule.manifest.id, 'cheese-thief');
  assert.equal(cheeseThiefModule.identity.rulesetId, 'cheese_thief_classic_v1');
  assert.equal(cheeseThiefModule.identity.rulesetId, cheeseThiefModule.defaultRulesetId);
  assert.deepEqual(cheeseThiefModule.registeredRulesets, ['cheese_thief_classic_v1']);
  assert.deepEqual(cheeseThiefModule.registeredRulesets, CHEESE_THIEF_MANIFEST.rulesets);
  assert.equal(CHEESE_THIEF_MANIFEST.minPlayers, 4);
  assert.equal(CHEESE_THIEF_MANIFEST.maxPlayers, 8);
});
