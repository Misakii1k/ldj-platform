/**
 * D4-B NORM 组：模块把 blank-normalization-v1 应用于猜词输入
 * （共享 adjudication-policy 实现策略，此处验证模块集成点）：
 * NFC、折叠 Unicode 空白并 trim、仅 ASCII 大写转小写、保留标点、
 * 不做简繁转换、不做同义词推断；1–64 码点边界，拒绝控制字符/换行。
 * 引用 UNDERCOVER-BLANK-NORM-001/002 的 plannedTestIds。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  scenario,
  reduce,
  makeCtx,
  adjudicationEffect,
  blankGuessAction,
  expectDeny,
} from './helpers.ts';

const ROLES = { b: 'blank', c1: 'civilian', c2: 'civilian', c3: 'civilian' } as const;

/** 提交猜词并返回 effect 中归一化后的猜词明文（模块应用策略的产物）。 */
function normalizedGuessOf(raw: string): string | null {
  const state = scenario({ roles: ROLES });
  const out = reduce(state, 'b', blankGuessAction(raw), makeCtx(1_700_000_000_100, 'norm'));
  const effect = adjudicationEffect(out);
  if (!effect?.inputPlaintextJson) throw new Error(`猜词未声明裁判任务：${raw}`);
  return (JSON.parse(effect.inputPlaintextJson) as { normalizedGuess: string }).normalizedGuess;
}

function expectGuessDeny(raw: string, pattern: RegExp): void {
  const state = scenario({ roles: ROLES });
  assert.match(expectDeny(state, 'b', blankGuessAction(raw)).message, pattern);
}

test('blank_normalization_v1_applies_nfc_test', () => {
  // A(U+0041) + 组合上圈(U+030A) → NFC 合并为 Å(U+00C5)，单码点。
  const nfc = normalizedGuessOf('\u0041\u030a');
  assert.equal(nfc, '\u00c5');
  assert.equal([...nfc].length, 1, 'NFC 合并后为单个码点');
});

test('blank_normalization_v1_trims_and_collapses_unicode_whitespace_test', () => {
  assert.equal(normalizedGuessOf('  苹果  '), '苹果');
  assert.equal(normalizedGuessOf('\u3000苹果\u3000'), '苹果');
  assert.equal(normalizedGuessOf('苹\u3000\u3000果'), '苹 果');
});

test('blank_normalization_v1_lowercases_latin_test', () => {
  assert.equal(normalizedGuessOf('Apple'), 'apple');
});

test('blank_normalization_v1_retains_punctuation_test', () => {
  assert.equal(normalizedGuessOf('Café!'), 'café!');
});

test('blank_normalization_v1_does_not_convert_simplified_traditional_test', () => {
  assert.equal(normalizedGuessOf('苹果'), '苹果');
});

test('blank_normalization_v1_does_not_infer_synonyms_test', () => {
  // 同义词不做本地推断：提交的原词原样进裁判链，绝不映射到标准词。
  const state = scenario({ roles: ROLES });
  assert.equal(state.civilianWord, '苹果');
  assert.equal(normalizedGuessOf('香蕉'), '香蕉');
});

test('blank_normalization_v1_accepts_one_to_sixty_four_code_points_test', () => {
  assert.equal(normalizedGuessOf('苹'), '苹');
  const sixtyFour = 'a'.repeat(64);
  assert.equal(normalizedGuessOf(sixtyFour), sixtyFour);
});

test('blank_normalization_v1_rejects_empty_input_test', () => {
  expectGuessDeny('', /1–64|码点/);
});

test('blank_normalization_v1_rejects_over_sixty_four_code_points_test', () => {
  expectGuessDeny('a'.repeat(65), /1–64|码点/);
});

test('blank_normalization_v1_counts_non_bmp_as_one_code_point_test', () => {
  // emoji 为 non-BMP，计 1 码点：1 + 63 个 ASCII = 64 → 合法。
  assert.equal(normalizedGuessOf('🍎'), '🍎');
  assert.equal([...(normalizedGuessOf(`🍎${'a'.repeat(63)}`) ?? '')].length, 64);
  expectGuessDeny(`🍎${'a'.repeat(64)}`, /1–64|码点/);
});

test('blank_normalization_v1_rejects_control_characters_and_newlines_test', () => {
  expectGuessDeny('苹\n果', /控制字符|换行/);
  expectGuessDeny('\u0007', /控制字符|换行/);
});
