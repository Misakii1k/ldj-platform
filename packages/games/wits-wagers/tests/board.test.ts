import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildBoard, pickWinningTargets } from '../server/board.ts';

interface GoldenCaseFile {
  boardCases: Array<{
    id: string;
    guesses: number[];
    expectedValues: number[];
    expectedSlots: string[];
    expectedOdds: number[];
    expectedEdgeOdds: number;
  }>;
  winnerCases: Array<{
    id: string;
    note?: string;
    guesses: number[];
    correctAnswer: number;
    expectedWinners: string[];
  }>;
}

const goldenUrl = new URL('./golden-cases.json', import.meta.url);
const golden = JSON.parse(readFileSync(goldenUrl, 'utf8')) as GoldenCaseFile;

const isEdge = (id: string) => id === 'lower';

test('board: 覆盖 1..7 个不同值的 golden boardCases (B01-B08)', () => {
  for (const tc of golden.boardCases) {
    const board = buildBoard(tc.guesses);

    // 唯一的边缘槽 lower 必须存在、无数值、赔率为 6
    const edge = board.find(t => t.id === 'lower');
    assert.ok(edge, `${tc.id}: 缺少 lower 目标`);
    assert.equal(edge.slot, 'LOWER');
    assert.equal(edge.odds, tc.expectedEdgeOdds);
    assert.equal(edge.value, null);
    assert.deepEqual(edge.authors, []);

    // 边缘槽只在最前，右端不再有「更高」卡
    assert.equal(board[0]?.id, 'lower', `${tc.id}: lower 应排在版图最前`);
    assert.ok(!board.some(t => (t.id as string) === 'higher'), `${tc.id}: 版图不得含已删除的 higher`);
    assert.equal(board.length, tc.expectedValues.length + 1, `${tc.id}: 版图长度应为数值槽 + 1`);

    // 猜测目标按数值升序
    const guessTargets = board.filter(t => !isEdge(t.id));
    assert.deepEqual(
      guessTargets.map(t => t.value),
      tc.expectedValues,
      `${tc.id}: 目标数值不匹配`,
    );
    assert.deepEqual(
      guessTargets.map(t => t.slot),
      tc.expectedSlots,
      `${tc.id}: 槽位分布不匹配`,
    );
    assert.deepEqual(
      guessTargets.map(t => t.odds),
      tc.expectedOdds,
      `${tc.id}: 赔率不匹配`,
    );
    assert.deepEqual(
      guessTargets.map(t => t.id),
      tc.expectedValues.map(v => `g:${v}`),
      `${tc.id}: TargetId 格式应为 g:<value>`,
    );
  }
});

test('board: 4个不同值时中心槽C留空 (B04/偶数无中心槽)', () => {
  const board = buildBoard([10, 16, 18, 20]);
  const slots = board.map(t => t.slot);
  assert.ok(!slots.includes('C'), '4个不同值时不应有中心槽 C');
  assert.deepEqual(
    board.filter(t => !isEdge(t.id)).map(t => t.slot),
    ['L2', 'L1', 'R1', 'R2'],
  );
});

test('board: 重复值归集全部作者', () => {
  const board = buildBoard([
    { playerId: 'p1', value: 100 },
    { playerId: 'p2', value: 100 },
    { playerId: 'p3', value: 200 },
    { playerId: 'p4', value: 100 },
  ]);

  const t100 = board.find(t => t.id === 'g:100');
  assert.ok(t100);
  assert.deepEqual(t100.authors, ['p1', 'p2', 'p4']);

  const t200 = board.find(t => t.id === 'g:200');
  assert.ok(t200);
  assert.deepEqual(t200.authors, ['p3']);
});

test('winner: golden winnerCases', () => {
  for (const tc of golden.winnerCases) {
    const board = buildBoard(tc.guesses);
    const winners = pickWinningTargets(board, tc.correctAnswer);
    assert.deepEqual(
      winners,
      tc.expectedWinners,
      `${tc.id}: 胜出目标计算错误${tc.note ? `（${tc.note}）` : ''}`,
    );
  }
});

test('winner: 所有猜测均大于正确答案时 lower 获胜', () => {
  const board = buildBoard([100, 200, 300]);
  assert.deepEqual(pickWinningTargets(board, 99), ['lower']);
  assert.deepEqual(pickWinningTargets(board, 50), ['lower']);
});

test('winner: 所有猜测均小于正确答案时没有特殊槽，最大的猜测获胜', () => {
  const board = buildBoard([100, 200, 300]);
  assert.deepEqual(pickWinningTargets(board, 301), ['g:300']);
  assert.deepEqual(pickWinningTargets(board, 99999), ['g:300']);
});

test('winner: 精确匹配时该猜测独赢', () => {
  const board = buildBoard([100, 200, 300]);
  assert.deepEqual(pickWinningTargets(board, 200), ['g:200']);
});

test('winner: 不再使用"不超过"规则——更高但更近的猜测获胜', () => {
  // 旧规则会判 g:100 获胜（最接近且不超过），新规则按绝对差值判 g:200
  const board = buildBoard([100, 200, 300]);
  assert.deepEqual(pickWinningTargets(board, 180), ['g:200']);
});

test('winner: 等距时两侧并列获胜并按升序返回', () => {
  const board = buildBoard([100, 200, 300]);
  assert.deepEqual(pickWinningTargets(board, 150), ['g:100', 'g:200']);
});

test('winner: 版图无数值槽时无人获胜', () => {
  assert.deepEqual(pickWinningTargets([], 100), []);
});

test('board: 空输入拒绝或保护', () => {
  assert.throws(() => buildBoard([]), /at least one guess/);
});
