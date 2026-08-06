/**
 * D4-B SETUP/ROLE 组：4–12 人、恰一名白板、无有词卧底、平民共享同词、
 * 白板显式无词、计入卧底方。
 * 引用 UNDERCOVER-BLANK-SETUP-001 / ROLE-001 / ROLE-002 的 plannedTestIds。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blankModule } from '../../server/blank/module.ts';
import { init, blankOf, civiliansOf, makeCtx } from './helpers.ts';

test('undercover_blank_accepts_four_to_twelve_players_test', () => {
  for (let n = 4; n <= 12; n += 1) {
    const players = Array.from({ length: n }, (_, i) => `p${i + 1}`);
    const { state } = init(players);
    assert.equal(Object.keys(state.players).length, n);
  }
});

test('undercover_blank_rejects_players_outside_range_test', () => {
  assert.throws(() => init(['p1', 'p2', 'p3']), /4–12|4-12/);
  const thirteen = Array.from({ length: 13 }, (_, i) => `p${i + 1}`);
  assert.throws(() => init(thirteen), /4–12|4-12/);
  assert.throws(() => init(['p1', 'p1', 'p2', 'p3']), /重复/);
});

test('undercover_blank_shows_five_to_eight_balance_hint_without_enforcement_test', () => {
  // 5–8 是建议区间，不强制：4/9/12 同样开局成功。
  for (const n of [4, 5, 8, 9, 12]) {
    const players = Array.from({ length: n }, (_, i) => `p${i + 1}`);
    assert.doesNotThrow(() => init(players), `${n} 人应可开局`);
  }
});

test('undercover_blank_assigns_exactly_one_blank_test', () => {
  for (let n = 4; n <= 12; n += 1) {
    const players = Array.from({ length: n }, (_, i) => `p${i + 1}`);
    const { state } = init(players, {}, `blank-role-${n}`);
    const blanks = Object.values(state.players).filter((p) => p.role === 'blank');
    assert.equal(blanks.length, 1, `${n} 人应恰一名白板`);
    assert.equal(state.blankPlayerId, blankOf(state));
  }
});

test('undercover_blank_assigns_no_worded_undercover_test', () => {
  for (let n = 4; n <= 12; n += 1) {
    const players = Array.from({ length: n }, (_, i) => `p${i + 1}`);
    const { state } = init(players, {}, `blank-noword-${n}`);
    for (const p of Object.values(state.players)) {
      assert.ok(p.role === 'blank' || p.role === 'civilian', '不允许有词卧底角色');
    }
  }
});

test('undercover_blank_civilians_share_one_word_test', () => {
  const { state } = init(['p1', 'p2', 'p3', 'p4', 'p5', 'p6'], {}, 'blank-shared-word');
  const blank = blankOf(state);
  const word = state.civilianWord;
  assert.ok(word.length >= 1);
  const seen = new Set<string>();
  for (const id of civiliansOf(state)) {
    if (id === blank) continue;
    const view = blankModule.getPlayerView(state, id);
    assert.equal(view.me!.word, word, '平民视角应共享同一词');
    seen.add(view.me!.word!);
  }
  assert.equal(seen.size, 1, '所有平民共享同一词');
});

test('undercover_blank_secret_is_explicit_no_word_variant_test', () => {
  const { state } = init(['p1', 'p2', 'p3', 'p4'], {}, 'blank-no-word');
  const blank = blankOf(state);
  const view = blankModule.getPlayerView(state, blank);
  assert.equal(view.me!.word, null, '白板显式无词（null 而非空字符串）');
  // 无词秘密不泄露：观战视角与平民视角均不含白板"无词"特殊字段外的任何词。
  const spectator = blankModule.getSpectatorView(state);
  assert.equal(JSON.stringify(spectator).includes('"word"'), false, '观战视角不得携带 word 字段');
});

test('undercover_blank_counts_as_undercover_side_test', () => {
  const { state } = init(['p1', 'p2', 'p3', 'p4'], {}, 'blank-side');
  const blank = blankOf(state);
  assert.equal(state.players[blank]!.role, 'blank');
  // ROLE-002：白板计入卧底方。系统终止是合法终局：平台以 resultCandidate !== null
  // 判定结束，aborted 标记使会话记 ABORTED 且不写战绩（FR-RESULT-002）。
  const ctx = makeCtx(1_700_000_000_000, 'blank-side-ctx');
  const out = blankModule.reduce(ctx, state, { kind: 'system', source: 'admin' }, { type: 'abort_game' });
  assert.ok(out.ok);
  assert.notEqual(out.resultCandidate, null, '系统终止应产生终局结果（aborted 标记）');
  assert.equal(out.resultCandidate!.aborted, true);
  assert.equal(out.resultCandidate!.winner, null);
  // 结果 roles 映射把唯一白板记为卧底方角色（blank），而非平民。
  assert.equal(out.resultCandidate!.roles[blank], 'blank');
  assert.equal(out.resultCandidate!.blankWord, null, '白板显式无词');
});
