import test from 'node:test';
import assert from 'node:assert/strict';
import { ECHO_JUDGE_MANIFEST } from '../shared/manifest.ts';
import { echoJudgeModule, ECHO_JUDGE_VERSIONED_IDENTITY } from '../server/index.ts';

test('伪人测试 manifest shape 与模块身份一致', () => {
  assert.equal(ECHO_JUDGE_MANIFEST.id, 'echo-judge');
  assert.equal(ECHO_JUDGE_MANIFEST.displayName, '伪人测试');
  assert.equal(ECHO_JUDGE_MANIFEST.minPlayers, 3);
  assert.equal(ECHO_JUDGE_MANIFEST.maxPlayers, 12);
  assert.equal(ECHO_JUDGE_MANIFEST.stateSchemaVersion, 1);
  assert.deepEqual(ECHO_JUDGE_MANIFEST.rulesets, ['echo_judge_v1']);
  assert.equal(echoJudgeModule.manifest.id, 'echo-judge');
  assert.equal(echoJudgeModule.identity.rulesetId, 'echo_judge_v1');
  assert.equal(echoJudgeModule.identity.engineContractVersion, 2);
  assert.equal(echoJudgeModule.identity.viewVersion, 1);
  assert.deepEqual(ECHO_JUDGE_VERSIONED_IDENTITY, {
    engineContractVersion: 2,
    rulesetId: 'echo_judge_v1',
    viewVersion: 1,
  });
  assert.deepEqual(echoJudgeModule.registeredRulesets, ['echo_judge_v1']);
  assert.equal(echoJudgeModule.defaultRulesetId, 'echo_judge_v1');
});
