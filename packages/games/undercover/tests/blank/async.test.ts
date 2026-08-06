/**
 * D4-B ASYNC 组：裁判任务在房间事务外运行，pending 猜词不阻塞发言/投票/
 * 加赛流程（ASYNC-001）；提交即冻结资格与序号，更早 equivalent 覆盖暂存普通
 * 结果，wrong 确认/继续普通结果（ASYNC-002）。
 * 引用 UNDERCOVER-BLANK-ASYNC-001/002 的 plannedTestIds。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  scenario,
  reduce,
  reduceSystem,
  makeCtx,
  voteToEliminate,
  adjudicationResult,
  blankGuessAction,
} from './helpers.ts';

const ROLES = { b: 'blank', c1: 'civilian', c2: 'civilian', c3: 'civilian' } as const;
const NOW = 1_700_000_000_100;

function submitPendingGuess(phase: 'speaking' | 'voting' = 'voting') {
  const state = scenario({ roles: ROLES, phase });
  return reduce(state, 'b', blankGuessAction('苹果'), makeCtx(NOW, 'async'));
}

test('undercover_blank_pending_adjudication_does_not_block_speaking_test', () => {
  const g = submitPendingGuess('speaking');
  assert.equal(g.state.guess!.status, 'pending');
  // 当前发言者照常结束发言，进入下一位（pending 不阻塞发言推进）。
  const before = g.state.currentSpeakerIndex;
  const cur = g.state.speakingOrder[g.state.currentSpeakerIndex]!;
  const next = reduce(g.state, cur, { type: 'finish_speech' }, makeCtx(NOW + 1_000, 'async-speak'));
  assert.equal(next.state.guess!.status, 'pending');
  assert.ok(next.state.currentSpeakerIndex > before || next.state.phase === 'voting', '发言推进不被 pending 阻塞');
});

test('undercover_blank_pending_adjudication_does_not_block_voting_or_runoff_test', () => {
  const g = submitPendingGuess('voting');
  assert.equal(g.state.guess!.status, 'pending');
  // 投票照常结算：投出平民 c1 → 未到阈值，进入 vote_result 并计划下一轮。
  const out = voteToEliminate(g.state, 'c1', makeCtx(NOW + 1_000, 'async-vote'));
  assert.equal(out.state.phase, 'vote_result', '投票结算不被 pending 阻塞');
  assert.equal(out.state.pendingOutcome!.next, 'next_round');
  assert.equal(out.state.guess!.status, 'pending');
});

test('undercover_blank_submission_freezes_eligibility_and_sequence_test', () => {
  const g = submitPendingGuess();
  // 序号不符 → 忽略；taskId 不符 → 忽略；两者都匹配才应用。
  const wrongSeq = reduceSystem(
    g.state,
    { type: 'external_task_result', taskId: 'blank.b.1', expectedSequence: 99, result: adjudicationResult('equivalent') },
    makeCtx(NOW + 1_000, 'async-seq'),
  );
  assert.equal(wrongSeq.state.guess!.status, 'pending', 'expectedSequence 不符不得应用');
  const wrongId = reduceSystem(
    g.state,
    { type: 'external_task_result', taskId: 'blank.other.2', expectedSequence: 1, result: adjudicationResult('equivalent') },
    makeCtx(NOW + 1_000, 'async-id'),
  );
  assert.equal(wrongId.state.guess!.status, 'pending', 'taskId 不符不得应用');
  const ok = reduceSystem(
    g.state,
    { type: 'external_task_result', taskId: 'blank.b.1', expectedSequence: 1, result: adjudicationResult('equivalent') },
    makeCtx(NOW + 1_000, 'async-ok'),
  );
  assert.equal(ok.state.phase, 'game_over');
  assert.equal(ok.state.winner, 'blank');
});

test('undercover_blank_wrong_guess_confirms_or_continues_ordinary_outcome_test', () => {
  // 前提：c3 已淘汰；白板主动猜词 pending；随后普通投票把 c2 投出 → 剩 b + c1 → 生存终局暂存。
  const state = scenario({ roles: ROLES, alive: { c3: false }, phase: 'voting' });
  const g = reduce(state, 'b', blankGuessAction('苹果'), makeCtx(NOW, 'async-wrong'));
  assert.equal(g.state.guess!.status, 'pending');
  const out = voteToEliminate(g.state, 'c2', makeCtx(NOW + 1_000, 'async-wrong'));
  assert.ok(out.state.deferredOutcome, '待定猜词期间普通终局暂存');
  assert.equal(out.state.deferredOutcome!.winner, 'blank');
  // wrong（not_equivalent）：白板立即淘汰并确认/覆盖普通结果 → 平民胜。
  const resolved = reduceSystem(
    out.state,
    { type: 'external_task_result', taskId: 'blank.b.1', expectedSequence: 1, result: adjudicationResult('not_equivalent') },
    makeCtx(NOW + 2_000, 'async-wrong-resolve'),
  );
  assert.equal(resolved.state.phase, 'game_over');
  assert.equal(resolved.state.winner, 'civilian');
  assert.equal(resolved.state.deferredOutcome, null);
  assert.equal(resolved.state.players.b!.alive, false);
  assert.equal(resolved.state.players.b!.exitReason, 'guess_wrong');
});
