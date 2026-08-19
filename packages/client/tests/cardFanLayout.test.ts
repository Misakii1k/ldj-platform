import test from 'node:test';
import assert from 'node:assert/strict';
import { computeFanLayout } from '../src/shared-ui/CardFanEngine.tsx';

test('单张牌：不偏转、不位移', () => {
  const layout = computeFanLayout(1, 76, 40, 40);
  assert.deepEqual(layout, { stepAngle: 0, startAngle: 0, stepX: 0, startX: 0 });
});

test('多张牌：扇形左右对称展开（startAngle = -总角/2）', () => {
  const total = 5;
  const { stepAngle, startAngle, stepX, startX } = computeFanLayout(total, 76, 40, 40);
  assert.ok(stepAngle > 0);
  assert.ok(stepX > 0);
  // 对称：首牌角 = -(n-1)*step/2，末牌角 = +(n-1)*step/2
  assert.ok(Math.abs(startAngle + ((total - 1) * stepAngle) / 2) < 1e-9);
  assert.ok(Math.abs(startX + ((total - 1) * stepX) / 2) < 1e-9);
  // 中间牌（idx=2）应处于中心
  const midAngle = startAngle + 2 * stepAngle;
  const midX = startX + 2 * stepX;
  assert.ok(Math.abs(midAngle) < 1e-9);
  assert.ok(Math.abs(midX) < 1e-9);
});

test('相邻角度步进上限 6°，总角不超过 maxFanAngle 与 angleCap 的较小者', () => {
  // 40° / 4 步 = 10° > 6° 上限 → 收敛到 6°
  const l1 = computeFanLayout(5, 76, 40, 40);
  assert.equal(l1.stepAngle, 6);

  // 牌很多时步进被进一步压缩，总角仍受 40° 约束
  const l2 = computeFanLayout(15, 76, 40, 40);
  assert.ok(l2.stepAngle <= 6);
  assert.ok((15 - 1) * l2.stepAngle <= 40 + 1e-9);

  // angleCap 更小时取 cap
  const l3 = computeFanLayout(5, 76, 40, 30);
  assert.ok((5 - 1) * l3.stepAngle <= 30 + 1e-9);
});

test('横向叠牌间距：随牌数压缩且不超过牌宽的 48%', () => {
  const cardWidth = 76;
  const few = computeFanLayout(4, cardWidth, 40, 40);
  const many = computeFanLayout(20, cardWidth, 40, 40);
  assert.ok(few.stepX <= cardWidth * 0.48 + 1e-9);
  assert.ok(many.stepX <= cardWidth * 0.48 + 1e-9);
  assert.ok(many.stepX < few.stepX); // 牌越多叠得越紧
  assert.ok(many.stepX >= 20 - 1e-9); // 最小可读间距兜底
});

test('两张牌：对称左右各一张', () => {
  const { stepAngle, startAngle, stepX, startX } = computeFanLayout(2, 76, 40, 40);
  const left = { angle: startAngle, x: startX };
  const right = { angle: startAngle + stepAngle, x: startX + stepX };
  assert.ok(left.angle < 0 && right.angle > 0);
  assert.ok(left.x < 0 && right.x > 0);
  assert.ok(Math.abs(left.angle + right.angle) < 1e-9);
  assert.ok(Math.abs(left.x + right.x) < 1e-9);
});
