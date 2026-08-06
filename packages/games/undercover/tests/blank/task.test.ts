/**
 * D4-B TASK 组（模块边界）：裁判任务唯一 taskId、终局后迟到结果丢弃、
 * 明文仅在 pending 保留（结果应用后擦除、只留受限审计元数据）。
 * 重启恢复与重放零 provider 调用属平台 recovery/replay（P3，见 B report）。
 * 引用 UNDERCOVER-BLANK-TASK-001/002 的 plannedTestIds。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  scenario,
  reduce,
  reduceSystem,
  makeCtx,
  adjudicationEffect,
  adjudicationResult,
  blankGuessAction,
} from './helpers.ts';

const ROLES = { b: 'blank', c1: 'civilian', c2: 'civilian', c3: 'civilian' } as const;
const NOW = 1_700_000_000_100;

function submitGuess(guess = '苹果') {
  const state = scenario({ roles: ROLES });
  return reduce(state, 'b', blankGuessAction(guess), makeCtx(NOW, 'task'));
}

test('undercover_blank_adjudication_task_id_is_unique_test', () => {
  const out = submitGuess();
  const effect = adjudicationEffect(out)!;
  assert.match(effect.taskId, /^blank\.b\.\d+$/, 'taskId 以 blank.<playerId>.<seq> 唯一标识');
  assert.equal(effect.submittedAtSeq, 1);
  assert.equal(out.state.guess!.taskId, effect.taskId);
  // 序号随提交单调递增（本局首次为 1），任务结果回灌按 expectedSequence 匹配。
  assert.equal(out.state.taskSeq, effect.submittedAtSeq);
});

test('undercover_blank_late_result_after_final_is_ignored_test', () => {
  const out = submitGuess();
  const resolved = reduceSystem(
    out.state,
    { type: 'external_task_result', taskId: 'blank.b.1', expectedSequence: 1, result: adjudicationResult('equivalent') },
    makeCtx(NOW + 1_000, 'task-resolve'),
  );
  assert.equal(resolved.state.phase, 'game_over');
  assert.equal(resolved.state.winner, 'blank');
  // 终局后迟到的结果一律丢弃：状态与结果候选保持不变。
  const late = reduceSystem(
    resolved.state,
    { type: 'external_task_result', taskId: 'blank.b.1', expectedSequence: 1, result: adjudicationResult('not_equivalent') },
    makeCtx(NOW + 2_000, 'task-late'),
  );
  assert.deepEqual(late.state, resolved.state, '终局后迟到结果被丢弃');
  assert.equal(late.resultCandidate!.winner, 'blank');
});

test('undercover_blank_pending_task_persists_only_required_plaintext_test', () => {
  const out = submitGuess();
  assert.equal(out.state.guess!.normalizedGuess, '苹果', 'pending 期间保留猜词明文');
  assert.equal(out.state.guess!.normalizedStandardAnswer, out.state.civilianWord, 'pending 期间保留标准词明文');
  const effect = adjudicationEffect(out)!;
  assert.ok(effect.inputPlaintextJson, 'pending 任务携带最小明文载荷');
});

test('undercover_blank_applied_task_erases_answer_and_guess_plaintext_test', () => {
  const out = submitGuess();
  const resolved = reduceSystem(
    out.state,
    { type: 'external_task_result', taskId: 'blank.b.1', expectedSequence: 1, result: adjudicationResult('equivalent') },
    makeCtx(NOW + 1_000, 'task-erase'),
  );
  assert.equal(resolved.state.guess!.status, 'resolved_equivalent');
  assert.equal(resolved.state.guess!.normalizedGuess, null, '结果应用后擦除猜词明文');
  assert.equal(resolved.state.guess!.normalizedStandardAnswer, null, '结果应用后擦除标准词明文');
});

test('undercover_blank_applied_task_retains_only_bounded_audit_metadata_test', () => {
  const out = submitGuess();
  const resolved = reduceSystem(
    out.state,
    {
      type: 'external_task_result',
      taskId: 'blank.b.1',
      expectedSequence: 1,
      result: adjudicationResult('not_equivalent', 'not_equivalent', 'fallback'),
    },
    makeCtx(NOW + 1_000, 'task-audit'),
  );
  assert.equal(resolved.state.guess!.resolvedClassification, 'not_equivalent');
  assert.equal(resolved.state.guess!.resolvedSource, 'fallback');
  assert.equal(resolved.state.guess!.resolvedClassification, 'not_equivalent');
  assert.equal(resolved.state.guess!.normalizedGuess, null, '审计元数据不含明文');
});
