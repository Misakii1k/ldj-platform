import test from 'node:test';
import assert from 'node:assert/strict';
import { deterministicContext } from '../../../shared/tests/helpers/versionedGameContract.ts';
import { echoJudgeModule } from '../server/module.ts';
import { createEchoJudgeState } from '../server/rules.ts';
import type { EchoJudgeState } from '../server/types.ts';

const players = ['a', 'b', 'c', 'd'];

function initial() {
  const ctx = deterministicContext();
  return echoJudgeModule.createInitialState(ctx, players, echoJudgeModule.parseConfig({ rulesetId: 'echo_judge_v1' }));
}

/** 确定性状态：a 判官，b 伪人 */
function deterministic(): EchoJudgeState {
  return createEchoJudgeState(
    players,
    { rulesetId: 'echo_judge_v1' },
    'a',
    '',
    { a: 'human', b: 'impostor', c: 'human', d: 'human' },
    { b: '月亮' },
  );
}

test('伪人测试 视图严格解析：build→parse 往返一致', () => {
  const state = initial();
  for (const id of players) {
    const view = echoJudgeModule.getPlayerView(state, id);
    assert.deepEqual(echoJudgeModule.parsePlayerView(view), view);
    assert.equal(view.me?.playerId, id);
  }
  const spectator = echoJudgeModule.getSpectatorView(state);
  assert.deepEqual(echoJudgeModule.parseSpectatorView(spectator), spectator);
  assert.equal('me' in spectator, false);
});

test('伪人测试 终局前私密信息不进视图：roles/triggerWords 不外泄', () => {
  const state = deterministic();
  const spectatorJson = JSON.stringify(echoJudgeModule.getSpectatorView(state));
  for (const key of ['roles', 'triggerWords', 'isImpostor']) {
    assert.equal(spectatorJson.includes(key), false, `观战视角不得含 ${key}`);
  }
  // 判官视角：role 为 null（不知伪人）；b（伪人）见触发词；c（人类）不见
  const a = echoJudgeModule.getPlayerView(state, 'a');
  assert.equal(a.me?.role, null, '判官不知伪人');
  const b = echoJudgeModule.getPlayerView(state, 'b');
  assert.equal(b.me?.role, 'impostor');
  assert.equal(b.me?.triggerWord, '月亮');
  const c = echoJudgeModule.getPlayerView(state, 'c');
  assert.equal(c.me?.role, 'human');
  assert.equal(c.me?.triggerWord, null);
  // b 的触发词不应出现在 a/c 的视角
  const aJson = JSON.stringify(a);
  const cJson = JSON.stringify(c);
  assert.equal(aJson.includes('月亮'), false);
  assert.equal(cJson.includes('月亮'), false);
});

test('伪人测试 视图严格解析：多余字段拒绝且提示字段无效', () => {
  const state = initial();
  const playerView = echoJudgeModule.getPlayerView(state, 'a') as unknown as Record<string, unknown>;
  assert.throws(() => echoJudgeModule.parsePlayerView({ ...playerView, roles: {} }), /字段无效/);
  const spectator = echoJudgeModule.getSpectatorView(state) as unknown as Record<string, unknown>;
  assert.throws(() => echoJudgeModule.parseSpectatorView({ ...spectator, triggerWords: {} }), /字段无效/);
});

test('伪人测试 非参局观察者没有本人视角', () => {
  const view = echoJudgeModule.getPlayerView(initial(), 'outsider');
  assert.equal(view.me, null);
  assert.deepEqual(echoJudgeModule.parsePlayerView(view), view);
});
