/**
 * 词库校验（SPEC §6.1）：≥100 组；两词不同；去空白非空；无正向/反向重复。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WORD_BANK, WORD_BANK_VERSION } from '../server/words.ts';

test('词库数量 ≥ 100 组', () => {
  assert.ok(WORD_BANK.length >= 100, `当前 ${WORD_BANK.length} 组`);
});

test('词库版本为正整数', () => {
  assert.ok(Number.isInteger(WORD_BANK_VERSION) && WORD_BANK_VERSION >= 1);
});

test('每组两词去空白后非空且互不相同', () => {
  for (const pair of WORD_BANK) {
    const a = pair.civilianWord.trim();
    const b = pair.undercoverWord.trim();
    assert.ok(a.length > 0 && b.length > 0, JSON.stringify(pair));
    assert.notEqual(a, b, JSON.stringify(pair));
    // 存储值本身不应带首尾空白
    assert.equal(a, pair.civilianWord);
    assert.equal(b, pair.undercoverWord);
  }
});

test('无正向重复与反向重复词对', () => {
  const seen = new Set<string>();
  for (const pair of WORD_BANK) {
    const forward = `${pair.civilianWord}\u0000${pair.undercoverWord}`;
    const backward = `${pair.undercoverWord}\u0000${pair.civilianWord}`;
    assert.ok(!seen.has(forward), `正向重复：${forward}`);
    assert.ok(!seen.has(backward), `反向重复：${backward}`);
    seen.add(forward);
  }
});
