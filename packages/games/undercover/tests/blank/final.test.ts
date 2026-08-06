/**
 * D4-B FINAL 组：被投票淘汰且未猜词的白板开启 30 秒终局猜词；
 * 身份公开时机（immediate/delayed）；已消耗机会不开启；终局猜词提交一次/
 * 跳过按错/超时按错；规则机器人从不主动猜词并在终局直接跳过。
 * 引用 UNDERCOVER-BLANK-FINAL-001/002 的 plannedTestIds。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSeededRandom } from '@ldj/shared';
import { blankModule } from '../../server/blank/module.ts';
import {
  scenario,
  reduce,
  reduceSystem,
  makeCtx,
  voteToEliminate,
  blankGuessAction,
  expectDeny,
  type ReduceOutcome,
} from './helpers.ts';

const ROLES = { b: 'blank', c1: 'civilian', c2: 'civilian', c3: 'civilian' } as const;
const VOTE_NOW = 1_700_000_000_100;

/** 用全部存活玩家投票把 target 投出。 */
function voteOut(state: Parameters<typeof reduce>[0], target: string): ReduceOutcome {
  return voteToEliminate(state, target, makeCtx(VOTE_NOW, 'final-vote'));
}

test('undercover_blank_voted_out_unused_opportunity_opens_final_guess_test', () => {
  const state = scenario({ roles: ROLES });
  assert.equal(state.guess, null, '前提：白板从未猜词');
  const out = voteOut(state, 'b');
  assert.equal(out.state.phase, 'final_guess', '未猜词的白板被投票淘汰应开启终局猜词');
  assert.equal(out.state.players.b!.alive, false);
  assert.equal(out.state.players.b!.exitReason, 'voted_out');
  assert.equal(out.state.guess, null, '终局机会尚未消耗');
  const view = blankModule.getPlayerView(out.state, 'b');
  assert.equal(view.me!.canSubmitFinalGuess, true);
});

test('undercover_blank_final_guess_deadline_is_thirty_seconds_test', () => {
  const ctx = makeCtx(1_700_000_000_000, 'final-deadline');
  const state = scenario({ roles: ROLES });
  const out = voteToEliminate(state, 'b', ctx);
  assert.equal(out.state.phase, 'final_guess');
  assert.equal(out.state.deadlineAt, ctx.now + 30_000, '终局猜词截止 = 30 秒');
  const timer = out.effects.find((e) => e.type === 'schedule_timer') as
    | { type: 'schedule_timer'; timerId: string; deadlineAt: number }
    | undefined;
  assert.ok(timer, '应调度终局猜词计时器');
  assert.equal(timer!.deadlineAt, ctx.now + 30_000);
});

test('undercover_blank_immediate_mode_reveals_identity_before_final_guess_test', () => {
  const state = scenario({ roles: ROLES, revealMode: 'immediate' });
  const out = voteOut(state, 'b');
  assert.equal(out.state.phase, 'final_guess');
  const spectator = blankModule.getSpectatorView(out.state);
  assert.equal(
    spectator.players.find((p) => p.playerId === 'b')!.revealedRole,
    'blank',
    'immediate 模式终局猜词前公开白板身份',
  );
  assert.ok(
    out.events.some((ev) => ev.type === 'player_eliminated' && ev.playerId === 'b' && ev.role === 'blank'),
    'immediate 模式淘汰事件携带白板身份',
  );
});

test('undercover_blank_delayed_mode_does_not_reveal_identity_early_test', () => {
  const state = scenario({ roles: ROLES, revealMode: 'delayed' });
  const out = voteOut(state, 'b');
  assert.equal(out.state.phase, 'final_guess');
  const spectator = blankModule.getSpectatorView(out.state);
  assert.equal(
    spectator.players.find((p) => p.playerId === 'b')!.revealedRole,
    null,
    'delayed 模式终局猜词前不公开白板身份',
  );
  assert.ok(
    out.events.some((ev) => ev.type === 'player_eliminated' && ev.playerId === 'b' && ev.role === null),
    'delayed 模式淘汰事件不携带白板身份',
  );
});

test('undercover_blank_no_final_guess_after_active_submission_test', () => {
  const state = scenario({ roles: ROLES });
  const g = reduce(state, 'b', blankGuessAction('苹果'), makeCtx(VOTE_NOW, 'final-no-final'));
  assert.equal(g.state.guess!.status, 'pending', '前提：已提交主动猜词');
  const out = voteOut(g.state, 'b');
  assert.notEqual(out.state.phase, 'final_guess', '已消耗机会的白板被淘汰不再开终局猜词');
  // 白板（卧底方唯一成员）被淘汰 → 平民方获胜；有 pending 猜词 → 结果暂存。
  assert.equal(out.state.phase, 'vote_result');
  assert.equal(out.state.pendingOutcome!.next, 'game_over');
  assert.equal(out.state.pendingOutcome!.winner, 'civilian');
  assert.ok(out.state.deferredOutcome, '待定猜词期间普通终局暂存');
});

test('undercover_blank_final_guess_submits_once_test', () => {
  const state = scenario({ roles: ROLES, phase: 'final_guess' });
  const out = reduce(state, 'b', { type: 'submit_final_guess', guess: '苹果', sessionId: 's-final' });
  assert.equal(out.state.guess!.status, 'pending');
  assert.equal(out.state.guess!.phase, 'final');
  assert.equal(blankModule.getPlayerView(out.state, 'b').me!.canSubmitFinalGuess, false);
  assert.match(expectDeny(out.state, 'b', { type: 'submit_final_guess', guess: '梨' }).message, /已消耗/);
});

test('undercover_blank_final_skip_is_incorrect_test', () => {
  const state = scenario({ roles: ROLES, phase: 'final_guess' });
  const out = reduce(state, 'b', { type: 'skip_final_guess' });
  assert.ok(out.events.some((ev) => ev.type === 'guess_skipped' && ev.playerId === 'b'));
  assert.equal(out.state.phase, 'game_over');
  assert.equal(out.state.winner, 'civilian', '显式跳过终局猜词按猜错 → 平民胜');
  assert.equal(out.resultCandidate!.winner, 'civilian');
});

test('undercover_blank_final_timeout_is_incorrect_test', () => {
  const state = scenario({ roles: ROLES, phase: 'final_guess', round: 1 });
  const out = reduceSystem(state, { type: 'final_guess_timeout', round: 1 });
  assert.equal(out.state.phase, 'game_over');
  assert.equal(out.state.winner, 'civilian', '终局超时按猜错 → 平民胜');
  assert.equal(out.resultCandidate!.winner, 'civilian');
});

test('undercover_blank_rule_bot_never_actively_guesses_test', () => {
  const random = createSeededRandom('blank-bot');
  for (const phase of ['speaking', 'voting', 'runoff_voting'] as const) {
    const state = scenario({ roles: ROLES, phase });
    const view = blankModule.getPlayerView(state, 'b');
    assert.equal(view.me!.canGuess, true, `${phase} 白板可猜`);
    const action = blankModule.pickBotAction!({ view, playerId: 'b', random });
    assert.notEqual(action?.type, 'submit_guess', `${phase} 机器人不得主动猜词`);
    assert.notEqual(action?.type, 'submit_final_guess', `${phase} 机器人不得提交终局猜词`);
  }
});

test('undercover_blank_rule_bot_skips_final_without_standard_answer_test', () => {
  const state = scenario({ roles: ROLES, phase: 'final_guess' });
  const view = blankModule.getPlayerView(state, 'b');
  assert.equal(view.me!.canSubmitFinalGuess, true);
  assert.equal(view.me!.word, null, '白板视角无标准词，机器人拿不到答案');
  const action = blankModule.pickBotAction!({
    view,
    playerId: 'b',
    random: createSeededRandom('blank-bot-final'),
  });
  assert.deepEqual(action, { type: 'skip_final_guess' }, '机器人跳过终局猜词，不猜');
});
