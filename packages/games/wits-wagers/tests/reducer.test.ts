import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../server/state.ts';
import { reduce } from '../server/reducer.ts';
import { assertInvariants } from '../server/invariants.ts';
import type { GameContext, RandomSource, Actor, GameEffect } from '@ldj/shared';

function createMockCtx(now = 1000): GameContext {
  let counter = 0;
  const mockRandom: RandomSource = {
    nextInt: (min, max) => {
      counter++;
      return min + (counter % (max - min));
    },
    shuffle: (items) => [...items],
  };
  return { now, random: mockRandom };
}

test('reducer: begin 进入第 1 轮 answering 并产生首个 timer effect', () => {
  const ctx = createMockCtx(1000);
  const state = createInitialState(ctx, ['p1', 'p2', 'p3'], { answerSeconds: 30 });

  const adminActor: Actor = { kind: 'system', source: 'admin' };
  const playerActor: Actor = { kind: 'player', playerId: 'p1' };

  // 玩家不可发起 begin
  const playerRes = reduce(ctx, state, playerActor, { type: 'begin' });
  assert.equal(playerRes.ok, false);
  if (!playerRes.ok) {
    assert.equal(playerRes.code, 'ACTOR_NOT_ALLOWED');
  }

  // 系统发起 begin
  const res = reduce(ctx, state, adminActor, { type: 'begin' });
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.nextState.phase, 'answering');
    assert.equal(res.nextState.round, 1);
    assert.equal(res.nextState.phaseEpoch, 1);
    assert.ok(res.nextState.roundToken.length > 0);
    assert.equal(res.nextState.deadlineAt, 1000 + 30000);

    // 检查 timer effect
    assert.equal(res.effects.length, 1);
    const eff = res.effects[0] as GameEffect & { type: 'schedule_timer' };
    assert.equal(eff.type, 'schedule_timer');
    assert.equal(eff.deadlineAt, 1000 + 30000);
    assert.equal(eff.timerId, `ww:${res.nextState.roundToken}:1`);

    // 检查事件
    assert.equal(res.publicEvents.length, 1);
    assert.equal(res.publicEvents[0]?.type, 'round_started');

    assertInvariants(res.nextState);
  }
});

test('reducer: submit_guess 正常提交与全员答齐提前推进', () => {
  const ctx = createMockCtx(1000);
  let state = createInitialState(ctx, ['p1', 'p2', 'p3'], {});
  const beginRes = reduce(ctx, state, { kind: 'system', source: 'admin' }, { type: 'begin' });
  assert.ok(beginRes.ok);
  state = beginRes.nextState;

  // p1 提交 100
  const p1Res = reduce(
    ctx,
    state,
    { kind: 'player', playerId: 'p1' },
    {
      type: 'submit_guess',
      roundToken: state.roundToken,
      expectedRevision: 0,
      value: 100,
    },
  );
  assert.ok(p1Res.ok);
  state = p1Res.nextState;
  assert.equal(state.phase, 'answering'); // 还未全员提交，保持 answering
  assert.equal(state.guesses['p1']?.value, 100);
  assert.equal(state.guessRevisions['p1'], 1);

  // p1 重复以旧 revision 提交被拒绝 (STALE_REVISION)
  const staleRes = reduce(
    ctx,
    state,
    { kind: 'player', playerId: 'p1' },
    {
      type: 'submit_guess',
      roundToken: state.roundToken,
      expectedRevision: 0,
      value: 120,
    },
  );
  assert.equal(staleRes.ok, false);
  if (!staleRes.ok) {
    assert.equal(staleRes.code, 'STALE_REVISION');
  }

  // p2 提交 200
  const p2Res = reduce(
    ctx,
    state,
    { kind: 'player', playerId: 'p2' },
    {
      type: 'submit_guess',
      roundToken: state.roundToken,
      expectedRevision: 0,
      value: 200,
    },
  );
  assert.ok(p2Res.ok);
  state = p2Res.nextState;

  // p3 提交 300（全员答齐，依 G0 P3 立即提前翻牌进入 arranging）
  const p3Res = reduce(
    ctx,
    state,
    { kind: 'player', playerId: 'p3' },
    {
      type: 'submit_guess',
      roundToken: state.roundToken,
      expectedRevision: 0,
      value: 300,
    },
  );
  assert.ok(p3Res.ok);
  state = p3Res.nextState;

  assert.equal(state.phase, 'arranging');
  assert.equal(state.board.length, 4); // smaller + g:100 + g:200 + g:300

  // 必须产生 cancel 旧 timer 和 schedule 新 timer 的 effects
  assert.equal(p3Res.effects.length, 2);
  const cancelEff = p3Res.effects[0];
  const scheduleEff = p3Res.effects[1] as GameEffect & { type: 'schedule_timer' };
  assert.equal(cancelEff?.type, 'cancel_timer');
  assert.equal(scheduleEff?.type, 'schedule_timer');
  assert.equal(scheduleEff?.deadlineAt, ctx.now + state.config.arrangingSeconds * 1000);

  assertInvariants(state);
});

test('reducer: answering 超时未提交者自动补 1 (G0 P1)', () => {
  const ctx = createMockCtx(1000);
  let state = createInitialState(ctx, ['p1', 'p2', 'p3'], {});
  const beginRes = reduce(ctx, state, { kind: 'system', source: 'admin' }, { type: 'begin' });
  assert.ok(beginRes.ok);
  state = beginRes.nextState;

  // 仅 p1 提交
  const p1Res = reduce(
    ctx,
    state,
    { kind: 'player', playerId: 'p1' },
    {
      type: 'submit_guess',
      roundToken: state.roundToken,
      expectedRevision: 0,
      value: 500,
    },
  );
  assert.ok(p1Res.ok);
  state = p1Res.nextState;

  // 时间推进到 deadline
  ctx.now = state.deadlineAt!;

  const timeoutRes = reduce(
    ctx,
    state,
    { kind: 'system', source: 'timer' },
    {
      type: 'phase_timeout',
      roundToken: state.roundToken,
      phaseEpoch: state.phaseEpoch,
      phase: 'answering',
    },
  );
  assert.ok(timeoutRes.ok);
  state = timeoutRes.nextState;

  assert.equal(state.phase, 'arranging');
  assert.equal(state.guesses['p1']?.origin, 'submitted');
  assert.equal(state.guesses['p2']?.value, 1);
  assert.equal(state.guesses['p2']?.origin, 'timeout');
  assert.equal(state.guesses['p3']?.value, 1);
  assert.equal(state.guesses['p3']?.origin, 'timeout');

  const target1 = state.board.find((t) => t.id === 'g:1');
  assert.ok(target1);
  assert.deepEqual(target1.timeoutAuthors, ['p2', 'p3']);

  assertInvariants(state);
});

test('reducer: set_bets 校验、资金不足拒绝 (X01) 与非法目标拒绝 (X02)', () => {
  const ctx = createMockCtx(1000);
  let state = createInitialState(ctx, ['p1', 'p2', 'p3'], {});
  const beginRes = reduce(ctx, state, { kind: 'system', source: 'admin' }, { type: 'begin' });
  assert.ok(beginRes.ok);
  state = beginRes.nextState;

  // 推进到 arranging 并完成
  const g1 = reduce(ctx, state, { kind: 'player', playerId: 'p1' }, { type: 'submit_guess', roundToken: state.roundToken, expectedRevision: 0, value: 100 });
  assert.ok(g1.ok);
  state = g1.nextState;
  const g2 = reduce(ctx, state, { kind: 'player', playerId: 'p2' }, { type: 'submit_guess', roundToken: state.roundToken, expectedRevision: 0, value: 200 });
  assert.ok(g2.ok);
  state = g2.nextState;
  const p3Res = reduce(ctx, state, { kind: 'player', playerId: 'p3' }, { type: 'submit_guess', roundToken: state.roundToken, expectedRevision: 0, value: 300 });
  assert.ok(p3Res.ok);
  state = p3Res.nextState;

  ctx.now = state.deadlineAt!;
  const arrangingTimeoutRes = reduce(
    ctx,
    state,
    { kind: 'system', source: 'timer' },
    {
      type: 'phase_timeout',
      roundToken: state.roundToken,
      phaseEpoch: state.phaseEpoch,
      phase: 'arranging',
    },
  );
  assert.ok(arrangingTimeoutRes.ok);
  state = arrangingTimeoutRes.nextState;
  assert.equal(state.phase, 'betting');

  // X01: 积分超额 (scoreBefore=0, extraStake 试图下 1)
  const x01Res = reduce(
    ctx,
    state,
    { kind: 'player', playerId: 'p1' },
    {
      type: 'set_bets',
      roundToken: state.roundToken,
      expectedRevision: 0,
      chips: [
        { chipId: 'A', targetId: 'g:100', extraStake: 1 },
        { chipId: 'B', targetId: null, extraStake: 0 },
      ],
    },
  );
  assert.equal(x01Res.ok, false);
  if (!x01Res.ok) {
    assert.equal(x01Res.code, 'INSUFFICIENT_FUNDS');
  }

  // X02: 押注不在版图上的非法目标
  const x02Res = reduce(
    ctx,
    state,
    { kind: 'player', playerId: 'p1' },
    {
      type: 'set_bets',
      roundToken: state.roundToken,
      expectedRevision: 0,
      chips: [
        { chipId: 'A', targetId: 'g:999999' as const, extraStake: 0 },
        { chipId: 'B', targetId: null, extraStake: 0 },
      ],
    },
  );
  assert.equal(x02Res.ok, false);
  if (!x02Res.ok) {
    assert.equal(x02Res.code, 'INVALID_TARGET');
  }

  // 正常合法下注 (0 extraStake)
  const validBetRes = reduce(
    ctx,
    state,
    { kind: 'player', playerId: 'p1' },
    {
      type: 'set_bets',
      roundToken: state.roundToken,
      expectedRevision: 0,
      chips: [
        { chipId: 'A', targetId: 'g:100', extraStake: 0 },
        { chipId: 'B', targetId: 'smaller', extraStake: 0 },
      ],
    },
  );
  assert.ok(validBetRes.ok);
  state = validBetRes.nextState;
  assert.equal(state.betRevisions['p1'], 1);
  assertInvariants(state);
});

test('reducer: 虚拟时间完整七轮模拟 (F01 场景全流程)', () => {
  const ctx = createMockCtx(1000);
  let state = createInitialState(ctx, ['p1', 'p2', 'p3'], {});

  // begin
  let res = reduce(ctx, state, { kind: 'system', source: 'admin' }, { type: 'begin' });
  assert.ok(res.ok);
  state = res.nextState;

  for (let r = 1; r <= 7; r++) {
    assert.equal(state.phase, 'answering');
    assert.equal(state.round, r);

    // 三位玩家都提交正确答案对应数值（以第一题答案为例）
    for (const pid of state.players) {
      const gRes = reduce(
        ctx,
        state,
        { kind: 'player', playerId: pid },
        {
          type: 'submit_guess',
          roundToken: state.roundToken,
          expectedRevision: 0,
          value: 100,
        },
      );
      assert.ok(gRes.ok);
      state = gRes.nextState;
    }

    // 全员提交后应已进入 arranging
    assert.equal(state.phase, 'arranging');
    assertInvariants(state);

    // arranging 超时 -> betting
    ctx.now = state.deadlineAt!;
    res = reduce(
      ctx,
      state,
      { kind: 'system', source: 'timer' },
      {
        type: 'phase_timeout',
        roundToken: state.roundToken,
        phaseEpoch: state.phaseEpoch,
        phase: 'arranging',
      },
    );
    assert.ok(res.ok);
    state = res.nextState;
    assert.equal(state.phase, 'betting');
    assertInvariants(state);

    // 每位玩家在 betting 阶段押注 A 在 g:100 押满当前积分，B 押 0
    for (const pid of state.players) {
      const score = state.scores[pid] ?? 0;
      const bRes = reduce(
        ctx,
        state,
        { kind: 'player', playerId: pid },
        {
          type: 'set_bets',
          roundToken: state.roundToken,
          expectedRevision: 0,
          chips: [
            { chipId: 'A', targetId: 'g:100', extraStake: score },
            { chipId: 'B', targetId: 'g:100', extraStake: 0 },
          ],
        },
      );
      assert.ok(bRes.ok);
      state = bRes.nextState;
    }

    // betting 超时 -> settlement
    ctx.now = state.deadlineAt!;
    res = reduce(
      ctx,
      state,
      { kind: 'system', source: 'timer' },
      {
        type: 'phase_timeout',
        roundToken: state.roundToken,
        phaseEpoch: state.phaseEpoch,
        phase: 'betting',
      },
    );
    assert.ok(res.ok);
    state = res.nextState;
    assert.equal(state.phase, 'settlement');
    assert.equal(state.history.length, r);
    assertInvariants(state);

    // settlement 超时
    ctx.now = state.deadlineAt!;
    res = reduce(
      ctx,
      state,
      { kind: 'system', source: 'timer' },
      {
        type: 'phase_timeout',
        roundToken: state.roundToken,
        phaseEpoch: state.phaseEpoch,
        phase: 'settlement',
      },
    );
    assert.ok(res.ok);
    state = res.nextState;
  }

  // 第 7 轮结束后，状态必须为 game_over
  assert.equal(state.phase, 'game_over');
  assert.equal(state.round, 7);
  assert.equal(state.history.length, 7);
  assert.equal(state.deadlineAt, null);
  assert.ok(state.result !== null);
  assert.equal(state.result.roundsPlayed, 7);
  assert.ok(res.resultCandidate !== null);
  assert.deepEqual(res.resultCandidate, state.result);

  assertInvariants(state);
});

test('reducer: player_forfeited 退席标记与推进', () => {
  const ctx = createMockCtx(1000);
  let state = createInitialState(ctx, ['p1', 'p2', 'p3'], {});
  const beginRes = reduce(ctx, state, { kind: 'system', source: 'admin' }, { type: 'begin' });
  assert.ok(beginRes.ok);
  state = beginRes.nextState;

  // p1 提交
  const g1 = reduce(
    ctx,
    state,
    { kind: 'player', playerId: 'p1' },
    {
      type: 'submit_guess',
      roundToken: state.roundToken,
      expectedRevision: 0,
      value: 100,
    },
  );
  assert.ok(g1.ok);
  state = g1.nextState;

  // p2 提交
  const g2 = reduce(
    ctx,
    state,
    { kind: 'player', playerId: 'p2' },
    {
      type: 'submit_guess',
      roundToken: state.roundToken,
      expectedRevision: 0,
      value: 200,
    },
  );
  assert.ok(g2.ok);
  state = g2.nextState;

  assert.equal(state.phase, 'answering');

  // p3 退席 -> 此时剩余活跃玩家 (p1, p2) 均已提交，触发提前进入 arranging
  const forfeitRes = reduce(
    ctx,
    state,
    { kind: 'system', source: 'admin' },
    {
      type: 'player_forfeited',
      playerIds: ['p3'],
    },
  );
  assert.ok(forfeitRes.ok);
  state = forfeitRes.nextState;
  assert.ok(state.forfeitedIds.includes('p3'));
  assert.equal(state.phase, 'arranging');
  assertInvariants(state);
});
