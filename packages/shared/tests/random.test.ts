import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSeededRandom } from '../src/game/random.ts';

test('固定种子保持历史随机序列', () => {
  const random = createSeededRandom('d2:random:sequence');
  const values = Array.from({ length: 6 }, () => random.nextInt(0, 1_000_000));

  assert.deepEqual(values, [651721, 226797, 386940, 619180, 951652, 979858]);
  assert.equal(random.getCursor(), values.length);
});

test('相同种子和 cursor 从同一位置继续', () => {
  const original = createSeededRandom('d2:random:resume');
  Array.from({ length: 7 }, () => original.nextInt(-100, 100));
  const cursor = original.getCursor();
  const expected = Array.from({ length: 5 }, () => original.nextInt(-100, 100));

  const restored = createSeededRandom('d2:random:resume', cursor);
  assert.deepEqual(
    Array.from({ length: 5 }, () => restored.nextInt(-100, 100)),
    expected,
  );
  assert.equal(restored.getCursor(), cursor + expected.length);
});

test('shuffle 不修改输入并固定消耗 n - 1 次随机', () => {
  const input = Object.freeze(['a', 'b', 'c', 'd']);
  const random = createSeededRandom('d2:random:shuffle');

  const shuffled = random.shuffle(input);

  assert.deepEqual(input, ['a', 'b', 'c', 'd']);
  assert.notEqual(shuffled, input);
  assert.deepEqual(shuffled, ['c', 'd', 'a', 'b']);
  assert.equal(random.getCursor(), input.length - 1);
});

test('空数组和单元素数组洗牌不消耗随机', () => {
  const random = createSeededRandom('d2:random:short-shuffle');

  assert.deepEqual(random.shuffle([]), []);
  assert.deepEqual(random.shuffle(['only']), ['only']);
  assert.equal(random.getCursor(), 0);
});

test('nextInt 拒绝非安全整数边界、溢出区间和空区间且不消耗随机', () => {
  const random = createSeededRandom('d2:random:bounds');

  assert.throws(() => random.nextInt(0.5, 2), /安全整数边界/);
  assert.throws(() => random.nextInt(0, Number.POSITIVE_INFINITY), /安全整数边界/);
  assert.throws(() => random.nextInt(0, Number.MAX_SAFE_INTEGER + 1), /安全整数边界/);
  assert.throws(() => random.nextInt(-Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER), /区间宽度必须是安全整数/);
  assert.throws(() => random.nextInt(2, 2), /区间为空/);
  assert.throws(() => random.nextInt(3, 2), /区间为空/);
  assert.equal(random.getCursor(), 0);
});

test('cursor 只接受非负安全整数并以常量时间恢复大游标', () => {
  for (const cursor of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(
      () => createSeededRandom('d2:random:cursor', cursor),
      /cursor 必须是非负安全整数/,
      String(cursor),
    );
  }

  assert.equal(createSeededRandom('d2:random:cursor', 0).getCursor(), 0);
  const largeCursor = 4_294_967_296 + 17;
  const restored = createSeededRandom('d2:random:cursor', largeCursor);
  const equivalent = createSeededRandom('d2:random:cursor', 17);
  assert.equal(restored.getCursor(), largeCursor);
  assert.equal(restored.nextInt(0, 100), equivalent.nextInt(0, 100));
  assert.equal(restored.getCursor(), largeCursor + 1);

  const exhausted = createSeededRandom('d2:random:cursor', Number.MAX_SAFE_INTEGER);
  assert.throws(() => exhausted.nextInt(0, 2), /cursor 已达到安全整数上限/);
  assert.equal(exhausted.getCursor(), Number.MAX_SAFE_INTEGER);
});
