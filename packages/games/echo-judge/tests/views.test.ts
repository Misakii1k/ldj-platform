import test from 'node:test';
import assert from 'node:assert/strict';
import { deterministicContext } from '../../../shared/tests/helpers/versionedGameContract.ts';
import { echoJudgeModule } from '../server/module.ts';
import { createEchoJudgeState, reduceEchoJudgeState } from '../server/rules.ts';
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

/** T0：驱动一轮完整流程到指定状态的工具 */
const NOW = 1_700_000_000_000;
function driveToJudgment() {
  // a 判官；b 伪人；c/d 人类
  let state = deterministic();
  state = reduce(state, { type: 'pick_topic_card', playerId: 'a', cardId: state.pendingTopicChoices![0]!.id });
  // b/c/d 依次发言完毕 → 进入审判
  state = reduce(state, { type: 'finish_speaking', playerId: 'b' });
  state = reduce(state, { type: 'finish_speaking', playerId: 'c' });
  state = reduce(state, { type: 'finish_speaking', playerId: 'd' });
  assert.equal(state.phase, 'judgment');
  return state;
}
function reduce(state: EchoJudgeState, action: unknown) {
  const result = reduceEchoJudgeState(state, action, { now: NOW });
  if (!result.ok) throw new Error(result.message);
  return result.nextState;
}

test('T0 中途宣判：accuse 后下一帧（judge_setup）视图带本轮 lastVerdict 且不含暗号/身份', () => {
  let state = driveToJudgment();
  // 进入审判时上轮残留已清空
  assert.deepEqual(state.caughtImpostors, []);
  assert.deepEqual(state.escapedImpostors, []);
  assert.deepEqual(state.wrongAccusations, []);
  // 审判长 a 指认 b（伪人，抓对）与 c（人类，冤枉）
  state = reduce(state, { type: 'accuse', playerId: 'a', targetPlayerIds: ['b', 'c'] });
  // 中途轮次：accuse 后立刻进入下一轮立案
  assert.equal(state.phase, 'judge_setup');
  assert.equal(state.round, 2);

  const verdict = state.lastVerdict;
  assert.ok(verdict, '宣判后必须有 lastVerdict');
  assert.equal(verdict.round, 1);
  assert.equal(verdict.judgeId, 'a');
  assert.deepEqual(verdict.accusations, ['b', 'c']);
  assert.deepEqual(verdict.caught, ['b']);
  assert.deepEqual(verdict.wrong, ['c']);
  assert.deepEqual(verdict.escaped, []);
  // 与 settleRound 计分一致：判官抓对 +1 冤枉 -1 → 0；被抓伪人 b -1
  assert.equal(verdict.scoreDelta['a'], 0);
  assert.equal(verdict.scoreDelta['b'], -1);
  assert.equal(state.scores['b'], -1);

  // 下一帧公开视图：三种视角都带本轮 lastVerdict
  for (const id of players) {
    const view = echoJudgeModule.getPlayerView(state, id);
    assert.deepEqual(echoJudgeModule.parsePlayerView(view).lastVerdict, verdict);
  }
  const spectator = echoJudgeModule.getSpectatorView(state);
  assert.deepEqual(echoJudgeModule.parseSpectatorView(spectator).lastVerdict, verdict);
  // 隐私：lastVerdict 不含触发词与身份字段；中途视图整体仍不泄露暗号
  const json = JSON.stringify(spectator);
  assert.equal(json.includes('triggerWords'), false);
  assert.equal(json.includes('月亮'), false);
  assert.equal(json.includes('roles'), false);
});

test('T0 进入审判时 caughtImpostors 为空数组（修掉「晚一轮」），开局 lastVerdict 为 null', () => {
  const fresh = deterministic();
  assert.equal(fresh.lastVerdict, null);
  assert.equal(echoJudgeModule.getPlayerView(fresh, 'a').lastVerdict, null);

  const state = driveToJudgment();
  const judgeView = echoJudgeModule.getPlayerView(state, 'a');
  assert.deepEqual(judgeView.caughtImpostors, [], '审判阶段不得显示上一轮抓获名单');
  assert.deepEqual(judgeView.escapedImpostors, []);
  // 宣判前 lastVerdict 仍是上一轮的（本局第一轮为 null）
  assert.equal(judgeView.lastVerdict, null);
});
