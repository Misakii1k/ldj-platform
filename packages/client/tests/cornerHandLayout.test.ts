import test from 'node:test';
import assert from 'node:assert/strict';
import { computeCornerHand, sortByColor } from '../src/game/party-table/cornerHandLayout.ts';

test('cornerHandLayout: 桌面 820 可用宽下的 7 / 16 / 25 张手牌', () => {
  const cardWidth = 86;
  const availableWidth = 820;
  const baseOverlap = -24;

  // 7 张
  const r7 = computeCornerHand({ count: 7, cardWidth, availableWidth, baseOverlap });
  assert.equal(r7.overlap, -24, '7 张未超预算，保持基础 -24 重叠');
  assert.equal(r7.tight, false, '7 张不进入紧凑模式');
  assert.equal(r7.tiltDeg, 2.4);
  assert.ok(r7.totalWidth <= availableWidth, '总宽不超限');

  // 16 张
  const r16 = computeCornerHand({ count: 16, cardWidth, availableWidth, baseOverlap });
  assert.ok(r16.overlap < baseOverlap, '16 张需进一步重叠');
  assert.ok(r16.totalWidth <= availableWidth + 0.001, '总宽不超限');

  // 25 张
  const r25 = computeCornerHand({ count: 25, cardWidth, availableWidth, baseOverlap });
  assert.ok(r25.overlap < r16.overlap, '25 张重叠更多');
  assert.equal(r25.tight, true, '25 张进入紧凑模式');
  assert.equal(r25.tiltDeg, 0.5);
  assert.ok(r25.totalWidth <= availableWidth + 0.001, '总宽不超限');
});

test('cornerHandLayout: 手机 350 可用宽下的 7 / 16 / 25 张手牌', () => {
  const cardWidth = 60;
  const availableWidth = 350;
  const baseOverlap = -20;

  // 7 张
  const r7 = computeCornerHand({ count: 7, cardWidth, availableWidth, baseOverlap });
  assert.ok(r7.totalWidth <= availableWidth + 0.001, '7 张总宽不超限');

  // 16 张
  const r16 = computeCornerHand({ count: 16, cardWidth, availableWidth, baseOverlap });
  assert.ok(r16.overlap < baseOverlap);
  assert.equal(r16.tight, true, '手机 16 张已进入紧凑模式');
  assert.equal(r16.tiltDeg, 0.5);
  assert.ok(r16.totalWidth <= availableWidth + 0.001, '总宽不超限');

  // 25 张
  const r25 = computeCornerHand({ count: 25, cardWidth, availableWidth, baseOverlap });
  assert.equal(r25.tight, true, '手机 25 张紧凑模式');
  assert.ok(r25.totalWidth <= availableWidth + 0.001, '总宽不超限');
});

test('cornerHandLayout: sortByColor 顺序（红 → 黄 → 绿 → 蓝 → 万能/其他）且同色稳定', () => {
  const input = [
    { id: 'w1', color: 'wild', name: '万能牌' },
    { id: 'b1', color: 'blue', name: '蓝2' },
    { id: 'r1', color: 'red', name: '红1' },
    { id: 'g1', color: 'green', name: '绿跳过' },
    { id: 'y1', color: 'yellow', name: '黄5' },
    { id: 'r2', color: 'red', name: '红反转' },
    { id: 'd1', color: 'draw4', name: '+4' },
  ];

  const sorted = sortByColor(input);
  const ids = sorted.map((c) => c.id);
  assert.deepEqual(ids, ['r1', 'r2', 'y1', 'g1', 'b1', 'w1', 'd1']);
});
