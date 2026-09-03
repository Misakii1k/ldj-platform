import assert from 'node:assert/strict';
import test from 'node:test';
import type { GameContext } from '@ldj/shared';
import { deterministicContext, versionedContractAssertions } from '../../../shared/tests/helpers/versionedGameContract.ts';
import { nightTestimonyModule } from '../server/module.ts';
import { NIGHT_TESTIMONY_MANIFEST } from '../shared/manifest.ts';

const players = ['a', 'b', 'c', 'd'];
const actor = (playerId: string) => ({ kind: 'player' as const, playerId });
const sys = { kind: 'system' as const, source: 'timer' as const };
const config = { rulesetId: 'night_testimony_v1' };

function initial(ctx: GameContext = deterministicContext()) {
  return nightTestimonyModule.createInitialState(ctx, players, nightTestimonyModule.parseConfig(config));
}

/** 派发一步并返回 nextState；失败即抛出 */
function next(ctx: GameContext, state: ReturnType<typeof initial>, actor: unknown, action: unknown) {
  const result = nightTestimonyModule.reduce(ctx, state, actor as never, action as never);
  if (!result.ok) throw new Error(result.message);
  return result.nextState;
}

test('囚徒之夜 V2 identity、初始状态与视图 schema 通过通用契约', () => {
  const ctx = deterministicContext();
  versionedContractAssertions.identity(nightTestimonyModule);
  versionedContractAssertions.initial(nightTestimonyModule, ctx, players, config);
  versionedContractAssertions.viewSchemas(nightTestimonyModule, initial(), players);
});

test('囚徒之夜 reducer 纯、确定且拒绝 actor 冒充动作玩家', () => {
  const ctx = deterministicContext();
  const state = initial(ctx);
  const action = { type: 'cast_vote' as const, playerId: 'a', targetPlayerId: 'b' };
  versionedContractAssertions.pure(nightTestimonyModule, ctx, state, actor('a'), action);
  versionedContractAssertions.deterministic(nightTestimonyModule, ctx, state, actor('a'), action);
  versionedContractAssertions.rejectedDoesNotAdvance(nightTestimonyModule, ctx, state, actor('b'), action);
});

test('囚徒之夜 玩家动作只能由玩家发起，系统动作只能由系统发起', () => {
  const ctx = deterministicContext();
  const state = initial(ctx);
  assert.equal(
    nightTestimonyModule.reduce(ctx, state, sys, { type: 'pick_question_card', playerId: 'a', cardId: 'nt_q01' }).ok,
    false,
    '系统不能代玩家出题',
  );
  assert.equal(
    nightTestimonyModule.reduce(ctx, state, actor('a'), { type: 'begin' }).ok,
    false,
    '玩家不能触发 begin',
  );
});

test('囚徒之夜 完整局：问答 → 投票 → 结算出结果', () => {
  const ctx = deterministicContext();
  const state = initial(ctx);
  let s = next(ctx, state, sys, { type: 'begin' });

  // 3 轮广播问答
  for (let q = 1; q <= 3; q += 1) {
    const qer = s.currentQuestionerId;
    s = next(ctx, s, actor(qer), { type: 'pick_question_card', playerId: qer, cardId: s.pendingCardChoices![0]!.id });
    for (const id of players) {
      s = next(ctx, s, actor(id), { type: 'answer_question', playerId: id, answer: 'yes' });
    }
  }

  assert.equal(s.phase, 'vote', '3 轮全员答是应进入投票');
  for (const id of players) {
    const target = players.find((p) => p !== id)!;
    s = next(ctx, s, actor(id), { type: 'cast_vote', playerId: id, targetPlayerId: target });
  }
  assert.equal(s.phase, 'game_over');
  assert.ok(s.winners.length > 0 || s.guessingInProgress === true, '终局应产出胜负或猜罪');
});

test('囚徒之夜 终局前不泄漏狱警与罪行，终局披露完整真相', () => {
  const ctx = deterministicContext();
  const state = initial(ctx);
  const spectatorPre = JSON.stringify(nightTestimonyModule.getSpectatorView(state));
  for (const key of ['wardenId', 'crimes', 'isWarden']) {
    assert.equal(spectatorPre.includes(key), false, `观战视角不得含 ${key}`);
  }
  for (const id of players) {
    const view = nightTestimonyModule.getPlayerView(state, id);
    const me = view.me;
    assert.ok(me, `${id} 应有本人视角`);
    assert.equal(typeof me?.isWarden, 'boolean');
    assert.equal(me?.isWarden ? me.crime === null : typeof me.crime === 'string', true);
    assert.equal(JSON.stringify(view).includes('wardenId'), false, '玩家视图不得含狱警全表');
  }

  // 狱警自曝直通终局
  let s = next(ctx, state, sys, { type: 'begin' });
  s = next(ctx, s, actor(s.wardenId), { type: 'self_expose', playerId: s.wardenId });
  assert.equal(s.phase, 'game_over');
  assert.equal(s.guessingInProgress, true);
});

test('囚徒之夜 模块身份、manifest 与规则集声明一致', () => {
  assert.equal(nightTestimonyModule.manifest.id, 'night-testimony');
  assert.equal(nightTestimonyModule.identity.rulesetId, nightTestimonyModule.defaultRulesetId);
  assert.deepEqual(nightTestimonyModule.registeredRulesets, NIGHT_TESTIMONY_MANIFEST.rulesets);
  assert.equal(nightTestimonyModule.manifest.stateSchemaVersion, 1);
});

test('囚徒之夜 玩家退出（系统动作）→ 系统可投递、玩家不可冒充', () => {
  const ctx = deterministicContext();
  const state = initial(ctx);
  const forfeit = nightTestimonyModule.reduce(ctx, state, sys, { type: 'player_forfeited', playerIds: ['a', 'b', 'c'] });
  assert.equal(forfeit.ok, true, '系统应能投递 player_forfeited');
  if (!forfeit.ok) return;
  const s = forfeit.nextState;
  if (s.players.length < 2 || !s.players.includes(s.wardenId)) {
    assert.equal(s.phase, 'game_over');
    assert.ok(s.winners.length > 0);
  }
  assert.equal(
    nightTestimonyModule.reduce(ctx, state, actor('a'), { type: 'player_forfeited', playerIds: ['b'] }).ok,
    false,
    '玩家不能投递 player_forfeited',
  );
});
