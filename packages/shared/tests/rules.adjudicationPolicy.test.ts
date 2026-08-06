/**
 * D4-A2：白板猜词外部裁判政策（blank-normalization-v1 / blank-adjudication-v1）。
 * 覆盖：归一化（NFC/折叠/trim/仅 ASCII lowercase/控制字符拒绝）、码点长度校验、
 * 本地精确匹配、classification 严格解析、备用触发、终局决策与结果资格。
 * 纯函数测试：无 I/O、无网络、无真实供应商。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyLocalExactMatch,
  finalizeAdjudicationDecision,
  isAdjudicationResultEligible,
  isValidBlankAdjudicationText,
  normalizeBlankAdjudicationText,
  parseAdjudicationClassification,
  shouldInvokeFallback,
  type AdjudicationClassification,
} from '../src/game/rules/adjudication-policy.ts';

test('归一化：NFC 合并组合字符', () => {
  assert.equal(normalizeBlankAdjudicationText('e\u0301'), '\u00E9');
});

test('归一化：内部连续 Unicode 空白折叠为单个空格并 trim', () => {
  assert.equal(normalizeBlankAdjudicationText('  a\u3000\u00A0 b  '), 'a b');
  assert.equal(normalizeBlankAdjudicationText('a   b'), 'a b');
});

test('归一化：仅 ASCII 大写转小写，其余字符原样保留', () => {
  assert.equal(normalizeBlankAdjudicationText('ABcD'), 'abcd');
  assert.equal(normalizeBlankAdjudicationText('苹果!'), '苹果!');
  assert.equal(normalizeBlankAdjudicationText('Ä'), 'Ä');
});

test('长度校验：按 Unicode code point 计数，接受 1–64', () => {
  assert.equal(isValidBlankAdjudicationText('😀'.repeat(64)), true);
  assert.equal(isValidBlankAdjudicationText('😀'.repeat(65)), false);
  assert.equal(isValidBlankAdjudicationText(''), false);
  assert.equal(isValidBlankAdjudicationText('a'.repeat(64)), true);
  assert.equal(isValidBlankAdjudicationText('a'.repeat(65)), false);
  assert.equal([...'😀'].length, 1, 'non-BMP 字符应计 1');
});

test('归一化：控制字符与行/段分隔符输入抛错（空白折叠前拒绝）', () => {
  for (const bad of ['\n', '\r\n', '\u2028', '\u2029', '\u0000', '\t']) {
    assert.throws(() => normalizeBlankAdjudicationText(bad), Error, `输入 ${JSON.stringify(bad)} 应抛错`);
  }
});

test('本地精确匹配：归一化后精确相等', () => {
  assert.equal(classifyLocalExactMatch('卧底', '卧底'), true);
  assert.equal(classifyLocalExactMatch('卧底', '卧 底'), false, '含空白的未归一化文本不相等');
  assert.equal(
    classifyLocalExactMatch(
      normalizeBlankAdjudicationText('AB'),
      normalizeBlankAdjudicationText('ab'),
    ),
    true,
    '大小写不敏感归一化后相等',
  );
});

test('解析分类：仅接受恰有一个 classification 键且值为六类之一的对象', () => {
  const six: readonly AdjudicationClassification[] = [
    'equivalent',
    'not_equivalent',
    'uncertain',
    'provider_error',
    'timeout',
    'invalid_response',
  ];
  for (const c of six) {
    assert.equal(parseAdjudicationClassification({ classification: c }), c);
  }
  assert.equal(parseAdjudicationClassification({ classification: 'unknown' }), null);
  assert.equal(parseAdjudicationClassification({ classification: 'equivalent', extra: 1 }), null);
  assert.equal(parseAdjudicationClassification({}), null);
  assert.equal(parseAdjudicationClassification('equivalent'), null);
  assert.equal(parseAdjudicationClassification(['equivalent']), null);
  assert.equal(parseAdjudicationClassification(null), null);
  assert.equal(parseAdjudicationClassification({ classification: 1 }), null);
});

test('shouldInvokeFallback：四类触发备用，两类终局不触发', () => {
  for (const c of ['uncertain', 'provider_error', 'timeout', 'invalid_response']) {
    assert.equal(shouldInvokeFallback(c as AdjudicationClassification), true, c);
  }
  for (const c of ['equivalent', 'not_equivalent']) {
    assert.equal(shouldInvokeFallback(c as AdjudicationClassification), false, c);
  }
});

test('finalizeAdjudicationDecision：裁决链语义', () => {
  // primary 终局两分支 → source primary
  assert.deepEqual(
    finalizeAdjudicationDecision({ primary: 'equivalent', fallback: null }),
    { verdict: 'equivalent', source: 'primary' },
  );
  assert.deepEqual(
    finalizeAdjudicationDecision({ primary: 'not_equivalent', fallback: 'equivalent' }),
    { verdict: 'not_equivalent', source: 'primary' },
  );
  // primary 非终局 + fallback 终局两分支 → source fallback
  assert.deepEqual(
    finalizeAdjudicationDecision({ primary: 'uncertain', fallback: 'equivalent' }),
    { verdict: 'equivalent', source: 'fallback' },
  );
  assert.deepEqual(
    finalizeAdjudicationDecision({ primary: 'timeout', fallback: 'not_equivalent' }),
    { verdict: 'not_equivalent', source: 'fallback' },
  );
  // 主备均非终局 → fail_closed 猜错
  assert.deepEqual(
    finalizeAdjudicationDecision({ primary: 'provider_error', fallback: 'uncertain' }),
    { verdict: 'not_equivalent', source: 'fail_closed' },
  );
  // fallback 为 null → fail_closed 猜错
  assert.deepEqual(
    finalizeAdjudicationDecision({ primary: 'invalid_response', fallback: null }),
    { verdict: 'not_equivalent', source: 'fail_closed' },
  );
});

test('isAdjudicationResultEligible：三项条件（未结算/匹配/未应用）全满足才可应用', () => {
  assert.equal(
    isAdjudicationResultEligible({
      taskSettled: false,
      taskIdMatchesExpectedSequence: true,
      alreadyApplied: false,
    }),
    true,
  );
  assert.equal(
    isAdjudicationResultEligible({
      taskSettled: true,
      taskIdMatchesExpectedSequence: true,
      alreadyApplied: false,
    }),
    false,
    '已结算会话不可应用',
  );
  assert.equal(
    isAdjudicationResultEligible({
      taskSettled: false,
      taskIdMatchesExpectedSequence: false,
      alreadyApplied: false,
    }),
    false,
    'taskId 不匹配期望序号不可应用',
  );
  assert.equal(
    isAdjudicationResultEligible({
      taskSettled: false,
      taskIdMatchesExpectedSequence: true,
      alreadyApplied: true,
    }),
    false,
    '已应用结果不可重复应用',
  );
});
