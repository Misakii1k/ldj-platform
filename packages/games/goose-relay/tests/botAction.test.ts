import assert from 'node:assert/strict';
import test from 'node:test';
import type { GameContext, RandomSource } from '@ldj/shared';
import { createSeededRandom } from '../../../shared/src/game/random.ts';
import { deterministicContext } from '../../../shared/tests/helpers/versionedGameContract.ts';
import { pickGooseRelayBotAction } from '../server/bot.ts';
import { gooseRelayModule } from '../server/module.ts';
import { createGooseRelayState } from '../server/rules.ts';
import type { CaseCard, GooseRelayAction, GooseRelayState } from '../server/types.ts';

const players = ['a', 'b', 'c', 'd', 'e'];
const actorOf = (playerId: string) => ({ kind: 'player' as const, playerId });
const sys = { kind: 'system' as const, source: 'timer' as const };
const config = { rulesetId: 'goose_relay_classic_v1' };

const CARD_A: CaseCard = { murderer: 'grey_goose', victim: 'white_goose', tool: 'knife', scene: 'barn' };

function initial(ctx: GameContext = deterministicContext()): GooseRelayState {
  return gooseRelayModule.createInitialState(ctx, players, gooseRelayModule.parseConfig(config));
}

function next(ctx: GameContext, state: GooseRelayState, a: unknown, action: unknown): GooseRelayState {
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

/** 通过 bot 走完传递：每一步都调用 bot，必须返回非空 transmit；非法时直接抛 */
function relayAllViaBot(ctx: GameContext, state: GooseRelayState, seedPrefix: string): GooseRelayState {
  let s = state;
  // case_view：头鹅 a 读卡后传递
  let step = 0;
  while (s.phase === 'case_view' || s.phase === 'relay') {
    const expectedId = s.lineOrder[s.currentIndex]!;
    const action = botPick(s, expectedId, `${seedPrefix}-relay-${step}`);
    assert.ok(action, `传递步 ${step}（期望 ${expectedId}）应能返回动作`);
    assert.equal(action!.type, 'transmit');
    assert.equal(action!.playerId, expectedId);
    s = next(ctx, s, actorOf(expectedId), action);
    step += 1;
    if (step > 10) throw new Error('relayAllViaBot 步数超限');
  }
  assert.equal(s.phase, 'discussion');
  return s;
}

test('bot: 不在本局（me 为 null）→ 返回 null', () => {
  const ctx = deterministicContext();
  const state = initial(ctx);
  const view = gooseRelayModule.getPlayerView(state, 'zzz');
  assert.equal(view.me, null);
  const action = pickGooseRelayBotAction({ view, playerId: 'zzz', random: botRandom('bot-1') });
  assert.equal(action, null);
});

test('bot: case_view 阶段，头鹅（轮到自己）→ 返回 transmit 且 reducer 接受', () => {
  const ctx = deterministicContext();
  const state = initial(ctx);
  assert.equal(state.phase, 'case_view');
  const action = botPick(state, 'a', 'bot-2');
  assert.ok(action, '头鹅读卡阶段应能返回 transmit');
  assert.equal(action!.type, 'transmit');
  assert.equal(action!.playerId, 'a');
  // 头鹅观察到原始案情 → transmit.case 应与 view.me.observed 一致
  const view = gooseRelayModule.getPlayerView(state, 'a');
  assert.deepEqual((action as { case: CaseCard }).case, view.me!.observed);
  // parseAction + reduce 必须接受
  const parsed = gooseRelayModule.parseAction(action);
  const s = next(ctx, state, actorOf('a'), parsed);
  assert.equal(s.phase, 'relay');
  assert.equal(s.currentIndex, 1);
  assert.deepEqual(s.transmissions[0], view.me!.observed);
});

test('bot: case_view 阶段，非头鹅（未轮到自己）→ 返回 null', () => {
  const ctx = deterministicContext();
  const state = initial(ctx);
  for (const id of ['b', 'c', 'd', 'e']) {
    const action = botPick(state, id, `bot-3-${id}`);
    assert.equal(action, null, `case_view 阶段非头鹅 ${id} 不应返回动作`);
  }
});

test('bot: relay 阶段，轮到当前 index → 返回 transmit 且 reducer 接受', () => {
  const ctx = deterministicContext();
  // 头鹅先传，进入 relay（currentIndex=1）
  let state = initial(ctx);
  state = next(ctx, state, actorOf('a'), { type: 'transmit', playerId: 'a', case: CARD_A });
  assert.equal(state.phase, 'relay');
  assert.equal(state.currentIndex, 1);

  // b 应看到头鹅演绎
  const bAction = botPick(state, 'b', 'bot-4-b');
  assert.ok(bAction, 'relay 阶段 b 应能返回 transmit');
  assert.equal(bAction!.type, 'transmit');
  assert.equal(bAction!.playerId, 'b');
  const bView = gooseRelayModule.getPlayerView(state, 'b');
  assert.deepEqual((bAction as { case: CaseCard }).case, bView.me!.observed);
  // reducer 接受
  state = next(ctx, state, actorOf('b'), bAction);
  assert.equal(state.currentIndex, 2);
});

test('bot: relay 阶段，非当前 index → 返回 null', () => {
  const ctx = deterministicContext();
  let state = initial(ctx);
  state = next(ctx, state, actorOf('a'), { type: 'transmit', playerId: 'a', case: CARD_A });
  // currentIndex=1，应轮到 b
  for (const id of ['a', 'c', 'd', 'e']) {
    const action = botPick(state, id, `bot-5-${id}`);
    assert.equal(action, null, `relay 阶段非当前 index 的 ${id} 不应返回动作`);
  }
});

test('bot: relay 阶段，已动作后再次调用（currentIndex 已推进）→ 返回 null', () => {
  const ctx = deterministicContext();
  let state = initial(ctx);
  state = next(ctx, state, actorOf('a'), { type: 'transmit', playerId: 'a', case: CARD_A });
  // b 第一次：应返回 transmit
  const first = botPick(state, 'b', 'bot-6-first');
  assert.ok(first);
  state = next(ctx, state, actorOf('b'), first);
  // b 第二次：currentIndex 已推进到 2 → 返回 null
  const second = botPick(state, 'b', 'bot-6-second');
  assert.equal(second, null, '已传递的 b 再次调用应返回 null');
});

test('bot: discussion 阶段（线下讨论）→ 返回 null', () => {
  const ctx = deterministicContext();
  let state = initial(ctx);
  // 推进到 discussion
  state = relayAllViaBot(ctx, state, 'bot-7');
  assert.equal(state.phase, 'discussion');
  for (const id of players) {
    const action = botPick(state, id, `bot-7-disc-${id}`);
    assert.equal(action, null, `discussion 阶段 ${id} 不应返回动作`);
  }
});

test('bot: accusation 阶段，轮到末位指认 → 返回 accuse 且 reducer 接受', () => {
  const ctx = deterministicContext();
  // 用确定 state 推到 accusation 阶段
  let state = createGooseRelayState(players, config, CARD_A, ['c']);
  state = relayAllViaBot(ctx, state, 'bot-8');
  state = next(ctx, state, sys, { type: 'end_discussion' });
  assert.equal(state.phase, 'accusation');
  assert.equal(state.currentAccuserIndex, players.length - 1);

  const expectedAccuser = state.lineOrder[state.currentAccuserIndex]!; // 末位 e
  const action = botPick(state, expectedAccuser, 'bot-8-acc');
  assert.ok(action, '末位应能返回 accuse');
  assert.equal(action!.type, 'accuse');
  assert.equal(action!.playerId, expectedAccuser);
  // 凶手 ≠ 被害人（schema 约束）
  const accuseAction = action as { type: 'accuse'; murderer: string; victim: string };
  assert.notEqual(accuseAction.murderer, accuseAction.victim, '凶手与被害人必须不同');
  // parseAction + reduce 接受
  const parsed = gooseRelayModule.parseAction(action);
  const s = next(ctx, state, actorOf(expectedAccuser), parsed);
  // 不论指对/指错，状态都会推进（accusations 多一条，currentAccuserIndex 减 1 或进入 vote）
  assert.equal(s.accusations.length, 1);
});

test('bot: accusation 阶段，非当前指认下标 → 返回 null', () => {
  const ctx = deterministicContext();
  let state = createGooseRelayState(players, config, CARD_A, ['c']);
  state = relayAllViaBot(ctx, state, 'bot-9');
  state = next(ctx, state, sys, { type: 'end_discussion' });
  assert.equal(state.phase, 'accusation');
  assert.equal(state.currentAccuserIndex, players.length - 1);
  // 除末位 e 外都应返回 null
  for (const id of players) {
    if (id === state.lineOrder[state.currentAccuserIndex]) continue;
    const action = botPick(state, id, `bot-9-acc-${id}`);
    assert.equal(action, null, `accusation 阶段非当前指认下标的 ${id} 不应返回动作`);
  }
});

test('bot: accusation 阶段，已指认后再次调用（下标已推进）→ 返回 null', () => {
  const ctx = deterministicContext();
  let state = createGooseRelayState(players, config, CARD_A, ['c']);
  state = relayAllViaBot(ctx, state, 'bot-10');
  state = next(ctx, state, sys, { type: 'end_discussion' });

  // 末位 e 指认（无论指对/指错，currentAccuserIndex 都会推进）
  const accuser = state.lineOrder[state.currentAccuserIndex]!;
  const first = botPick(state, accuser, 'bot-10-acc-first');
  assert.ok(first);
  state = next(ctx, state, actorOf(accuser), first);
  // 再次调用：要么下标变了（accusation），要么已进 vote → null
  const second = botPick(state, accuser, 'bot-10-acc-second');
  assert.equal(second, null, '已指认的玩家再次调用应返回 null');
});

test('bot: vote 阶段，未投过 → 返回 cast_vote 且 reducer 接受', () => {
  const ctx = deterministicContext();
  let state = createGooseRelayState(players, config, CARD_A, ['c']);
  state = relayAllViaBot(ctx, state, 'bot-11');
  state = next(ctx, state, sys, { type: 'end_discussion' });
  // 末位按真实案情指对 → 进入 vote
  state = next(ctx, state, actorOf('e'), {
    type: 'accuse',
    playerId: 'e',
    murderer: state.case.murderer,
    victim: state.case.victim,
  });
  assert.equal(state.phase, 'vote');

  const action = botPick(state, 'a', 'bot-11-vote-a');
  assert.ok(action, '投票阶段 a 应能返回 cast_vote');
  assert.equal(action!.type, 'cast_vote');
  const voteAction = action as { type: 'cast_vote'; playerId: string; targetPlayerId: string };
  assert.equal(voteAction.playerId, 'a');
  assert.notEqual(voteAction.targetPlayerId, 'a', '不能投自己');
  assert.ok(state.players.includes(voteAction.targetPlayerId), '目标必须在局内');
  // reducer 接受
  const parsed = gooseRelayModule.parseAction(action);
  const s = next(ctx, state, actorOf('a'), parsed);
  assert.equal(s.votes['a'], voteAction.targetPlayerId);
});

test('bot: vote 阶段，votesCast === players.length（全员已投）→ 返回 null', () => {
  const ctx = deterministicContext();
  let state = createGooseRelayState(players, config, CARD_A, ['c']);
  state = relayAllViaBot(ctx, state, 'bot-12');
  state = next(ctx, state, sys, { type: 'end_discussion' });
  state = next(ctx, state, actorOf('e'), {
    type: 'accuse',
    playerId: 'e',
    murderer: state.case.murderer,
    victim: state.case.victim,
  });
  // 全员投票
  for (const id of players) {
    const target = players.find((p) => p !== id)!;
    state = next(ctx, state, actorOf(id), {
      type: 'cast_vote',
      playerId: id,
      targetPlayerId: target,
    });
  }
  assert.equal(state.phase, 'game_over');
  // 终局 → 返回 null
  for (const id of players) {
    const action = botPick(state, id, `bot-12-go-${id}`);
    assert.equal(action, null, `终局后 ${id} 不应返回动作`);
  }
});

test('bot: game_over 阶段 → 返回 null', () => {
  const ctx = deterministicContext();
  let state = createGooseRelayState(players, config, CARD_A, ['c']);
  state = relayAllViaBot(ctx, state, 'bot-13');
  state = next(ctx, state, sys, { type: 'end_discussion' });
  // 全部指错 → 恶鹅胜
  for (let i = players.length - 1; i >= 0; i -= 1) {
    state = next(ctx, state, actorOf(players[i]!), {
      type: 'accuse',
      playerId: players[i]!,
      murderer: 'brown_goose',
      victim: 'black_goose',
    });
  }
  assert.equal(state.phase, 'game_over');
  for (const id of players) {
    const action = botPick(state, id, `bot-13-go-${id}`);
    assert.equal(action, null, `终局后 ${id} 不应返回动作`);
  }
});

test('bot: 同一 phase 重复调用（系统未推进）→ 重复返回同形动作且 reducer 接受', () => {
  const ctx = deterministicContext();
  const state = initial(ctx);
  assert.equal(state.phase, 'case_view');
  const a1 = botPick(state, 'a', 'bot-14-a1');
  const a2 = botPick(state, 'a', 'bot-14-a2');
  assert.ok(a1 && a2, '同状态下两次调用都应返回动作');
  // 同种子同视图 → 同形动作（nextInt 游标独立，所以这里只断言"两次都被 reducer 接受"）
  const r1 = gooseRelayModule.reduce(ctx, structuredClone(state), actorOf('a'), a1!);
  assert.equal(r1.ok, true, '第一次调用 reducer 必须接受');
});

test('bot: 与 module.pickBotAction 端到端联通（case_view）', () => {
  const ctx = deterministicContext();
  const state = initial(ctx);
  const view = gooseRelayModule.getPlayerView(state, 'a');
  assert.ok(gooseRelayModule.pickBotAction, 'module.pickBotAction 必须存在');
  const viaModule = gooseRelayModule.pickBotAction!({ view, playerId: 'a', random: botRandom('bot-e2e') });
  const direct = pickGooseRelayBotAction({ view, playerId: 'a', random: botRandom('bot-e2e') });
  assert.deepEqual(viaModule, direct, '端到端应与直接调用一致');
  assert.ok(viaModule);
  assert.equal(viaModule!.type, 'transmit');
  // 端到端 reducer 接受
  const after = next(ctx, state, actorOf('a'), viaModule);
  assert.equal(after.phase, 'relay');
});

test('bot 烟囱：系统 begin + bot 陪练完整推进至终局', () => {
  const ctx = deterministicContext();
  let state = initial(ctx);
  let safety = 0;
  while (state.phase !== 'game_over') {
    if (safety > 50) throw new Error('烟囱测试未在限定步数内结束');
    safety += 1;
    switch (state.phase) {
      case 'case_view':
      case 'relay': {
        const expectedId = state.lineOrder[state.currentIndex]!;
        const action = botPick(state, expectedId, `bot-smoke-relay-${state.currentIndex}`);
        assert.ok(action, `relay 步 ${state.currentIndex}：${expectedId} 应能传递`);
        assert.equal(action!.type, 'transmit');
        state = next(ctx, state, actorOf(expectedId), action);
        break;
      }
      case 'discussion': {
        // 系统推进讨论 → accusation
        state = next(ctx, state, sys, { type: 'end_discussion' });
        break;
      }
      case 'accusation': {
        const accuser = state.lineOrder[state.currentAccuserIndex]!;
        const action = botPick(state, accuser, `bot-smoke-acc-${state.currentAccuserIndex}`);
        assert.ok(action, `accusation 下标 ${state.currentAccuserIndex}：${accuser} 应能指认`);
        assert.equal(action!.type, 'accuse');
        state = next(ctx, state, actorOf(accuser), action);
        break;
      }
      case 'vote': {
        // 找出还没投过票的玩家
        const voter = state.players.find((p) => state.votes[p] === undefined);
        if (voter === undefined) {
          // 全员已投但 phase 还在 vote（少见），等计时器结算
          state = next(ctx, state, sys, { type: 'resolve_vote' });
          break;
        }
        const action = botPick(state, voter, `bot-smoke-vote-${voter}`);
        assert.ok(action, `vote 阶段 ${voter} 应能投票`);
        assert.equal(action!.type, 'cast_vote');
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

test('bot: 完整 bot 烟囱（不依赖 system 推讨论）— 使用 discussionSeconds=0 跳过讨论', () => {
  const ctx = deterministicContext();
  const cfg = { rulesetId: 'goose_relay_classic_v1' as const, discussionSeconds: 0 };
  let state = gooseRelayModule.createInitialState(ctx, players, gooseRelayModule.parseConfig(cfg));
  let safety = 0;
  while (state.phase !== 'game_over') {
    if (safety > 50) throw new Error('烟囱测试未在限定步数内结束');
    safety += 1;
    switch (state.phase) {
      case 'case_view':
      case 'relay': {
        const expectedId = state.lineOrder[state.currentIndex]!;
        const action = botPick(state, expectedId, `bot-smoke2-relay-${state.currentIndex}`);
        assert.ok(action);
        state = next(ctx, state, actorOf(expectedId), action);
        break;
      }
      case 'discussion': {
        // 跳过讨论直接到 accusation（end_discussion 视为系统动作）
        state = next(ctx, state, sys, { type: 'end_discussion' });
        break;
      }
      case 'accusation': {
        const accuser = state.lineOrder[state.currentAccuserIndex]!;
        const action = botPick(state, accuser, `bot-smoke2-acc-${state.currentAccuserIndex}`);
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
        const action = botPick(state, voter, `bot-smoke2-vote-${voter}`);
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
  assert.equal(state.phase, 'game_over');
  assert.ok(state.winners.length > 0);
});
