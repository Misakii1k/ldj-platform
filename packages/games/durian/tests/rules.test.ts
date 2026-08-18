import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDurianDeck,
  buildDurianFruitDeck,
  buildDurianMonkeyDeck,
  computeActiveTableTotals,
  createDurianState,
  evaluateChallenge,
  reduceDurianState,
} from '../server/rules.ts';
import { parseDurianAction, parseDurianConfig } from '../server/schemas.ts';
import type { FruitCard, MonkeyCard } from '../server/types.ts';

function accepted(state: ReturnType<typeof createDurianState>, action: unknown) {
  const result = reduceDurianState(state, action);
  if (!result.ok) throw new Error(result.message);
  return result.nextState;
}

test('Durian 牌组包含 24 张水果牌与 4 张功能小猴牌共 28 张', () => {
  const fruitDeck = buildDurianFruitDeck();
  const monkeyDeck = buildDurianMonkeyDeck();
  const totalDeck = buildDurianDeck();

  assert.equal(fruitDeck.length, 24);
  assert.equal(monkeyDeck.length, 4);
  assert.equal(totalDeck.length, 28);
  assert.equal(new Set(totalDeck.map((c) => c.id)).size, 28);
});

test('初始化接受 2 至 7 人并拒绝边界外及重复玩家', () => {
  assert.equal(createDurianState(['a', 'b']).players.length, 2);
  assert.equal(createDurianState(['a', 'b', 'c', 'd', 'e', 'f', 'g']).players.length, 7);
  assert.throws(() => createDurianState(['a']), /2 至 7/);
  assert.throws(() => createDurianState(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']), /2 至 7/);
  assert.throws(() => createDurianState(['a', 'a']), /玩家列表无效/);
});

test('解析器严格拒绝多余字段和非法操作', () => {
  assert.deepEqual(parseDurianAction({ type: 'draw_card', playerId: 'a' }), { type: 'draw_card', playerId: 'a' });
  assert.throws(() => parseDurianAction({ type: 'draw_card', playerId: 'a', extra: true }), /字段无效/);
  assert.throws(() => parseDurianAction({ type: 'place_fruit', playerId: 'a', checkHalf: 'middle' }), /放置方向必须为 left 或 right/);
  assert.throws(() => parseDurianConfig({ customDeck: [] }), /不能为空/);
});

test('出牌流程：摸牌 → 放置水果选择 ✓ 方向 → 回合轮转', () => {
  const card1: FruitCard = { id: 'c-1', kind: 'fruit', left: { fruit: 'durian', quantity: 1 }, right: { fruit: 'apple', quantity: 1 } };
  const card2: FruitCard = { id: 'c-2', kind: 'fruit', left: { fruit: 'banana', quantity: 1 }, right: { fruit: 'grape', quantity: 1 } };
  const cardDraw: FruitCard = { id: 'c-draw', kind: 'fruit', left: { fruit: 'durian', quantity: 2 }, right: { fruit: 'strawberry', quantity: 1 } };

  let state = createDurianState(['a', 'b'], { customDeck: [card1, card2, cardDraw] });
  assert.equal(state.phase, 'turn_action');
  assert.equal(state.currentPlayerId, 'a');

  // a 摸牌
  state = accepted(state, { type: 'draw_card', playerId: 'a' });
  assert.equal(state.phase, 'choose_placement');
  assert.equal(state.drawnCard?.id, 'c-draw');

  // a 选择将左半（2个榴莲）放在 ✓
  state = accepted(state, { type: 'place_fruit', playerId: 'a', checkHalf: 'left' });
  assert.equal(state.phase, 'turn_action');
  assert.equal(state.currentPlayerId, 'b');
  assert.equal(state.previousPlayerId, 'a');
  assert.equal(state.tablePlacements.length, 1);

  const { totals } = computeActiveTableTotals(state.tablePlacements);
  assert.equal(totals.durian, 2);
  assert.equal(totals.strawberry, 0);
});

test('质疑机制：桌面超过头顶库存则质疑成功（上家输），否则质疑失败（质疑者输）', () => {
  const cardA: FruitCard = {
    id: 'fc-a',
    kind: 'fruit',
    left: { fruit: 'durian', quantity: 1 },
    right: { fruit: 'apple', quantity: 1 },
  };
  const cardB: FruitCard = {
    id: 'fc-b',
    kind: 'fruit',
    left: { fruit: 'banana', quantity: 1 },
    right: { fruit: 'grape', quantity: 1 },
  };
  const cardDraw: FruitCard = {
    id: 'fc-draw',
    kind: 'fruit',
    left: { fruit: 'durian', quantity: 3 },
    right: { fruit: 'durian', quantity: 3 },
  };

  let state = createDurianState(['a', 'b'], { customDeck: [cardA, cardB, cardDraw] });
  // a 的头顶牌是 cardA (榴莲 1, 苹果 1)，b 的头顶牌是 cardB (香蕉 1, 葡萄 1)
  // 总库存榴莲为 1。

  // a 摸牌并放 3 个榴莲在 ✓
  state = accepted(state, { type: 'draw_card', playerId: 'a' });
  state = accepted(state, { type: 'place_fruit', playerId: 'a', checkHalf: 'left' });

  // 此时桌面榴莲 = 3，库存榴莲 = 1。b 质疑 a
  const challengeResult = evaluateChallenge(state, 'b');
  assert.equal(challengeResult.success, true, '质疑应该成功（3 > 1）');
  assert.equal(challengeResult.loserId, 'a', '上家 a 应该输');

  state = accepted(state, { type: 'challenge', playerId: 'b' });
  assert.equal(state.penalties.a, 1, '第 1 轮输家 a 扣 1 分');
  assert.equal(state.penalties.b, 0);
  assert.equal(state.phase, 'challenge_result');
});

test('小猴功能牌：翻转牌可对调桌上已放置牌的生效方向', () => {
  const cardA: FruitCard = { id: 'c-a', kind: 'fruit', left: { fruit: 'durian', quantity: 1 }, right: { fruit: 'apple', quantity: 1 } };
  const cardB: FruitCard = { id: 'c-b', kind: 'fruit', left: { fruit: 'durian', quantity: 1 }, right: { fruit: 'apple', quantity: 1 } };
  const cardPlace: FruitCard = { id: 'c-place', kind: 'fruit', left: { fruit: 'durian', quantity: 2 }, right: { fruit: 'strawberry', quantity: 3 } };
  const monkeyFlip: MonkeyCard = { id: 'mc-flip-test', kind: 'monkey', special: 'flip' };

  let state = createDurianState(['a', 'b'], { customDeck: [cardA, cardB, cardPlace, monkeyFlip] });

  // a 摸牌放置：左半 2 榴莲在 ✓
  state = accepted(state, { type: 'draw_card', playerId: 'a' });
  state = accepted(state, { type: 'place_fruit', playerId: 'a', checkHalf: 'left' });
  assert.equal(computeActiveTableTotals(state.tablePlacements).totals.durian, 2);
  assert.equal(computeActiveTableTotals(state.tablePlacements).totals.strawberry, 0);

  // b 摸到翻转牌
  state = accepted(state, { type: 'draw_card', playerId: 'b' });
  assert.equal(state.phase, 'choose_flip');

  // b 选择翻转第一张放置的水果牌
  const placementId = state.tablePlacements[0]!.data.placementId;
  state = accepted(state, { type: 'select_flip_target', playerId: 'b', targetPlacementId: placementId });

  // 翻转后：右半 3 草莓在 ✓，榴莲变为 0
  const totalsAfter = computeActiveTableTotals(state.tablePlacements).totals;
  assert.equal(totalsAfter.durian, 0);
  assert.equal(totalsAfter.strawberry, 3);
});

test('小猴功能牌：3个水果无效 与 所有香蕉无效', () => {
  const cardBanana3: FruitCard = {
    id: 'fc-b3',
    kind: 'fruit',
    left: { fruit: 'banana', quantity: 3 },
    right: { fruit: 'apple', quantity: 1 },
  };
  const cardApple3: FruitCard = {
    id: 'fc-a3',
    kind: 'fruit',
    left: { fruit: 'apple', quantity: 3 },
    right: { fruit: 'durian', quantity: 1 },
  };

  const placements = [
    {
      kind: 'fruit' as const,
      data: { placementId: 'p1', card: cardBanana3, checkHalf: 'left' as const, placedBy: 'a' },
    },
    {
      kind: 'fruit' as const,
      data: { placementId: 'p2', card: cardApple3, checkHalf: 'left' as const, placedBy: 'b' },
    },
  ];

  // 基础情况：香蕉 3，苹果 3
  assert.deepEqual(computeActiveTableTotals(placements).totals, {
    durian: 0,
    strawberry: 0,
    banana: 3,
    grape: 0,
    apple: 3,
  });

  // 加入 3个无效 猴子牌：香蕉 3 和 苹果 3 全部被忽略
  const withThreeVoid = [
    ...placements,
    {
      kind: 'monkey' as const,
      data: { placementId: 'm1', card: { id: 'm-3', kind: 'monkey' as const, special: 'three_void' as const }, placedBy: 'a' },
    },
  ];
  assert.deepEqual(computeActiveTableTotals(withThreeVoid).totals, {
    durian: 0,
    strawberry: 0,
    banana: 0,
    grape: 0,
    apple: 0,
  });

  // 加入 香蕉无效 猴子牌：香蕉被忽略
  const withBananaVoid = [
    ...placements,
    {
      kind: 'monkey' as const,
      data: { placementId: 'm2', card: { id: 'm-b', kind: 'monkey' as const, special: 'banana_void' as const }, placedBy: 'a' },
    },
  ];
  assert.deepEqual(computeActiveTableTotals(withBananaVoid).totals, {
    durian: 0,
    strawberry: 0,
    banana: 0,
    grape: 0,
    apple: 3,
  });
});

test('淘汰与终局：超过 7 分淘汰，存活少于等于 1 人或满 7 轮终局', () => {
  const card1: FruitCard = { id: 'c-1', kind: 'fruit', left: { fruit: 'grape', quantity: 1 }, right: { fruit: 'apple', quantity: 1 } };
  const card2: FruitCard = { id: 'c-2', kind: 'fruit', left: { fruit: 'banana', quantity: 1 }, right: { fruit: 'grape', quantity: 1 } };
  const card3: FruitCard = { id: 'c-3', kind: 'fruit', left: { fruit: 'durian', quantity: 3 }, right: { fruit: 'durian', quantity: 3 } };

  let state = createDurianState(['a', 'b'], { customDeck: [card1, card2, card3] });
  state.penalties.a = 7;
  state.round = 2; // 第 2 轮输掉会 +2 分，达到 9 分 > 7 淘汰

  // a 摸牌并放置 3 个榴莲
  state = accepted(state, { type: 'draw_card', playerId: 'a' });
  state = accepted(state, { type: 'place_fruit', playerId: 'a', checkHalf: 'left' });

  // 此时头顶榴莲总数 = 0，桌面榴莲 = 3。b 质疑 a (成功)
  state = accepted(state, { type: 'challenge', playerId: 'b' });
  assert.equal(state.penalties.a, 9);
  assert.ok(state.eliminatedPlayers.includes('a'));
  assert.equal(state.phase, 'game_over');
  assert.deepEqual(state.winners, ['b']);
});
