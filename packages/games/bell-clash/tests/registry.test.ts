/**
 * G2-B：注册一致性（模块级）。
 * 平台目录（GAME_CATALOG）与服务端注册表（registry）的接线断言随集成阶段补齐。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BELL_CLASH_MANIFEST } from '../shared/manifest.ts';
import { bellClashModule } from '../server/module.ts';

test('铃铛对决 模块级注册一致性：manifest/identity/rulesets 互恰', () => {
  assert.equal(bellClashModule.manifest.id, 'bell-clash');
  assert.equal(bellClashModule.identity.rulesetId, 'bell_clash_v1');
  assert.equal(bellClashModule.identity.rulesetId, bellClashModule.defaultRulesetId);
  assert.deepEqual(bellClashModule.registeredRulesets, ['bell_clash_v1']);
  assert.deepEqual(bellClashModule.registeredRulesets, BELL_CLASH_MANIFEST.rulesets);
  assert.equal(BELL_CLASH_MANIFEST.minPlayers, 2);
  assert.equal(BELL_CLASH_MANIFEST.maxPlayers, 7);
});
