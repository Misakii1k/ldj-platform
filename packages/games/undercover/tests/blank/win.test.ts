/**
 * D4-B WIN 组：白板+一名平民立即获胜；阈值前不获胜；
 * 更早提交的待定猜词使生存终局保持暂存。
 * 引用 UNDERCOVER-BLANK-WIN-001 的 plannedTestIds。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  scenario,
  reduce,
  reduceSystem,
  makeCtx,
  adjudicationResult,
  type ReduceOutcome,
} from './helpers.ts';

function voteAll(
  state: Parameters<typeof reduce>[0],
  targets: Record<string, string>,
  ctx = makeCtx(1_700_000_000_100, 'win-vote'),
): ReduceOutcome {
  let current = state;
  let out: ReduceOutcome | null = null;
  for (const id of Object.keys(current.players)) {
    if (!current.players[id]!.alive) continue;
    out = reduce(current, id, { type: 'cast_vote', targetPlayerId: targets[id]! }, ctx);
    current = out.state;
    if (current.phase === 'vote_result' || current.phase === 'final_guess' || current.phase === 'game_over') break;
  }
  return out!;
}

function finalizeAfterVote(out: ReduceOutcome, ctx = makeCtx(1_700_000_000_500, 'win-finalize')): ReduceOutcome {
  if (out.state.phase !== 'vote_result' || out.state.pendingOutcome?.next !== 'game_over') return out;
  return reduceSystem(out.state, { type: 'vote_result_elapsed', round: out.state.round }, ctx);
}

test('undercover_blank_wins_at_blank_plus_one_civilian_test', () => {
  // c3 已在先前轮次淘汰；本轮把 c2 投出 → 剩 b + c1（平民=1）→ 白板胜。
  const state = scenario({
    roles: { b: 'blank', c1: 'civilian', c2: 'civilian', c3: 'civilian' },
    alive: { c3: false },
  });
  const out = finalizeAfterVote(voteAll(state, { b: 'c2', c1: 'c2', c2: 'b', c3: 'b' }));
  assert.equal(out.state.phase, 'game_over', '白板+一名平民应立即终局');
  assert.equal(out.state.winner, 'blank');
  assert.equal(out.resultCandidate?.winner, 'blank');
  assert.equal(out.resultCandidate?.side, 'blank');
});

test('undercover_blank_does_not_win_before_threshold_test', () => {
  // c4 已淘汰；本轮把 c3 投出 → 剩 b + c1 + c2（平民=2）→ 未到阈值。
  const state = scenario({
    roles: { b: 'blank', c1: 'civilian', c2: 'civilian', c3: 'civilian', c4: 'civilian' },
    alive: { c4: false },
  });
  const out = voteAll(state, { b: 'c3', c1: 'c3', c2: 'c3', c3: 'b', c4: 'b' });
  assert.notEqual(out.state.phase, 'game_over');
  assert.equal(out.state.winner, null);
  assert.equal(out.resultCandidate, null);
});

test('undercover_blank_survival_outcome_stays_provisional_when_earlier_guess_pending_test', () => {
  const state = scenario({
    roles: { b: 'blank', c1: 'civilian', c2: 'civilian', c3: 'civilian' },
    alive: { c3: false },
    guess: {
      taskId: 'blank.b.1',
      playerId: 'b',
      submittedAtSeq: 1,
      phase: 'active',
      status: 'pending',
      normalizedGuess: '苹果',
      normalizedStandardAnswer: '苹果',
      resolvedClassification: null,
      resolvedSource: null,
    },
  });
  const out = voteAll(state, { b: 'c2', c1: 'c2', c2: 'b', c3: 'b' });
  // 白板+一名平民的生存终局应保持暂存：不终局、记录 deferredOutcome。
  assert.notEqual(out.state.phase, 'game_over', '待定猜词期间生存终局不得直接终局');
  assert.ok(out.state.deferredOutcome, '应记录暂存结果');
  assert.equal(out.state.deferredOutcome!.winner, 'blank');
  assert.equal(out.state.deferredOutcome!.taskId, 'blank.b.1');
  assert.equal(out.resultCandidate, null);
  // 更早的 equivalent 猜词覆盖暂存结果 → 白板获胜。
  const resolved = reduceSystem(
    out.state,
    {
      type: 'external_task_result',
      taskId: 'blank.b.1',
      expectedSequence: 1,
      result: adjudicationResult('equivalent'),
    },
    makeCtx(1_700_000_000_200, 'win-resolve-eq'),
  );
  assert.equal(resolved.state.phase, 'game_over');
  assert.equal(resolved.state.winner, 'blank');
  assert.equal(resolved.state.deferredOutcome, null);
});
