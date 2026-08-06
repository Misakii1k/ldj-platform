/**
 * D4-B GUESS 组：一次主动秘密猜词、各允许阶段、禁止阶段、第二次拒绝；
 * 对错后果（正确立即获胜 / 错误立即淘汰、机会永久消耗）。
 * 引用 UNDERCOVER-BLANK-GUESS-001/002 的 plannedTestIds。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blankModule } from '../../server/blank/module.ts';
import { scenario, reduce, reduceSystem, makeCtx, adjudicationEffect, adjudicationResult, expectDeny } from './helpers.ts';

const GUESS_ACTION = (guess: string, sessionId = 's-g1') => ({
  type: 'submit_guess' as const,
  guess,
  sessionId,
});

test('undercover_blank_has_exactly_one_guess_opportunity_test', () => {
  const state = scenario({ roles: { b: 'blank', c1: 'civilian', c2: 'civilian', c3: 'civilian' } });
  const out = reduce(state, 'b', GUESS_ACTION('苹果'), makeCtx(1_700_000_000_100, 'g1'));
  assert.ok(out.state.guess, '提交后应存在猜词记录');
  assert.equal(out.state.guess!.status, 'pending');
  assert.equal(blankModule.getPlayerView(out.state, 'b').me!.guessUsed, true);
});

test('undercover_blank_can_guess_in_each_approved_active_phase_test', () => {
  for (const phase of ['speaking', 'voting', 'runoff_voting'] as const) {
    const state = scenario({ roles: { b: 'blank', c1: 'civilian', c2: 'civilian', c3: 'civilian' }, phase });
    const out = reduce(state, 'b', GUESS_ACTION('苹果'), makeCtx(1_700_000_000_100, `g-phase-${phase}`));
    assert.equal(out.state.guess?.status, 'pending', `${phase} 阶段应允许白板猜词`);
    assert.equal(blankModule.getPlayerView(out.state, 'b').me!.canGuess, false, '提交后 canGuess 关闭');
  }
});

test('undercover_blank_guess_is_secret_test', () => {
  const state = scenario({ roles: { b: 'blank', c1: 'civilian', c2: 'civilian', c3: 'civilian' } });
  const secret = '非常秘密的猜词';
  const out = reduce(state, 'b', GUESS_ACTION(secret), makeCtx(1_700_000_000_100, 'g-secret'));
  // 公开事件与视角不含明文
  for (const ev of out.events) {
    assert.equal(JSON.stringify(ev).includes(secret), false, '公开事件不得泄露猜词明文');
  }
  const publicView = blankModule.getSpectatorView(out.state);
  assert.equal(JSON.stringify(publicView).includes(secret), false, '公开视角不得泄露猜词明文');
  // 私有事件只发给白板
  assert.equal(out.privateEvents.length, 1);
  assert.deepEqual(out.privateEvents[0]!.recipients, ['b']);
  assert.equal((out.privateEvents[0]!.event as { taskId: string }).taskId, 'blank.b.1');
  // 公共视图展示裁判在途（等待裁判层）但不泄露词
  assert.equal(out.state.guess?.status, 'pending');
  assert.equal(blankModule.getSpectatorView(out.state).guessPending, true);
  // 其他玩家视角不携带 word 之外的内容
  const c1View = blankModule.getPlayerView(out.state, 'c1');
  assert.equal(JSON.stringify(c1View).includes(secret), false);
});

test('undercover_blank_cannot_guess_before_speaking_or_during_settlement_test', () => {
  // 看词阶段（未开始发言）
  const reveal = scenario({ roles: { b: 'blank', c1: 'civilian', c2: 'civilian', c3: 'civilian' }, phase: 'word_reveal' });
  assert.ok(expectDeny(reveal, 'b', GUESS_ACTION('苹果')).message);
  // 结算阶段（vote_result）
  const settle = scenario({
    roles: { b: 'blank', c1: 'civilian', c2: 'civilian', c3: 'civilian' },
    phase: 'vote_result',
    pendingOutcome: { next: 'next_round', candidates: [], winner: null },
  });
  assert.ok(expectDeny(settle, 'b', GUESS_ACTION('苹果')).message);
  // 终局猜词阶段不允许主动猜词（走 submit_final_guess）
  const final = scenario({ roles: { b: 'blank', c1: 'civilian', c2: 'civilian', c3: 'civilian' }, phase: 'final_guess' });
  assert.ok(expectDeny(final, 'b', GUESS_ACTION('苹果')).message);
});

test('undercover_blank_second_guess_is_rejected_test', () => {
  const state = scenario({ roles: { b: 'blank', c1: 'civilian', c2: 'civilian', c3: 'civilian' } });
  const out = reduce(state, 'b', GUESS_ACTION('苹果'), makeCtx(1_700_000_000_100, 'g2a'));
  const denied = expectDeny(out.state, 'b', GUESS_ACTION('梨'));
  assert.match(denied.message, /已消耗/);
});

test('undercover_blank_active_correct_guess_wins_test', () => {
  const state = scenario({ roles: { b: 'blank', c1: 'civilian', c2: 'civilian', c3: 'civilian' } });
  const out = reduce(state, 'b', GUESS_ACTION('苹果'), makeCtx(1_700_000_000_100, 'g-win'));
  const effect = adjudicationEffect(out);
  assert.ok(effect, '应声明外部裁判任务');
  assert.equal(effect!.taskId, 'blank.b.1');
  assert.equal(effect!.sessionId, 's-g1');
  assert.equal(effect!.submittedAtSeq, 1);
  const resolved = reduceSystem(
    out.state,
    { type: 'external_task_result', taskId: 'blank.b.1', expectedSequence: 1, result: adjudicationResult('equivalent') },
    makeCtx(1_700_000_000_200, 'g-win-resolve'),
  );
  assert.equal(resolved.state.phase, 'game_over');
  assert.equal(resolved.state.winner, 'blank');
  assert.equal(resolved.resultCandidate?.winner, 'blank');
});

test('undercover_blank_active_wrong_guess_eliminates_blank_test', () => {
  const state = scenario({ roles: { b: 'blank', c1: 'civilian', c2: 'civilian', c3: 'civilian' } });
  const out = reduce(state, 'b', GUESS_ACTION('梨'), makeCtx(1_700_000_000_100, 'g-lose'));
  const resolved = reduceSystem(
    out.state,
    { type: 'external_task_result', taskId: 'blank.b.1', expectedSequence: 1, result: adjudicationResult('not_equivalent') },
    makeCtx(1_700_000_000_200, 'g-lose-resolve'),
  );
  assert.equal(resolved.state.phase, 'game_over');
  assert.equal(resolved.state.winner, 'civilian');
  assert.equal(resolved.state.players.b!.alive, false, '白板猜错立即淘汰');
  assert.equal(resolved.state.players.b!.exitReason, 'guess_wrong');
  assert.equal(resolved.resultCandidate?.winner, 'civilian');
});

test('undercover_blank_wrong_guess_never_restores_opportunity_test', () => {
  const state = scenario({ roles: { b: 'blank', c1: 'civilian', c2: 'civilian', c3: 'civilian' } });
  const out = reduce(state, 'b', GUESS_ACTION('梨'), makeCtx(1_700_000_000_100, 'g-consumed'));
  const resolved = reduceSystem(
    out.state,
    { type: 'external_task_result', taskId: 'blank.b.1', expectedSequence: 1, result: adjudicationResult('not_equivalent') },
    makeCtx(1_700_000_000_200, 'g-consumed-resolve'),
  );
  // 机会永久消耗：猜词记录保持 resolved 状态，不可再次提交。
  assert.equal(resolved.state.guess?.status, 'resolved_not_equivalent');
  assert.ok(expectDeny(resolved.state, 'b', GUESS_ACTION('香蕉')).message);
});
