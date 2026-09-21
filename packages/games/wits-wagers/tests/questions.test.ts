import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL_QUESTIONS, selectQuestions } from '../server/questions.ts';
import type { RandomSource } from '@ldj/shared';

function createMockRandom(): RandomSource {
  let counter = 0;
  return {
    nextInt: (min, max) => {
      counter++;
      return min + (counter % (max - min));
    },
    shuffle: (items) => [...items].reverse(),
  };
}

test('questions: 题库完整性与规范约束', () => {
  assert.ok(ALL_QUESTIONS.length >= 7, `题库必须至少有 7 道题，当前: ${ALL_QUESTIONS.length}`);

  const ids = new Set<string>();
  for (const q of ALL_QUESTIONS) {
    assert.ok(q.id && q.id.length <= 64, `题目 id 无效: ${q.id}`);
    assert.ok(!ids.has(q.id), `题目 id 重复: ${q.id}`);
    ids.add(q.id);

    assert.ok(q.prompt && q.prompt.length <= 240, `题目 prompt 长度超限: ${q.prompt}`);
    assert.ok(q.unit && q.unit.length <= 16, `题目 unit 长度超限: ${q.unit}`);
    assert.ok(
      Number.isSafeInteger(q.answer) && q.answer >= 1 && q.answer <= 999_999_999_999,
      `题目 answer 必须在 1..999,999,999,999 闭区间内，当前: ${q.answer}`,
    );
    assert.ok(q.sourceUrl.startsWith('http'), `题目 sourceUrl 必须是 http/https 开头: ${q.sourceUrl}`);
    assert.ok(q.sourceUrl.length <= 1000, `题目 sourceUrl 长度超限: ${q.sourceUrl}`);
    assert.ok(q.sourceNote && q.sourceNote.length <= 200, `题目 sourceNote 长度超限: ${q.sourceNote}`);
    assert.ok(q.asOf && q.asOf.length <= 32, `题目 asOf 长度超限: ${q.asOf}`);
    assert.ok(q.explanation && q.explanation.length <= 500, `题目 explanation 长度超限: ${q.explanation}`);
    assert.equal(q.reviewed, true, `题目 ${q.id} 必须标记为 reviewed: true`);
  }
});

test('questions: selectQuestions 正确抽取指定数量且不重复', () => {
  const random = createMockRandom();
  const selected = selectQuestions(random, 7);
  assert.equal(selected.length, 7);
  const ids = new Set(selected.map((q) => q.id));
  assert.equal(ids.size, 7);
});

test('questions: 请求题数超过题库总量时报错', () => {
  const random = createMockRandom();
  assert.throws(() => selectQuestions(random, 9999), /不足要求的抽题数/);
});
