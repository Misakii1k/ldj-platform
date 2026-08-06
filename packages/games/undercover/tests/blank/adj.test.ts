/**
 * D4-B ADJ 组（模块边界）：裁判任务只携带批准的最小 provider 字段
 * （ADJ-002 provider 隐私）；结构化、有界输出与仅 equivalent 判正确
 * （ADJ-001 模块侧裁决应用）。本地精确匹配/主备模型链由共享策略与
 * 平台 AdjudicationRunner 测试覆盖（见 docs/superpowers/reports/2026-08-05-d4-b-results.md）。
 * 引用 UNDERCOVER-BLANK-ADJ-001/002 的 plannedTestIds。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ADJUDICATION_POLICY_VERSION } from '@ldj/shared';
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

function submitGuess(guess = '苹果', sessionId = 's-adj') {
  const state = scenario({ roles: ROLES });
  return reduce(state, 'b', blankGuessAction(guess, sessionId), makeCtx(1_700_000_000_100, 'adj'));
}

function resolve(out: ReturnType<typeof submitGuess>, verdict: 'equivalent' | 'not_equivalent', taskId = 'blank.b.1') {
  return reduceSystem(
    out.state,
    {
      type: 'external_task_result',
      taskId,
      expectedSequence: 1,
      result: adjudicationResult(verdict),
    },
    makeCtx(1_700_000_000_200, 'adj-resolve'),
  );
}

test('undercover_blank_provider_payload_contains_only_approved_fields_test', () => {
  const out = submitGuess('苹果');
  const effect = adjudicationEffect(out)!;
  const payload = JSON.parse(effect.inputPlaintextJson!) as Record<string, unknown>;
  assert.deepEqual(
    Object.keys(payload).sort(),
    ['adjudicationPolicyVersion', 'normalizedGuess', 'normalizedStandardAnswer'],
    'provider 只见标准词、猜词与政策版本',
  );
  assert.equal(payload.normalizedStandardAnswer, out.state.civilianWord);
  assert.equal(payload.normalizedGuess, '苹果');
  assert.equal(payload.adjudicationPolicyVersion, ADJUDICATION_POLICY_VERSION);
  // 玩家/角色/会话等游戏秘密不进入 payload。
  assert.ok(!('playerId' in payload) && !('role' in payload) && !('sessionId' in payload), 'payload 不含游戏秘密字段');
});

test('undercover_blank_provider_output_is_structured_and_timeout_bounded_test', () => {
  const out = submitGuess();
  // 非结构化/缺 verdict 的结果被防御性忽略，任务保持 pending。
  const ignored = reduceSystem(
    out.state,
    { type: 'external_task_result', taskId: 'blank.b.1', expectedSequence: 1, result: { foo: 'bar' } },
    makeCtx(1_700_000_000_200, 'adj-ignore'),
  );
  assert.equal(ignored.state.guess!.status, 'pending', '无 verdict 的结果不得应用');
  assert.equal(ignored.state.phase, 'voting');
  // 结构化 verdict 才应用。
  assert.equal(resolve(out, 'equivalent').state.phase, 'game_over');
});

test('undercover_blank_only_equivalent_is_correct_test', () => {
  const eq = resolve(submitGuess(), 'equivalent');
  assert.equal(eq.state.phase, 'game_over');
  assert.equal(eq.state.winner, 'blank');
  assert.equal(eq.resultCandidate!.winner, 'blank');

  const ne = resolve(submitGuess(), 'not_equivalent');
  assert.equal(ne.state.phase, 'game_over');
  assert.equal(ne.state.winner, 'civilian', '只有 equivalent 判正确；否则按猜错');
  assert.equal(ne.resultCandidate!.winner, 'civilian');
});
