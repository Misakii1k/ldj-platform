/**
 * G2-B：注册一致性（模块级）。
 * 平台目录（GAME_CATALOG）与服务端注册表（registry）的接线断言随集成阶段补齐。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NIGHT_TESTIMONY_MANIFEST } from '../shared/manifest.ts';
import { nightTestimonyModule } from '../server/module.ts';

test('囚徒之夜 模块级注册一致性：manifest/identity/rulesets 互恰', () => {
  assert.equal(nightTestimonyModule.manifest.id, 'night-testimony');
  assert.equal(nightTestimonyModule.identity.rulesetId, 'night_testimony_v1');
  assert.equal(nightTestimonyModule.identity.rulesetId, nightTestimonyModule.defaultRulesetId);
  assert.deepEqual(nightTestimonyModule.registeredRulesets, ['night_testimony_v1']);
  assert.deepEqual(nightTestimonyModule.registeredRulesets, NIGHT_TESTIMONY_MANIFEST.rulesets);
  assert.equal(NIGHT_TESTIMONY_MANIFEST.minPlayers, 3);
  assert.equal(NIGHT_TESTIMONY_MANIFEST.maxPlayers, 6);
});
