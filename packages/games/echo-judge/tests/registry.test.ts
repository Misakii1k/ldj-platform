/**
 * G2-B：注册一致性（模块级）。
 * 平台目录（GAME_CATALOG）与服务端注册表（registry）的接线断言随集成阶段补齐。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ECHO_JUDGE_MANIFEST } from '../shared/manifest.ts';
import { echoJudgeModule } from '../server/module.ts';

test('伪人测试 模块级注册一致性：manifest/identity/rulesets 互恰', () => {
  assert.equal(echoJudgeModule.manifest.id, 'echo-judge');
  assert.equal(echoJudgeModule.identity.rulesetId, 'echo_judge_v1');
  assert.equal(echoJudgeModule.identity.rulesetId, echoJudgeModule.defaultRulesetId);
  assert.deepEqual(echoJudgeModule.registeredRulesets, ['echo_judge_v1']);
  assert.deepEqual(echoJudgeModule.registeredRulesets, ECHO_JUDGE_MANIFEST.rulesets);
  assert.equal(ECHO_JUDGE_MANIFEST.minPlayers, 3);
  assert.equal(ECHO_JUDGE_MANIFEST.maxPlayers, 12);
});
