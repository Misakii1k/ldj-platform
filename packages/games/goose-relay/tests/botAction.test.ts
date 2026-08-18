import assert from 'node:assert/strict';
import test from 'node:test';
import type { GameContext, RandomSource } from '@ldj/shared';
import { createSeededRandom } from '../../../shared/src/game/random.ts';
import { deterministicContext } from '../../../shared/tests/helpers/versionedGameContract.ts';
import { pickGooseRelayBotAction } from '../server/bot.ts';
import { gooseRelayModule } from '../server/module.ts';
import { createGooseRelayState } from '../server/rules.ts';
import type { CharacterId, GooseRelayAction, GooseRelayState } from '../server/types.ts';

const players = ['a', 'b', 'c', 'd', 'e'];
const actorOf = (playerId: string) => ({ kind: 'player' as const, playerId });
const sys = { kind: 'system' as const, source: 'timer' as const };
const config = { rulesetId: 'goose_relay_classic_v1' };

const CANDIDATES: CharacterId[] = [
  'detective',
  'astronaut',
  'pirate',
  'chef',
  'doctor',
  'firefighter',
];

function initial(ctx: GameContext = deterministicContext()): GooseRelayState {
  return gooseRelayModule.createInitialState(ctx, players, gooseRelayModule.parseConfig(config));
}

function next(
  ctx: GameContext,
  state: GooseRelayState,
  a: unknown,
  action: unknown,
): GooseRelayState {
  const r = gooseRelayModule.reduce(ctx, state, a as never, action as never);
  if (!r.ok) throw new Error(r.message);
  return r.nextState;
}

function botRandom(seed: string): RandomSource {
  return createSeededRandom(seed);
}

function botPick(state: GooseRelayState, playerId: string, seed: string): GooseRelayAction | null {
  const view = gooseRelayModule.getPlayerView(state, playerId);
  return pickGooseRelayBotAction({ view, playerId, random: botRandom(seed) });
}

test('bot: 不在本局（me 为 null）→ 返回 null', () => {
  const ctx = deterministicContext();
  const state = initial(ctx);
  const view = gooseRelayModule.getPlayerView(state, 'zzz');
  assert.equal(view.me, null);
  const action = pickGooseRelayBotAction({ view, playerId: 'zzz', random: botRandom('bot-1') });
  assert.equal(action, null);
});

test('bot: claim_head 阶段，未抢到头鹅时 → 返回 claim_head 且 reducer 接受', () => {
  const ctx = deterministicContext();
  const state = initial(ctx);
  assert.equal(state.phase, 'claim_head');
  const action = botPick(state, 'a', 'bot-2');
  assert.ok(action);
  assert.equal(action!.type, 'claim_head');
  assert.equal(action!.playerId, 'a');

  const s = next(ctx, state, actorOf('a'), action);
  assert.equal(s.phase, 'pick_cards');
  assert.equal(s.headPlayerId, 'a');
});

test('bot: pick_cards 阶段，头鹅选卡 → 返回 pick_cards 且 reducer 接受', () => {
  const ctx = deterministicContext();
  let state = initial(ctx);
  state = next(ctx, state, actorOf('a'), { type: 'claim_head', playerId: 'a' });
  assert.equal(state.phase, 'pick_cards');

  // a 是头鹅，返回选卡
  const action = botPick(state, 'a', 'bot-pick-a');
  assert.ok(action);
  assert.equal(action!.type, 'pick_cards');
  assert.equal(action!.playerId, 'a');

  const s = next(ctx, state, actorOf('a'), action);
  assert.equal(s.phase, 'relay');
  assert.equal(s.currentIndex, 0);

  // 非头鹅调用返回 null
  const bAction = botPick(state, 'b', 'bot-pick-b');
  assert.equal(bAction, null);
});

test('bot: relay 阶段，轮到当前表演者 → 返回 relay_done 且 reducer 接受', () => {
  const ctx = deterministicContext();
  let state = initial(ctx);
  state = next(ctx, state, actorOf('a'), { type: 'claim_head', playerId: 'a' });
  const m = state.candidateCards[0]!;
  const v = state.candidateCards[1]!;
  state = next(ctx, state, actorOf('a'), { type: 'pick_cards', playerId: 'a', murderer: m, victim: v });
  assert.equal(state.phase, 'relay');
  assert.equal(state.currentIndex, 0);

  // 首棒 a
  const aAction = botPick(state, 'a', 'bot-relay-a');
  assert.ok(aAction);
  assert.equal(aAction!.type, 'relay_done');

  state = next(ctx, state, actorOf('a'), aAction);
  assert.equal(state.currentIndex, 1);

  // 此时非当前棒（a）返回 null
  const aAgain = botPick(state, 'a', 'bot-relay-a2');
  assert.equal(aAgain, null);

  // 第 2 棒 b
  const bAction = botPick(state, 'b', 'bot-relay-b');
  assert.ok(bAction);
  assert.equal(bAction!.type, 'relay_done');
});

test('bot: discussion 阶段（线下讨论）→ 返回 null', () => {
  const ctx = deterministicContext();
  let state = initial(ctx);
  state = next(ctx, state, actorOf('a'), { type: 'claim_head', playerId: 'a' });
  const m = state.candidateCards[0]!;
  const v = state.candidateCards[1]!;
  state = next(ctx, state, actorOf('a'), { type: 'pick_cards', playerId: 'a', murderer: m, victim: v });
  for (let i = 0; i < state.players.length; i += 1) {
    state = next(ctx, state, actorOf(state.lineOrder[i]!), {
      type: 'relay_done',
      playerId: state.lineOrder[i]!,
    });
  }
  assert.equal(state.phase, 'discussion');
  for (const id of players) {
    const action = botPick(state, id, `bot-disc-${id}`);
    assert.equal(action, null);
  }
});

test('bot: accusation 阶段，轮到末位指认 → 返回 accuse 且 reducer 接受', () => {
  const ctx = deterministicContext();
  let state = createGooseRelayState(
    players,
    config,
    CANDIDATES,
    ['c'],
    { murderer: 'detective', victim: 'astronaut' },
    'a',
  );
  // a 选卡
  state = next(ctx, state, actorOf('a'), {
    type: 'pick_cards',
    playerId: 'a',
    murderer: 'detective',
    victim: 'astronaut',
  });
  for (let i = 0; i < players.length; i += 1) {
    state = next(ctx, state, actorOf(state.lineOrder[i]!), {
      type: 'relay_done',
      playerId: state.lineOrder[i]!,
    });
  }
  state = next(ctx, state, sys, { type: 'end_discussion' });
  assert.equal(state.phase, 'accusation');
  assert.equal(state.currentAccuserIndex, players.length - 1);

  const accuser = state.lineOrder[state.currentAccuserIndex]!;
  const action = botPick(state, accuser, 'bot-acc');
  assert.ok(action);
  assert.equal(action!.type, 'accuse');
  assert.equal(action!.playerId, accuser);

  const s = next(ctx, state, actorOf(accuser), action);
  assert.equal(s.accusations.length, 1);
});

test('bot 烟囱：从抢头鹅一直推进至终局', () => {
  const ctx = deterministicContext();
  let state = initial(ctx);
  let safety = 0;
  while (state.phase !== 'game_over') {
    if (safety > 50) throw new Error('烟囱测试未在限定步数内结束');
    safety += 1;
    switch (state.phase) {
      case 'claim_head': {
        const action = botPick(state, 'a', `bot-smoke-claim-${safety}`);
        assert.ok(action);
        state = next(ctx, state, actorOf('a'), action);
        break;
      }
      case 'pick_cards': {
        const head = state.headPlayerId!;
        const action = botPick(state, head, `bot-smoke-pick-${safety}`);
        assert.ok(action);
        state = next(ctx, state, actorOf(head), action);
        break;
      }
      case 'relay': {
        const performer = state.lineOrder[state.currentIndex]!;
        const action = botPick(state, performer, `bot-smoke-relay-${safety}`);
        assert.ok(action);
        state = next(ctx, state, actorOf(performer), action);
        break;
      }
      case 'discussion': {
        state = next(ctx, state, sys, { type: 'end_discussion' });
        break;
      }
      case 'accusation': {
        const accuser = state.lineOrder[state.currentAccuserIndex]!;
        const action = botPick(state, accuser, `bot-smoke-acc-${safety}`);
        assert.ok(action);
        state = next(ctx, state, actorOf(accuser), action);
        break;
      }
      case 'vote': {
        const voter = state.players.find((p) => state.votes[p] === undefined);
        if (voter === undefined) {
          state = next(ctx, state, sys, { type: 'resolve_vote' });
          break;
        }
        const action = botPick(state, voter, `bot-smoke-vote-${voter}`);
        assert.ok(action);
        state = next(ctx, state, actorOf(voter), action);
        break;
      }
      default: {
        const exhaustive: never = state.phase;
        throw new Error(`意外阶段：${String(exhaustive)}`);
      }
    }
  }
  assert.equal(state.phase, 'game_over', 'bot 推进应能走到终局');
  assert.ok(state.winners.length > 0, '终局应产出胜者');
});
