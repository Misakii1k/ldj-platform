import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../server/state.ts';
import { reduce } from '../server/reducer.ts';
import {
  buildPublicView,
  buildPlayerView,
  buildSpectatorView,
  parsePlayerView,
  parseSpectatorView,
} from '../server/views.ts';
import type { GameContext } from '@ldj/shared';

function createMockCtx(now = 1000): GameContext {
  return {
    now,
    random: {
      nextInt: (min, _max) => min,
      shuffle: (items) => [...items],
    },
  };
}

test('views: created 阶段视角结构与字段有界性', () => {
  const ctx = createMockCtx();
  const state = createInitialState(ctx, ['p1', 'p2', 'p3'], {});

  const pubView = buildPublicView(state);
  assert.equal(pubView.phase, 'created');
  assert.equal(pubView.round, 0);
  assert.equal(pubView.totalRounds, 7);
  assert.equal(pubView.question, null);
  assert.deepEqual(pubView.board, []);
  assert.deepEqual(pubView.publicBets, {});
  assert.equal(pubView.revealed, null);
  assert.deepEqual(pubView.history, []);
  assert.equal(pubView.result, null);

  const p1View = buildPlayerView(state, 'p1');
  assert.ok(p1View.me !== null);
  assert.equal(p1View.me?.playerId, 'p1');
  assert.equal(p1View.me?.reserved, 0);
  assert.equal(p1View.me?.available, 0);
  assert.equal(p1View.me?.canGuess, false);
  assert.equal(p1View.me?.canBet, false);

  const specView = buildSpectatorView(state);
  assert.equal('me' in specView, false);

  // 验证 parse 函数
  assert.doesNotThrow(() => parsePlayerView(p1View));
  assert.doesNotThrow(() => parseSpectatorView(specView));
});

test('views: answering 阶段视角白名单与状态投影', () => {
  const ctx = createMockCtx(1000);
  let state = createInitialState(ctx, ['p1', 'p2', 'p3'], {});
  const beginRes = reduce(ctx, state, { kind: 'system', source: 'admin' }, { type: 'begin' });
  assert.ok(beginRes.ok);
  state = beginRes.nextState;

  const pubView = buildPublicView(state);
  assert.equal(pubView.phase, 'answering');
  assert.equal(pubView.round, 1);
  assert.ok(pubView.question !== null);
  assert.ok(pubView.question?.prompt.length > 0);
  assert.ok(pubView.question?.unit.length > 0);

  // public 视角中不得出现标准答案或题目来源
  const qRaw = pubView.question as unknown as Record<string, unknown>;
  assert.equal('answer' in qRaw, false);
  assert.equal('sourceUrl' in qRaw, false);

  // board 和 publicBets 在 answering 阶段必须为空
  assert.deepEqual(pubView.board, []);
  assert.deepEqual(pubView.publicBets, {});

  const p1View = buildPlayerView(state, 'p1');
  assert.equal(p1View.me?.canGuess, true);
  assert.equal(p1View.me?.canBet, false);
  assert.equal(p1View.me?.submittedGuess, null);
});

test('views: arranging 与 betting 阶段暴露版图与下注', () => {
  const ctx = createMockCtx(1000);
  let state = createInitialState(ctx, ['p1', 'p2', 'p3'], {});
  const beginRes = reduce(ctx, state, { kind: 'system', source: 'admin' }, { type: 'begin' });
  assert.ok(beginRes.ok);
  state = beginRes.nextState;

  const g1 = reduce(ctx, state, { kind: 'player', playerId: 'p1' }, { type: 'submit_guess', roundToken: state.roundToken, expectedRevision: 0, value: 100 });
  assert.ok(g1.ok);
  state = g1.nextState;

  const g2 = reduce(ctx, state, { kind: 'player', playerId: 'p2' }, { type: 'submit_guess', roundToken: state.roundToken, expectedRevision: 0, value: 200 });
  assert.ok(g2.ok);
  state = g2.nextState;

  const p3Res = reduce(ctx, state, { kind: 'player', playerId: 'p3' }, { type: 'submit_guess', roundToken: state.roundToken, expectedRevision: 0, value: 300 });
  assert.ok(p3Res.ok);
  state = p3Res.nextState;

  // arranging 阶段：版图已公开，publicBets 仍为空
  const arrangingView = buildPublicView(state);
  assert.equal(arrangingView.phase, 'arranging');
  assert.ok(arrangingView.board.length >= 4);
  assert.deepEqual(arrangingView.publicBets, {});

  // 推进到 betting
  ctx.now = state.deadlineAt!;
  const toBettingRes = reduce(
    ctx,
    state,
    { kind: 'system', source: 'timer' },
    { type: 'phase_timeout', roundToken: state.roundToken, phaseEpoch: state.phaseEpoch, phase: 'arranging' },
  );
  assert.ok(toBettingRes.ok);
  state = toBettingRes.nextState;

  const bettingView = buildPublicView(state);
  assert.equal(bettingView.phase, 'betting');
  assert.ok(Object.keys(bettingView.publicBets).length === 3);

  const p1BettingView = buildPlayerView(state, 'p1');
  assert.equal(p1BettingView.me?.canGuess, false);
  assert.equal(p1BettingView.me?.canBet, true);
});

test('views: settlement 与 game_over 阶段 revealed/result 投影', () => {
  const ctx = createMockCtx(1000);
  let state = createInitialState(ctx, ['p1', 'p2', 'p3'], {});
  const beginRes = reduce(ctx, state, { kind: 'system', source: 'admin' }, { type: 'begin' });
  assert.ok(beginRes.ok);
  state = beginRes.nextState;

  for (const pid of state.players) {
    const g = reduce(ctx, state, { kind: 'player', playerId: pid }, { type: 'submit_guess', roundToken: state.roundToken, expectedRevision: 0, value: 100 });
    assert.ok(g.ok);
    state = g.nextState;
  }
  ctx.now = state.deadlineAt!;
  const arrTimeout = reduce(ctx, state, { kind: 'system', source: 'timer' }, { type: 'phase_timeout', roundToken: state.roundToken, phaseEpoch: state.phaseEpoch, phase: 'arranging' });
  assert.ok(arrTimeout.ok);
  state = arrTimeout.nextState;

  ctx.now = state.deadlineAt!;
  const betTimeout = reduce(ctx, state, { kind: 'system', source: 'timer' }, { type: 'phase_timeout', roundToken: state.roundToken, phaseEpoch: state.phaseEpoch, phase: 'betting' });
  assert.ok(betTimeout.ok);
  state = betTimeout.nextState;

  assert.equal(state.phase, 'settlement');
  const settlementView = buildPublicView(state);
  assert.ok(settlementView.revealed !== null);
  assert.equal(settlementView.revealed?.round, 1);
  assert.equal(settlementView.history.length, 1);
  assert.equal(settlementView.result, null);
});
