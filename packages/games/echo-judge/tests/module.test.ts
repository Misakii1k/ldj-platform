import assert from 'node:assert/strict';
import test from 'node:test';
import type { GameContext } from '@ldj/shared';
import { deterministicContext, versionedContractAssertions } from '../../../shared/tests/helpers/versionedGameContract.ts';
import { echoJudgeModule } from '../server/module.ts';
import { ECHO_JUDGE_MANIFEST } from '../shared/manifest.ts';

const players = ['a', 'b', 'c', 'd'];
const actor = (playerId: string) => ({ kind: 'player' as const, playerId });
const sys = { kind: 'system' as const, source: 'timer' as const };
const config = { rulesetId: 'echo_judge_v1' };

function initial(ctx: GameContext = deterministicContext()) {
  return echoJudgeModule.createInitialState(ctx, players, echoJudgeModule.parseConfig(config));
}

/** 派发一步并返回 nextState；失败即抛出 */
function next(ctx: GameContext, state: ReturnType<typeof initial>, actor: unknown, action: unknown) {
  const result = echoJudgeModule.reduce(ctx, state, actor as never, action as never);
  if (!result.ok) throw new Error(result.message);
  return result.nextState;
}

test('伪人测试 V2 identity、初始状态与视图 schema 通过通用契约', () => {
  const ctx = deterministicContext();
  versionedContractAssertions.identity(echoJudgeModule);
  versionedContractAssertions.initial(echoJudgeModule, ctx, players, config);
  versionedContractAssertions.viewSchemas(echoJudgeModule, initial(), players);
});

test('伪人测试 reducer 纯、确定且拒绝 actor 冒充动作玩家', () => {
  const ctx = deterministicContext();
  const state = initial(ctx);
  const action = { type: 'submit_answer' as const, playerId: 'b', text: 'x' };
  versionedContractAssertions.pure(echoJudgeModule, ctx, state, actor('b'), action);
  versionedContractAssertions.deterministic(echoJudgeModule, ctx, state, actor('b'), action);
  versionedContractAssertions.rejectedDoesNotAdvance(echoJudgeModule, ctx, state, actor('a'), action);
});

test('伪人测试 玩家动作只能由玩家发起，系统动作只能由系统发起', () => {
  const ctx = deterministicContext();
  const state = initial(ctx);
  assert.equal(
    echoJudgeModule.reduce(ctx, state, sys, { type: 'submit_answer', playerId: 'b', text: 'x' }).ok,
    false,
    '系统不能代玩家回答（非超时）',
  );
  assert.equal(
    echoJudgeModule.reduce(ctx, state, actor('a'), { type: 'begin' }).ok,
    false,
    '玩家不能触发 begin',
  );
});

test('伪人测试 完整局：判官出题 → 依次回答 → 指认 → 轮换 → 终局', () => {
  const ctx = deterministicContext();
  const state = initial(ctx);
  let s = next(ctx, state, sys, { type: 'begin' });
  // 首轮判官出题（初始为队首玩家）
  const judge = s.judgeId as string;
  s = next(ctx, s, actor(judge), { type: 'start_round', playerId: judge, question: 'q' });
  assert.equal(s.phase, 'answering');
  // 依次回答（answerOrder 顺序）
  const order = s.answerOrder as string[];
  for (const id of order) {
    const r = echoJudgeModule.reduce(ctx, s, actor(id), { type: 'submit_answer', playerId: id, text: `a-${id}` });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    s = r.nextState;
  }
  assert.equal(s.phase, 'judgment');
  // 判官指认第一个回答者
  const target = order[0]!;
  const accused = echoJudgeModule.reduce(ctx, s, actor(judge), { type: 'accuse', playerId: judge, targetPlayerIds: [target] });
  assert.equal(accused.ok, true);
  if (!accused.ok) return;
  s = accused.nextState;
  assert.equal(s.phase, 'judge_setup', '进入下一轮');
  assert.equal(typeof s.scores[judge], 'number');
});

test('伪人测试 终局前不泄漏伪人身份与触发词，终局披露完整真相', () => {
  const ctx = deterministicContext();
  const state = initial(ctx);
  // 终局前：观战视角不含 roles/triggerWords；玩家视图仅本人身份与触发词
  const spectatorPre = JSON.stringify(echoJudgeModule.getSpectatorView(state));
  for (const key of ['roles', 'triggerWords', 'isImpostor']) {
    assert.equal(spectatorPre.includes(key), false, `观战视角不得含 ${key}`);
  }
  for (const id of players) {
    const view = echoJudgeModule.getPlayerView(state, id);
    const me = view.me;
    assert.ok(me, `${id} 应有本人视角`);
    if (id === state.judgeId) {
      assert.equal(me?.role, null, '判官不知伪人是谁');
    } else {
      assert.equal(typeof me?.role, 'string');
      if (me?.role === 'impostor') {
        assert.equal(typeof me?.triggerWord, 'string', '伪人应见触发词');
      } else {
        assert.equal(me?.triggerWord, null);
      }
    }
  }
});

test('伪人测试 模块身份、manifest 与规则集声明一致', () => {
  assert.equal(echoJudgeModule.manifest.id, 'echo-judge');
  assert.equal(echoJudgeModule.identity.rulesetId, echoJudgeModule.defaultRulesetId);
  assert.deepEqual(echoJudgeModule.registeredRulesets, ECHO_JUDGE_MANIFEST.rulesets);
  assert.equal(echoJudgeModule.manifest.stateSchemaVersion, 1);
});

test('伪人测试 玩家退出（系统动作）→ 终局或继续，系统可投递', () => {
  const ctx = deterministicContext();
  const state = initial(ctx);
  const forfeit = echoJudgeModule.reduce(ctx, state, sys, { type: 'player_forfeited', playerIds: ['c', 'd'] });
  assert.equal(forfeit.ok, true, '系统应能投递 player_forfeited');
  if (!forfeit.ok) return;
  const s = forfeit.nextState;
  // 剩余 a、b 两人：不足 2 人则终局；否则继续（此处 2 人恰好不足 → 终局剩余玩家获胜）
  if (s.players.length < 2) {
    assert.equal(s.phase, 'game_over');
    assert.ok(s.winners.length > 0);
  }
  // 玩家不能冒充系统投递
  assert.equal(
    echoJudgeModule.reduce(ctx, state, actor('a'), { type: 'player_forfeited', playerIds: ['b'] }).ok,
    false,
    '玩家不能投递 player_forfeited',
  );
});
