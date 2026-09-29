/**
 * UNO 稠密手牌布局几何回归。
 *
 * 通用扇形在 ≥14 张时每张只露 24%、22 张后溢出。这里锁定 A（可出牌前置抬升）
 * 与 B（双排兜底）两条策略的行为边界，确保罚牌链堆到 20+ 张时仍然可读、不溢出。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeDenseHandLayout, type DenseCard } from '../src/shared-ui/denseHandLayout.ts';

const CARD_W = 76;
const CONTAINER = 328;

function hand(total: number, playableIdx: number[]): DenseCard[] {
  const set = new Set(playableIdx);
  return Array.from({ length: total }, (_, i) => ({ id: `c${i}`, playable: set.has(i) }));
}

function span(placements: { x: number }[]): number {
  const xs = placements.map((p) => p.x);
  return Math.max(...xs) - Math.min(...xs) + CARD_W;
}

test('阈值以下交回通用扇形（mode=fan）', () => {
  const r = computeDenseHandLayout(hand(7, [0, 3]), { cardWidth: CARD_W, containerWidth: CONTAINER });
  assert.equal(r.mode, 'fan');
  assert.equal(r.placements.length, 0);
});

test('A：可出牌抬升，不可出牌压缩，14 张单排放得下', () => {
  const r = computeDenseHandLayout(hand(14, [2, 9]), { cardWidth: CARD_W, containerWidth: CONTAINER });
  assert.equal(r.mode, 'dense');
  assert.equal(r.placements.length, 14);
  assert.ok(r.hasLifted);

  const playable = r.placements.filter((p) => p.playable);
  const disabled = r.placements.filter((p) => !p.playable);
  assert.equal(playable.length, 2);
  for (const p of playable) assert.ok(p.lift > 0, '可出牌应抬升');
  for (const p of disabled) assert.equal(p.lift, 0, '不可出牌不抬升');

  // 可出牌前后的间距应显著大于不可出牌之间的间距
  const sorted = [...r.placements].sort((a, b) => a.x - b.x);
  const gapAfter = (i: number) => sorted[i + 1]!.x - sorted[i]!.x;
  const playableGaps = sorted.map((p, i) => (p.playable && i < sorted.length - 1 ? gapAfter(i) : null)).filter((g): g is number => g !== null);
  const disabledGaps = sorted.map((p, i) => (!p.playable && i < sorted.length - 1 && !sorted[i + 1]!.playable ? gapAfter(i) : null)).filter((g): g is number => g !== null);
  assert.ok(Math.min(...playableGaps) > Math.max(...disabledGaps) * 2, '可出牌应比不可出牌露出更多');

  // 不溢出
  assert.ok(span(r.placements) <= CONTAINER - 16 + 1e-6, `跨度 ${span(r.placements).toFixed(0)} 超出容器`);
});

test('A：全部不可出时仍单排、不溢出（退化为窄色条）', () => {
  const r = computeDenseHandLayout(hand(18, []), { cardWidth: CARD_W, containerWidth: CONTAINER });
  assert.ok(r.mode === 'dense' || r.mode === 'double');
  assert.equal(r.hasLifted, false);
  for (const row of [0, 1] as const) {
    const rowP = r.placements.filter((p) => p.row === row);
    if (rowP.length) assert.ok(span(rowP) <= CONTAINER - 16 + 1e-6);
  }
});

test('B：22 张以上触发双排，每排均不溢出', () => {
  const r = computeDenseHandLayout(hand(24, [0, 5, 11]), { cardWidth: CARD_W, containerWidth: CONTAINER });
  assert.equal(r.mode, 'double');
  assert.equal(r.placements.length, 24);
  assert.ok(r.rowOffsetY < 0, '后排应上移');

  const front = r.placements.filter((p) => p.row === 0);
  const back = r.placements.filter((p) => p.row === 1);
  assert.ok(front.length >= 11 && back.length >= 11, '两排应大致均分');
  assert.ok(span(front) <= CONTAINER - 16 + 1e-6, `前排跨度 ${span(front).toFixed(0)} 溢出`);
  assert.ok(span(back) <= CONTAINER - 16 + 1e-6, `后排跨度 ${span(back).toFixed(0)} 溢出`);
});

test('B：保持原始手牌顺序（placements[i].id === cards[i].id）', () => {
  const cards = hand(24, [3]);
  const r = computeDenseHandLayout(cards, { cardWidth: CARD_W, containerWidth: CONTAINER });
  cards.forEach((c, i) => assert.equal(r.placements[i]!.id, c.id));
});

test('可出牌在任何模式下都抬升且间距充足', () => {
  for (const n of [13, 16, 20, 24, 30]) {
    const r = computeDenseHandLayout(hand(n, [1, Math.floor(n / 2)]), { cardWidth: CARD_W, containerWidth: CONTAINER });
    const lifted = r.placements.filter((p) => p.playable);
    assert.equal(lifted.length, 2, `${n} 张时应有 2 张可出`);
    for (const p of lifted) assert.ok(p.lift > 0, `${n} 张时可出牌未抬升`);
  }
});

test('极端：40 张仍返回完整布局且每排不溢出', () => {
  const r = computeDenseHandLayout(hand(40, [7]), { cardWidth: CARD_W, containerWidth: CONTAINER });
  assert.equal(r.placements.length, 40);
  for (const row of [0, 1] as const) {
    const rowP = r.placements.filter((p) => p.row === row);
    assert.ok(span(rowP) <= CONTAINER - 16 + 1e-6, `第 ${row} 排溢出`);
  }
});

test('显式 undefined 选项不得覆盖默认值', () => {
  // 展开语法 {...DEFAULTS, ...options} 会让 options 里的 undefined 吃掉默认值，
  // 导致 denseThreshold 变成 undefined、比较恒为 false，阈值形同失效。
  const r = computeDenseHandLayout(hand(7, [0]), {
    cardWidth: CARD_W,
    containerWidth: CONTAINER,
    denseThreshold: undefined,
    playableStep: undefined,
  });
  assert.equal(r.mode, 'fan', '7 张应仍走通用扇形（默认阈值 12 未被 undefined 覆盖）');
});

test('可覆盖阈值：调低后少量手牌也进入稠密模式', () => {
  const r = computeDenseHandLayout(hand(7, [0, 2]), {
    cardWidth: CARD_W, containerWidth: CONTAINER, denseThreshold: 5,
  });
  assert.equal(r.mode, 'dense');
  assert.equal(r.placements.filter((p) => p.lift > 0).length, 2);
});
