import assert from 'node:assert/strict';
import test from 'node:test';
import type { GameContext, RandomSource } from '@ldj/shared';
import { deterministicContext } from '../../../shared/tests/helpers/versionedGameContract.ts';
import { createSeededRandom } from '../../../shared/src/game/random.ts';
import { echoJudgeModule } from '../server/module.ts';
import { pickEchoJudgeBotAction } from '../server/bot.ts';
import type { EchoJudgeAction, EchoJudgeState } from '../server/types.ts';

const players = ['a', 'b', 'c', 'd'];
const actorOf = (playerId: string) => ({ kind: 'player' as const, playerId });
const sys = { kind: 'system' as const, source: 'timer' as const };
const config = { rulesetId: 'echo_judge_v1' };

function initial(ctx: GameContext = deterministicContext()): EchoJudgeState {
  return echoJudgeModule.createInitialState(ctx, players, echoJudgeModule.parseConfig(config));
}

function next(ctx: GameContext, state: EchoJudgeState, a: unknown, action: unknown): EchoJudgeState {
  const r = echoJudgeModule.reduce(ctx, state, a as never, action as never);
  if (!r.ok) throw new Error(r.message);
  return r.nextState;
}

function botRandom(seed: string): RandomSource {
  return createSeededRandom(seed);
}

function botPick(state: EchoJudgeState, playerId: string, seed: string): EchoJudgeAction | null {
  const view = echoJudgeModule.getPlayerView(state, playerId);
  return pickEchoJudgeBotAction({ view, playerId, random: botRandom(seed) });
}

test('bot: 不在本局 / me 为 null → 返回 null', () => {
  const ctx = deterministicContext();
  const state = initial(ctx);
  const view = echoJudgeModule.getPlayerView(state, 'zzz');
  assert.equal(view.me, null, '局外玩家应得到 me=null');
  const action = pickEchoJudgeBotAction({ view, playerId: 'zzz', random: botRandom('bot-1') });
  assert.equal(action, null);
});

test('bot: judge_setup 阶段，非判官 → 返回 null', () => {
  const ctx = deterministicContext();
  const state = initial(ctx);
  const judgeId = state.judgeId;
  const otherId = players.find((p) => p !== judgeId)!;
  const action = botPick(state, otherId, 'bot-2');
  assert.equal(action, null, '非判官在出题阶段不强制产出出题动作');
});

test('bot: judge_setup 阶段，判官 → 返回 pick_topic_card 或 start_round 且 reducer 接受', () => {
  const ctx = deterministicContext();
  let state = initial(ctx);
  const judgeId = state.judgeId;
  const action = botPick(state, judgeId, 'bot-3');
  assert.ok(action, '判官应能返回动作');
  assert.ok(action!.type === 'pick_topic_card' || action!.type === 'start_round');
  assert.equal(action!.playerId, judgeId);
  const parsed = echoJudgeModule.parseAction(action);
  assert.equal(parsed.type, action!.type);
  state = next(ctx, state, actorOf(judgeId), action);
  assert.equal(state.phase, 'answering');
  assert.equal(state.question.length > 0, true, '题目满足 schema 长度约束');
});

test('bot: answering 阶段，未轮到自己 → 返回 null', () => {
  const ctx = deterministicContext();
  let state = initial(ctx);
  const judgeId = state.judgeId;
  state = next(ctx, state, actorOf(judgeId), { type: 'start_round', playerId: judgeId, question: 'q' });
  const order = state.answerOrder as string[];
  const laterId = order[order.length - 1]!;
  const action = botPick(state, laterId, 'bot-4');
  assert.equal(action, null, '未轮到者不应返回动作');
});

test('bot: answering 阶段，判官身份 → 返回 null', () => {
  const ctx = deterministicContext();
  let state = initial(ctx);
  const judgeId = state.judgeId;
  state = next(ctx, state, actorOf(judgeId), { type: 'start_round', playerId: judgeId, question: 'q' });
  const action = botPick(state, judgeId, 'bot-5');
  assert.equal(action, null, '判官不应回答');
});

test('bot: answering 阶段，轮到自己 → 返回 finish_speaking 且 reducer 接受', () => {
  const ctx = deterministicContext();
  let state = initial(ctx);
  const judgeId = state.judgeId;
  state = next(ctx, state, actorOf(judgeId), { type: 'start_round', playerId: judgeId, question: 'q' });
  const order = state.answerOrder as string[];
  const firstAnswerer = order[0]!;
  const action = botPick(state, firstAnswerer, 'bot-6');
  assert.ok(action, '轮到自己应返回动作');
  assert.ok(action!.type === 'finish_speaking' || action!.type === 'submit_answer');
  assert.equal(action!.playerId, firstAnswerer);
  const parsed = echoJudgeModule.parseAction(action);
  assert.equal(parsed.type, action!.type);
  state = next(ctx, state, actorOf(firstAnswerer), action);
  assert.ok(state.answers[firstAnswerer], '回答应落地');
  assert.equal(state.answers[firstAnswerer]!.length > 0, true, '回答满足 schema 长度约束');
});

test('bot: answering 阶段，已回答后再次调用 → 返回 null', () => {
  const ctx = deterministicContext();
  let state = initial(ctx);
  const judgeId = state.judgeId;
  state = next(ctx, state, actorOf(judgeId), { type: 'start_round', playerId: judgeId, question: 'q' });
  const order = state.answerOrder as string[];
  const firstAnswerer = order[0]!;
  const first = botPick(state, firstAnswerer, 'bot-7-a');
  assert.ok(first);
  state = next(ctx, state, actorOf(firstAnswerer), first);
  const second = botPick(state, firstAnswerer, 'bot-7-b');
  assert.equal(second, null, '已回答者不应再返回动作');
});

test('bot: judgment 阶段，判官 → 返回 accuse 且 reducer 接受', () => {
  const ctx = deterministicContext();
  let state = initial(ctx);
  const judgeId = state.judgeId;
  state = next(ctx, state, actorOf(judgeId), { type: 'start_round', playerId: judgeId, question: 'q' });
  for (const id of state.answerOrder as string[]) {
    state = next(ctx, state, actorOf(id), { type: 'finish_speaking', playerId: id });
  }
  assert.equal(state.phase, 'judgment');
  const action = botPick(state, judgeId, 'bot-8');
  assert.ok(action, '判官应能指认');
  assert.equal(action!.type, 'accuse');
  assert.equal(action!.playerId, judgeId);
  assert.ok(Array.isArray((action as { targetPlayerIds: string[] }).targetPlayerIds));
  assert.ok(!(action as { targetPlayerIds: string[] }).targetPlayerIds.includes(judgeId), '不能指认自己');
  const parsed = echoJudgeModule.parseAction(action);
  assert.equal(parsed.type, 'accuse');
  const beforeRound = state.round;
  const r = echoJudgeModule.reduce(ctx, state, actorOf(judgeId), parsed);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  state = r.nextState;
  assert.ok(Array.isArray(state.caughtImpostors));
  if (state.phase !== 'game_over') {
    assert.equal(state.round, beforeRound + 1, '应进入下一轮');
    assert.equal(state.phase, 'judge_setup');
  }
});

test('bot: judgment 阶段，非判官 → 返回 null', () => {
  const ctx = deterministicContext();
  let state = initial(ctx);
  const judgeId = state.judgeId;
  state = next(ctx, state, actorOf(judgeId), { type: 'start_round', playerId: judgeId, question: 'q' });
  for (const id of state.answerOrder as string[]) {
    state = next(ctx, state, actorOf(id), { type: 'finish_speaking', playerId: id });
  }
  const otherId = players.find((p) => p !== judgeId)!;
  const action = botPick(state, otherId, 'bot-9');
  assert.equal(action, null, '非判官不应指认');
});

test('bot: game_over 阶段 → 返回 null', () => {
  const ctx = deterministicContext();
  let state = initial(ctx);
  state = next(ctx, state, sys, { type: 'begin' });
  for (let round = 1; round <= 4; round += 1) {
    const judge = state.judgeId;
    state = next(ctx, state, actorOf(judge), { type: 'start_round', playerId: judge, question: `q-${round}` });
    for (const id of state.answerOrder as string[]) {
      state = next(ctx, state, actorOf(id), { type: 'finish_speaking', playerId: id });
    }
    state = next(ctx, state, actorOf(judge), { type: 'accuse', playerId: judge, targetPlayerIds: [(state.answerOrder as string[])[0]!] });
  }
  assert.equal(state.phase, 'game_over');
  for (const id of players) {
    const action = botPick(state, id, `bot-gameover-${id}`);
    assert.equal(action, null, `终局后 ${id} 不应返回任何动作`);
  }
});

test('bot 烟囱：系统 begin + bot 陪练完整推进至终局', () => {
  const ctx = deterministicContext();
  let state = initial(ctx);
  state = next(ctx, state, sys, { type: 'begin' });
  let safety = 0;
  while (state.phase !== 'game_over') {
    if (safety > 100) throw new Error('烟囱测试未在限定步数内结束');
    safety += 1;
    if (state.phase === 'judge_setup') {
      const judge = state.judgeId;
      const action = botPick(state, judge, `bot-smoke-judge-${state.round}`);
      assert.ok(action, `第 ${state.round} 轮 judge_setup：判官应能出题`);
      assert.ok(action!.type === 'pick_topic_card' || action!.type === 'start_round');
      state = next(ctx, state, actorOf(judge), action);
      assert.equal(state.phase, 'answering');
    } else if (state.phase === 'answering') {
      const order = state.answerOrder as string[];
      const answered = Object.keys(state.answers).length;
      const nextId = order[answered]!;
      const action = botPick(state, nextId, `bot-smoke-answer-${state.round}-${nextId}`);
      assert.ok(action, `第 ${state.round} 轮 answering：${nextId} 应能回答`);
      assert.ok(action!.type === 'finish_speaking' || action!.type === 'submit_answer');
      state = next(ctx, state, actorOf(nextId), action);
    } else if (state.phase === 'judgment') {
      const judge = state.judgeId;
      const action = botPick(state, judge, `bot-smoke-accuse-${state.round}`);
      assert.ok(action, `第 ${state.round} 轮 judgment：判官应能指认`);
      assert.equal(action!.type, 'accuse');
      state = next(ctx, state, actorOf(judge), action);
    } else {
      throw new Error(`意外阶段：${(state as { phase: string }).phase}`);
    }
  }
  assert.equal(state.phase, 'game_over', 'bot 推进应能走到终局');
  assert.ok(state.winners.length > 0, '终局应产出胜者');
});
