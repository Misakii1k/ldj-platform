import assert from 'node:assert/strict';
import test from 'node:test';
import type { GameContext } from '@ldj/shared';
import { createSeededRandom } from '../../../shared/src/game/random.ts';
import { deterministicContext } from '../../../shared/tests/helpers/versionedGameContract.ts';
import { pickNightTestimonyBotAction } from '../server/bot.ts';
import { nightTestimonyModule } from '../server/module.ts';
import { createNightTestimonyState } from '../server/rules.ts';
import type { NightTestimonyState } from '../server/types.ts';

const PLAYERS = ['a', 'b', 'c', 'd'] as const;
const ACTOR = (playerId: string) => ({ kind: 'player' as const, playerId });
const SYS = { kind: 'system' as const, source: 'timer' as const };

function makeInitialState(ctx: GameContext = deterministicContext()): NightTestimonyState {
  return nightTestimonyModule.createInitialState(
    ctx,
    [...PLAYERS],
    nightTestimonyModule.parseConfig({ rulesetId: 'night_testimony_v1' }),
  );
}

function makeDeterministicState(): NightTestimonyState {
  return createNightTestimonyState(
    [...PLAYERS],
    { rulesetId: 'night_testimony_v1', maxYesPerPlayer: 3, questionLimit: 5 },
    'b',
    { a: 'arson', c: 'theft', d: 'forgery' },
    'smuggling',
  );
}

test('bot 提问阶段：出题者返回 pick_question_card 且 reducer 接受', () => {
  const ctx = deterministicContext();
  let state = makeDeterministicState();
  const qer = state.currentQuestionerId;
  const view = nightTestimonyModule.getPlayerView(state, qer);
  const action = pickNightTestimonyBotAction({ view, playerId: qer, random: createSeededRandom('bot-pick') });
  assert.ok(action);
  assert.equal(action!.type, 'pick_question_card');
  assert.equal(action!.playerId, qer);

  const reduced = nightTestimonyModule.reduce(ctx, state, ACTOR(qer), action!);
  assert.equal(reduced.ok, true);
  state = reduced.nextState;
  assert.ok(state.currentQuestion);
});

test('bot 提问阶段：全员作答返回 answer_question', () => {
  const ctx = deterministicContext();
  let state = makeDeterministicState();
  const r0 = nightTestimonyModule.reduce(ctx, state, ACTOR('a'), {
    type: 'pick_question_card',
    playerId: 'a',
    cardId: 'nt_q01',
  });
  assert.equal(r0.ok, true);
  state = r0.nextState;

  for (const p of PLAYERS) {
    const view = nightTestimonyModule.getPlayerView(state, p);
    const action = pickNightTestimonyBotAction({ view, playerId: p, random: createSeededRandom(`bot-ans-${p}`) });
    assert.ok(action);
    assert.equal(action!.type, 'answer_question');
    assert.equal(action!.playerId, p);

    const r = nightTestimonyModule.reduce(ctx, state, ACTOR(p), action!);
    assert.equal(r.ok, true);
    state = r.nextState;
  }
  assert.equal(state.history.length, 1);
});

test('bot 投票阶段：返回合法的 cast_vote 且不投自己', () => {
  const ctx = deterministicContext();
  let state = makeDeterministicState();
  state.phase = 'vote';

  for (const p of PLAYERS) {
    const view = nightTestimonyModule.getPlayerView(state, p);
    const action = pickNightTestimonyBotAction({ view, playerId: p, random: createSeededRandom(`bot-vt-${p}`) });
    assert.ok(action);
    assert.equal(action!.type, 'cast_vote');
    assert.equal(action!.playerId, p);
    assert.notEqual(action!.targetPlayerId, p);

    const r = nightTestimonyModule.reduce(ctx, state, ACTOR(p), action!);
    assert.equal(r.ok, true);
    state = r.nextState;
  }
  assert.equal(state.phase, 'game_over');
});

test('bot 终局猜罪：狱警返回 submit_guesses 且覆盖全部囚犯', () => {
  const ctx = deterministicContext();
  let state = makeDeterministicState();
  state.phase = 'game_over';
  state.guessingInProgress = true;
  state.wardenRevealed = true;

  const view = nightTestimonyModule.getPlayerView(state, 'b');
  const action = pickNightTestimonyBotAction({ view, playerId: 'b', random: createSeededRandom('bot-guess') });
  assert.ok(action);
  assert.equal(action!.type, 'submit_guesses');
  assert.equal(action!.playerId, 'b');
  assert.deepEqual(Object.keys(action!.guesses).sort(), ['a', 'c', 'd']);

  const r = nightTestimonyModule.reduce(ctx, state, ACTOR('b'), action!);
  assert.equal(r.ok, true);
  assert.equal(r.nextState.guessingInProgress, false);
});

test('bot 完整冒烟：全流程自动化模拟到终局', () => {
  for (const seed of ['smoke-1', 'smoke-2', 'smoke-3']) {
    const ctx: GameContext = { now: 1_700_000_000_000, random: createSeededRandom(seed) };
    let state = makeInitialState(ctx);

    const begin = nightTestimonyModule.reduce(ctx, state, SYS, { type: 'begin' });
    assert.equal(begin.ok, true);
    state = begin.nextState;

    let safety = 60;
    while (state.phase !== 'game_over' && safety-- > 0) {
      if (state.phase === 'question') {
        if (state.currentQuestion === null) {
          const qer = state.currentQuestionerId;
          const view = nightTestimonyModule.getPlayerView(state, qer);
          const act = pickNightTestimonyBotAction({ view, playerId: qer, random: createSeededRandom(`${seed}-pick-${safety}`) });
          assert.ok(act);
          const r = nightTestimonyModule.reduce(ctx, state, ACTOR(qer), act!);
          assert.equal(r.ok, true);
          state = r.nextState;
        } else {
          for (const p of state.players) {
            if (state.currentQuestionAnswers[p] === undefined) {
              const view = nightTestimonyModule.getPlayerView(state, p);
              const act = pickNightTestimonyBotAction({ view, playerId: p, random: createSeededRandom(`${seed}-ans-${p}-${safety}`) });
              assert.ok(act);
              const r = nightTestimonyModule.reduce(ctx, state, ACTOR(p), act!);
              assert.equal(r.ok, true);
              state = r.nextState;
            }
          }
        }
      } else if (state.phase === 'vote') {
        for (const p of state.players) {
          if (state.votes[p] === undefined) {
            const view = nightTestimonyModule.getPlayerView(state, p);
            const act = pickNightTestimonyBotAction({ view, playerId: p, random: createSeededRandom(`${seed}-vt-${p}`) });
            assert.ok(act);
            const r = nightTestimonyModule.reduce(ctx, state, ACTOR(p), act!);
            assert.equal(r.ok, true);
            state = r.nextState;
          }
        }
      }
    }

    if (state.guessingInProgress && state.wardenId) {
      const view = nightTestimonyModule.getPlayerView(state, state.wardenId);
      const act = pickNightTestimonyBotAction({ view, playerId: state.wardenId, random: createSeededRandom(`${seed}-guess-final`) });
      assert.ok(act);
      const r = nightTestimonyModule.reduce(ctx, state, ACTOR(state.wardenId), act!);
      assert.equal(r.ok, true);
      state = r.nextState;
    }

    assert.equal(state.phase, 'game_over');
    assert.ok(state.winners.length > 0);
  }
});
