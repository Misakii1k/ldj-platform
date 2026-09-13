import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getWerewolfWolfBounds,
  calculateWerewolfDistribution,
  canEnableWerewolfSpecial,
} from '../src/game/werewolfDistribution.ts';

test('狼人数推荐与安全极值边界计算（6-12人）', () => {
  // 6人：推荐 2 狼，下限 1 狼，上限 2 狼（不可为 3 狼）
  assert.deepEqual(getWerewolfWolfBounds(6), { base: 2, min: 1, max: 2 });
  // 7人：推荐 2 狼，下限 1 狼，上限 3 狼（3 < 3.5）
  assert.deepEqual(getWerewolfWolfBounds(7), { base: 2, min: 1, max: 3 });
  // 8人：推荐 2 狼，下限 1 狼，上限 3 狼（3 < 4）
  assert.deepEqual(getWerewolfWolfBounds(8), { base: 2, min: 1, max: 3 });
  // 9人：推荐 3 狼，下限 2 狼，上限 4 狼（4 < 4.5）
  assert.deepEqual(getWerewolfWolfBounds(9), { base: 3, min: 2, max: 4 });
  // 10人：推荐 3 狼，下限 2 狼，上限 4 狼（4 < 5）
  assert.deepEqual(getWerewolfWolfBounds(10), { base: 3, min: 2, max: 4 });
  // 11人：推荐 4 狼，下限 3 狼，上限 5 狼（5 < 5.5）
  assert.deepEqual(getWerewolfWolfBounds(11), { base: 4, min: 3, max: 5 });
  // 12人：推荐 4 狼，下限 3 狼，上限 5 狼（5 < 6）
  assert.deepEqual(getWerewolfWolfBounds(12), { base: 4, min: 3, max: 5 });
});

test('微调偏移量（wolfDelta）映射与截断', () => {
  // 9人推荐 3 狼
  // delta = 0 -> 3 狼，3 神，3 民（开猎人）
  const std9 = calculateWerewolfDistribution({ playerCount: 9, hunter: true });
  assert.equal(std9.wolfCount, 3);
  assert.equal(std9.villagerCount, 3);
  assert.equal(std9.isValid, true);
  assert.equal(std9.canIncreaseWolves, true);
  assert.equal(std9.canDecreaseWolves, true);
  assert.equal(std9.boardBadge, '黄金 3-3-3 标准板子');

  // delta = +1 -> 4 狼，3 神，2 民
  const wolfPlus9 = calculateWerewolfDistribution({ playerCount: 9, hunter: true, wolfDelta: 1 });
  assert.equal(wolfPlus9.wolfCount, 4);
  assert.equal(wolfPlus9.villagerCount, 2);
  assert.equal(wolfPlus9.isValid, true);
  // 平民仅剩 2 人，不可再增加狼人
  assert.equal(wolfPlus9.canIncreaseWolves, false);
  assert.equal(wolfPlus9.increaseDisabledReason, '已达安全上限');
  assert.equal(wolfPlus9.boardBadge, '高压强狼 4-3-2 板子');

  // delta = -1 -> 2 狼，3 神，4 民
  const wolfMinus9 = calculateWerewolfDistribution({ playerCount: 9, hunter: true, wolfDelta: -1 });
  assert.equal(wolfMinus9.wolfCount, 2);
  assert.equal(wolfMinus9.villagerCount, 4);
  assert.equal(wolfMinus9.isValid, true);
  assert.equal(wolfMinus9.canDecreaseWolves, false);
  assert.equal(wolfMinus9.decreaseDisabledReason, '已达安全下限');
  assert.equal(wolfMinus9.boardBadge, '好人微优 2-3-4 板子');
});

test('平民保底 2 人安全约束与按钮禁用判定', () => {
  // 6人局 2 狼 2 神（预言家+女巫） -> 2 民，合法
  const sixStd = calculateWerewolfDistribution({ playerCount: 6 });
  assert.equal(sixStd.wolfCount, 2);
  assert.equal(sixStd.villagerCount, 2);
  assert.equal(sixStd.isValid, true);
  assert.equal(sixStd.canIncreaseWolves, false); // 6人上限即2狼且平民已为2人
  assert.equal(sixStd.canDecreaseWolves, true);

  // 6人局若尝试开启守卫，平民将只剩 1 人 -> canEnableWerewolfSpecial 拒绝
  const checkGuard6 = canEnableWerewolfSpecial({ playerCount: 6 }, 'guard');
  assert.equal(checkGuard6.allowed, false);
  assert.equal(checkGuard6.reason, '平民需保底 2 人');

  // 6人局若先微调为 1 狼，再开启守卫：1狼 + 3神 + 2民 = 6人 -> 合法
  const sixCustom = calculateWerewolfDistribution({ playerCount: 6, wolfDelta: -1, guard: true });
  assert.equal(sixCustom.wolfCount, 1);
  assert.equal(sixCustom.specialsCount, 3);
  assert.equal(sixCustom.villagerCount, 2);
  assert.equal(sixCustom.isValid, true);
});

test('5人局支持（1狼 + 2神 + 2民）', () => {
  assert.deepEqual(getWerewolfWolfBounds(5), { base: 1, min: 1, max: 2 });
  const fiveStd = calculateWerewolfDistribution({ playerCount: 5 });
  assert.equal(fiveStd.wolfCount, 1);
  assert.equal(fiveStd.specialsCount, 2);
  assert.equal(fiveStd.villagerCount, 2);
  assert.equal(fiveStd.isValid, true);
  // 5人局不能再开扩展神职（否则平民不足2人）
  const checkGuard5 = canEnableWerewolfSpecial({ playerCount: 5 }, 'guard');
  assert.equal(checkGuard5.allowed, false);
});

