import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeTeahouseHandOverlap,
  computeTeahouseHandTotalWidth,
} from '../src/game/landlord/teahouse/handFit.ts';

test('teahouseHandFit：17 / 20 张在 900、400、340 可用宽下总宽不超可用宽', () => {
  // 1. 桌面端：牌宽 78px，基础重叠 -38px，可用宽度 900px
  const desktopWidth = 900;
  const desktopCardWidth = 78;
  const desktopBaseOverlap = -38;

  for (const count of [17, 20]) {
    const overlap = computeTeahouseHandOverlap({
      count,
      cardWidth: desktopCardWidth,
      availableWidth: desktopWidth,
      baseOverlap: desktopBaseOverlap,
    });
    const totalWidth = computeTeahouseHandTotalWidth(count, desktopCardWidth, overlap);
    assert.ok(
      totalWidth <= desktopWidth + 1e-6,
      `桌面 ${count} 张手牌总宽 ${totalWidth} 不得超过可用宽 ${desktopWidth}`,
    );
    assert.ok(overlap <= desktopBaseOverlap, `重叠值 ${overlap} 应不大于基础重叠 ${desktopBaseOverlap}`);
  }

  // 2. 手机横屏（出牌阶段）：牌宽 50px，基础重叠 -24px，可用宽度 400px
  const landscapePlayWidth = 400;
  const landscapeCardWidth = 50;
  const landscapeBaseOverlap = -24;

  for (const count of [17, 20]) {
    const overlap = computeTeahouseHandOverlap({
      count,
      cardWidth: landscapeCardWidth,
      availableWidth: landscapePlayWidth,
      baseOverlap: landscapeBaseOverlap,
    });
    const totalWidth = computeTeahouseHandTotalWidth(count, landscapeCardWidth, overlap);
    assert.ok(
      totalWidth <= landscapePlayWidth + 1e-6,
      `横屏出牌 ${count} 张手牌总宽 ${totalWidth} 不得超过可用宽 ${landscapePlayWidth}`,
    );
    assert.ok(overlap <= landscapeBaseOverlap, `重叠值 ${overlap} 应不大于基础重叠 ${landscapeBaseOverlap}`);
  }

  // 3. 手机横屏（叫分阶段）：牌宽 50px，基础重叠 -24px，可用宽度 340px
  const landscapeBidWidth = 340;

  for (const count of [17, 20]) {
    const overlap = computeTeahouseHandOverlap({
      count,
      cardWidth: landscapeCardWidth,
      availableWidth: landscapeBidWidth,
      baseOverlap: landscapeBaseOverlap,
    });
    const totalWidth = computeTeahouseHandTotalWidth(count, landscapeCardWidth, overlap);
    assert.ok(
      totalWidth <= landscapeBidWidth + 1e-6,
      `横屏叫分 ${count} 张手牌总宽 ${totalWidth} 不得超过可用宽 ${landscapeBidWidth}`,
    );
    assert.ok(overlap <= landscapeBaseOverlap, `重叠值 ${overlap} 应不大于基础重叠 ${landscapeBaseOverlap}`);
  }
});

test('teahouseHandFit：边缘状态处理', () => {
  // count <= 1
  assert.equal(
    computeTeahouseHandOverlap({ count: 0, cardWidth: 78, availableWidth: 900 }),
    0,
  );
  assert.equal(
    computeTeahouseHandOverlap({ count: 1, cardWidth: 78, availableWidth: 900 }),
    0,
  );
  assert.equal(computeTeahouseHandTotalWidth(0, 78, -38), 0);
  assert.equal(computeTeahouseHandTotalWidth(1, 78, -38), 78);

  // 极窄宽度：保证计算稳定
  const tightOverlap = computeTeahouseHandOverlap({
    count: 5,
    cardWidth: 50,
    availableWidth: 100,
    baseOverlap: -20,
  });
  const tightTotal = computeTeahouseHandTotalWidth(5, 50, tightOverlap);
  assert.ok(tightTotal <= 100 + 1e-6);
});
