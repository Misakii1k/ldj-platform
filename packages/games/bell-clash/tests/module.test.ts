import assert from 'node:assert/strict';
import test from 'node:test';
import type { GameContext } from '@ldj/shared';
import { deterministicContext, versionedContractAssertions } from '../../../shared/tests/helpers/versionedGameContract.ts';
import { bellClashModule } from '../server/module.ts';
import { BELL_CLASH_MANIFEST } from '../shared/manifest.ts';
import type { BellClashCard } from '../server/types.ts';

const players = ['a', 'b', 'c'];
const actor = (playerId: string) => ({ kind: 'player' as const, playerId });
const sys = { kind: 'system' as const, source: 'timer' as const };
const config = { rulesetId: 'bell_clash_v1' };

function initial(ctx: GameContext = deterministicContext()) {
  return bellClashModule.createInitialState(ctx, players, bellClashModule.parseConfig(config));
}

/** 派发一步并返回 nextState；失败即抛出 */
function next(ctx: GameContext, state: ReturnType<typeof initial>, actor: unknown, action: unknown) {
  const result = bellClashModule.reduce(ctx, state, actor as never, action as never);
  if (!result.ok) throw new Error(result.message);
  return result.nextState;
}

/** 从玩家视角拿手牌，找出第一个可打出的牌（同色/同数字） */
function firstPlayable(state: ReturnType<typeof initial>, playerId: string): number {
  const view = bellClashModule.getPlayerView(state, playerId) as unknown as {
    me: { hand: BellClashCard[] } | null;
    discardTop: BellClashCard | null;
  };
  const hand = view.me?.hand ?? [];
  const top = view.discardTop;
  const index = hand.findIndex((card) => {
    if (top === null) return true;
    if (card.color === top.color) return true;
    return card.kind === 'number' && top.kind === 'number' && card.number === top.number;
  });
  return index;
}

test('铃铛对决 V2 identity、初始状态与视图 schema 通过通用契约', () => {
  const ctx = deterministicContext();
  versionedContractAssertions.identity(bellClashModule);
  versionedContractAssertions.initial(bellClashModule, ctx, players, config);
  versionedContractAssertions.viewSchemas(bellClashModule, initial(), players);
});

test('铃铛对决 reducer 纯、确定且拒绝 actor 冒充动作玩家', () => {
  const ctx = deterministicContext();
  const state = initial(ctx);
  const action = { type: 'draw_card' as const, playerId: 'a' };
  versionedContractAssertions.pure(bellClashModule, ctx, state, actor('a'), action);
  versionedContractAssertions.deterministic(bellClashModule, ctx, state, actor('a'), action);
  versionedContractAssertions.rejectedDoesNotAdvance(bellClashModule, ctx, state, actor('b'), action);
});

test('铃铛对决 玩家动作只能由玩家发起，系统动作只能由系统发起', () => {
  const ctx = deterministicContext();
  const state = initial(ctx);
  assert.equal(
    bellClashModule.reduce(ctx, state, sys, { type: 'draw_card', playerId: 'a' }).ok,
    false,
    '系统不能代玩家摸牌',
  );
  assert.equal(
    bellClashModule.reduce(ctx, state, actor('a'), { type: 'challenge_timeout' }).ok,
    false,
    '玩家不能触发系统计时器',
  );
});

test('铃铛对决 完整局：交替出牌直到有人打完手牌', () => {
  const ctx = deterministicContext();
  const state = initial(ctx);
  let s = next(ctx, state, sys, { type: 'begin' });
  for (let step = 0; step < 600; step += 1) {
    if (s.phase === 'game_over') break;
    const current = s.currentPlayerId as string;
    const playIndex = firstPlayable(s, current);
    if (playIndex >= 0) {
      const r = bellClashModule.reduce(ctx, s, actor(current), { type: 'play_card', playerId: current, cardIndex: playIndex });
      if (!r.ok) throw new Error(r.message);
      s = r.nextState;
    } else {
      const r = bellClashModule.reduce(ctx, s, actor(current), { type: 'draw_card', playerId: current });
      if (!r.ok) throw new Error(r.message);
      s = r.nextState;
    }
  }
  assert.equal(s.phase, 'game_over', '应最终有人打完手牌');
  assert.ok(s.winners.length === 1);
});

test('铃铛对决 模块身份、manifest 与规则集声明一致', () => {
  assert.equal(bellClashModule.manifest.id, 'bell-clash');
  assert.equal(bellClashModule.identity.rulesetId, bellClashModule.defaultRulesetId);
  assert.deepEqual(bellClashModule.registeredRulesets, BELL_CLASH_MANIFEST.rulesets);
  assert.equal(bellClashModule.manifest.stateSchemaVersion, 1);
});

test('铃铛对决 玩家退出（系统动作）→ 系统可投递、玩家不可冒充', () => {
  const ctx = deterministicContext();
  const state = initial(ctx);
  const forfeit = bellClashModule.reduce(ctx, state, sys, { type: 'player_forfeited', playerIds: ['a', 'b'] });
  assert.equal(forfeit.ok, true, '系统应能投递 player_forfeited');
  if (!forfeit.ok) return;
  const s = forfeit.nextState;
  if (s.players.length < 2) {
    assert.equal(s.phase, 'game_over');
    assert.ok(s.winners.length > 0);
  }
  assert.equal(
    bellClashModule.reduce(ctx, state, actor('a'), { type: 'player_forfeited', playerIds: ['b'] }).ok,
    false,
    '玩家不能投递 player_forfeited',
  );
});
