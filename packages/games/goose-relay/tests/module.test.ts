import assert from 'node:assert/strict';
import test from 'node:test';
import type { GameContext } from '@ldj/shared';
import { deterministicContext, versionedContractAssertions } from '../../../shared/tests/helpers/versionedGameContract.ts';
import { gooseRelayModule } from '../server/module.ts';
import { GOOSE_RELAY_MANIFEST } from '../shared/manifest.ts';
import type { CaseCard } from '../server/types.ts';

const players = ['a', 'b', 'c', 'd', 'e'];
const actor = (playerId: string) => ({ kind: 'player' as const, playerId });
const sys = { kind: 'system' as const, source: 'timer' as const };
const config = { rulesetId: 'goose_relay_classic_v1' };

const CARD_A: CaseCard = { murderer: 'grey_goose', victim: 'white_goose', tool: 'knife', scene: 'barn' };
const CARD_B: CaseCard = { murderer: 'brown_goose', victim: 'black_goose', tool: 'rope', scene: 'pond' };

function initial(ctx: GameContext = deterministicContext()) {
  return gooseRelayModule.createInitialState(ctx, players, gooseRelayModule.parseConfig(config));
}

/** 派发一步并返回 nextState；失败即抛出 */
function next(ctx: GameContext, state: ReturnType<typeof initial>, actor: unknown, action: unknown) {
  const result = gooseRelayModule.reduce(ctx, state, actor as never, action as never);
  if (!result.ok) throw new Error(result.message);
  return result.nextState;
}

/** 全员按序传递给定案情 */
function relayAll(ctx: GameContext, state: ReturnType<typeof initial>, cases: CaseCard[]) {
  let s = state;
  s = next(ctx, s, sys, { type: 'begin' });
  for (let i = 0; i < cases.length; i += 1) {
    s = next(ctx, s, actor(players[i]!), {
      type: 'transmit',
      playerId: players[i]!,
      case: cases[i]!,
    });
  }
  assert.equal(s.phase, 'discussion');
  return s;
}

test('以鹅传鹅 V2 identity、初始状态与视图 schema 通过通用契约', () => {
  const ctx = deterministicContext();
  versionedContractAssertions.identity(gooseRelayModule);
  versionedContractAssertions.initial(gooseRelayModule, ctx, players, config);
  versionedContractAssertions.viewSchemas(gooseRelayModule, initial(), players);
});

test('以鹅传鹅 reducer 纯、确定且拒绝 actor 冒充动作玩家', () => {
  const ctx = deterministicContext();
  const state = initial(ctx);
  const action = { type: 'transmit' as const, playerId: 'a', case: CARD_A };
  versionedContractAssertions.pure(gooseRelayModule, ctx, state, actor('a'), action);
  versionedContractAssertions.deterministic(gooseRelayModule, ctx, state, actor('a'), action);
  versionedContractAssertions.rejectedDoesNotAdvance(gooseRelayModule, ctx, state, actor('b'), action);
});

test('以鹅传鹅 玩家动作只能由玩家发起，系统动作只能由系统发起', () => {
  const ctx = deterministicContext();
  const state = initial(ctx);
  assert.equal(
    gooseRelayModule.reduce(ctx, state, sys, { type: 'transmit', playerId: 'a', case: CARD_A }).ok,
    false,
    '系统不能代传案情',
  );
  assert.equal(
    gooseRelayModule.reduce(ctx, state, actor('a'), { type: 'end_discussion' }).ok,
    false,
    '玩家不能结束讨论',
  );
  assert.equal(
    gooseRelayModule.reduce(ctx, state, sys, { type: 'accuse', playerId: 'e', murderer: 'grey_goose', victim: 'white_goose' }).ok,
    false,
    '系统不能代玩家指认',
  );
});

test('以鹅传鹅 完整局：传递 → 讨论 → 末位指对 → 投票 → 结算出结果', () => {
  const ctx = deterministicContext();
  const state = initial(ctx);
  let s = relayAll(ctx, state, [CARD_A, CARD_A, CARD_B, CARD_A, CARD_B]);
  s = next(ctx, s, sys, { type: 'end_discussion' });
  assert.equal(s.phase, 'accusation', '讨论后进入指认');
  assert.equal(s.currentAccuserIndex, 4, '从末位开始指认');
  // 无论随机案情是什么，让 e 按原始凶手/被害人指认（读状态构造），保证指对
  const correctGuess = { murderer: s.case.murderer, victim: s.case.victim };
  s = next(ctx, s, actor('e'), {
    type: 'accuse',
    playerId: 'e',
    murderer: correctGuess.murderer,
    victim: correctGuess.victim,
  });
  assert.equal(s.phase, 'vote', '指对后进入投票');

  for (const id of players) {
    const target = players.find((p) => p !== id)!;
    s = next(ctx, s, actor(id), {
      type: 'cast_vote',
      playerId: id,
      targetPlayerId: target,
    });
  }
  assert.equal(s.phase, 'game_over', '全员投票后应结算');
  assert.equal(typeof s.caseMatched, 'boolean');
  assert.equal(typeof s.evilIdentified, 'boolean');
  assert.ok(s.winners.length > 0);
});

test('以鹅传鹅 指认全部未中 → 恶鹅胜（终局披露完整真相）', () => {
  const ctx = deterministicContext();
  let s = relayAll(ctx, initial(ctx), [CARD_A, CARD_A, CARD_A, CARD_A, CARD_A]);
  s = next(ctx, s, sys, { type: 'end_discussion' });
  // 全部按错误凶手/被害人指认（用与原始不同的角色池保证不中）
  const wrongMurderer = s.case.murderer === 'brown_goose' ? 'grey_goose' : 'brown_goose';
  const wrongVictim = s.case.victim === 'black_goose' ? 'white_goose' : 'black_goose';
  for (let i = 4; i >= 0; i -= 1) {
    s = next(ctx, s, actor(players[i]!), {
      type: 'accuse',
      playerId: players[i]!,
      murderer: wrongMurderer,
      victim: wrongVictim,
    });
  }
  assert.equal(s.phase, 'game_over');
  assert.equal(s.caseMatched, false);
  assert.deepEqual(s.winners, [...s.evilGeese], '无人指对 → 恶鹅胜');
  const spectator = gooseRelayModule.getSpectatorView(s);
  assert.ok(spectator.reveal, '终局应披露');
  assert.equal(spectator.reveal.transmissions.length, players.length);
  assert.deepEqual(spectator.reveal.evilGeese.sort(), [...s.evilGeese].sort());
  assert.equal(spectator.reveal.caseMatched, false);
});

test('以鹅传鹅 终局返回正式结果候选且披露完整真相', () => {
  const ctx = deterministicContext();
  let s = relayAll(ctx, initial(ctx), [CARD_A, CARD_A, CARD_A, CARD_A, CARD_A]);
  s = next(ctx, s, sys, { type: 'end_discussion' });
  // 直接让末位按真实案情指对
  s = next(ctx, s, actor('e'), {
    type: 'accuse',
    playerId: 'e',
    murderer: s.case.murderer,
    victim: s.case.victim,
  });
  assert.equal(s.phase, 'vote');
  let candidate: unknown = null;
  for (const id of players) {
    const target = players.find((p) => p !== id)!;
    const result = gooseRelayModule.reduce(ctx, s, actor(id), {
      type: 'cast_vote',
      playerId: id,
      targetPlayerId: target,
    });
    if (!result.ok) throw new Error(result.message);
    s = result.nextState;
    candidate = result.resultCandidate;
  }
  assert.equal(s.phase, 'game_over');
  const spectator = gooseRelayModule.getSpectatorView(s);
  assert.ok(spectator.reveal, '终局应披露');
  assert.deepEqual(spectator.reveal.transmissions.length, players.length);
  assert.deepEqual(spectator.reveal.evilGeese.sort(), [...s.evilGeese].sort());
  assert.equal(spectator.reveal.caseMatched, s.caseMatched);
  assert.ok(candidate, '终局应产出结果候选');
  assert.equal((candidate as { winners: string[] }).winners.length > 0, true);
});

test('以鹅传鹅 模块身份、manifest 与规则集声明一致', () => {
  assert.equal(gooseRelayModule.manifest.id, 'goose-relay');
  assert.equal(gooseRelayModule.identity.rulesetId, gooseRelayModule.defaultRulesetId);
  assert.deepEqual(gooseRelayModule.registeredRulesets, GOOSE_RELAY_MANIFEST.rulesets);
  assert.equal(gooseRelayModule.manifest.stateSchemaVersion, 1);
});

test('以鹅传鹅 玩家退出（系统动作）→ 系统可投递、玩家不可冒充', () => {
  const ctx = deterministicContext();
  const state = initial(ctx);
  const forfeit = gooseRelayModule.reduce(ctx, state, sys, { type: 'player_forfeited', playerIds: ['a', 'b', 'c', 'd'] });
  assert.equal(forfeit.ok, true, '系统应能投递 player_forfeited');
  if (!forfeit.ok) return;
  const s = forfeit.nextState;
  if (s.players.length < 2) {
    assert.equal(s.phase, 'game_over');
    assert.ok(s.winners.length > 0);
  }
  assert.equal(
    gooseRelayModule.reduce(ctx, state, actor('a'), { type: 'player_forfeited', playerIds: ['b'] }).ok,
    false,
    '玩家不能投递 player_forfeited',
  );
});
