import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeededRandom, shuffleCards, type CardZoneState } from '@ldj/shared';
import {
  UNO_HOUSE_GENERATION_SIZE,
  buildUnoHouseDeck,
  cardColor,
  cardScore,
  createHouseZones,
  dealInitialHands,
  drawWithExpansion,
  handZone,
  isLegalPlay,
  isPenaltyCard,
  isWild,
  recycleKeepTop,
} from '../../server/house/deck.ts';
import type {
  UnoHouseCard,
  UnoHouseColor,
  UnoHouseRoundState,
} from '../../server/house/types.ts';

const COLORS: readonly UnoHouseColor[] = ['red', 'yellow', 'green', 'blue'];

function numberCard(id: string, color: UnoHouseColor = 'red', value = 5): UnoHouseCard {
  return { id, kind: 'number', color, value };
}

function actionCard(
  id: string,
  kind: 'skip' | 'reverse' | 'draw2',
  color: UnoHouseColor = 'red',
): UnoHouseCard {
  return { id, kind, color };
}

function wildCard(id: string): UnoHouseCard {
  return { id, kind: 'wild' };
}

function wild4Card(id: string): UnoHouseCard {
  return { id, kind: 'wild4' };
}

function isNumberCard(card: UnoHouseCard): card is UnoHouseCard & { kind: 'number' } {
  return card.kind === 'number';
}

function isActionCard(card: UnoHouseCard): card is UnoHouseCard & { kind: 'skip' | 'reverse' | 'draw2' } {
  return card.kind === 'skip' || card.kind === 'reverse' || card.kind === 'draw2';
}

function cardsOfColor(
  deck: readonly UnoHouseCard[],
  color: UnoHouseColor,
): Array<UnoHouseCard & { color: UnoHouseColor }> {
  return deck.filter(
    (card): card is UnoHouseCard & { color: UnoHouseColor } => 'color' in card && card.color === color,
  );
}

function zonesWith(
  deck: readonly UnoHouseCard[],
  discardPile: readonly UnoHouseCard[],
  players: readonly string[],
): CardZoneState<string, UnoHouseCard> {
  const zones: Record<string, readonly UnoHouseCard[]> = { deck, discardPile };
  for (const playerId of players) {
    zones[handZone(playerId)] = [];
  }
  return { zones };
}

function assertUniqueAcrossZones(zones: CardZoneState<string, UnoHouseCard>): void {
  const ids: string[] = [];
  for (const cards of Object.values(zones.zones)) {
    ids.push(...cards.map((card) => card.id));
  }
  assert.equal(new Set(ids).size, ids.length, '所有牌区内的卡牌 id 必须唯一');
}

function zoneOf(
  zones: CardZoneState<string, UnoHouseCard>,
  zone: string,
): readonly UnoHouseCard[] {
  const cards = zones.zones[zone];
  if (!cards) throw new Error(`牌区缺失：${zone}`);
  return cards;
}

test('house deck：每代 108 张、id 唯一并带 r<round>:g<gen> 前缀', () => {
  const deck = buildUnoHouseDeck(1, 0);
  assert.equal(deck.length, UNO_HOUSE_GENERATION_SIZE);
  assert.equal(new Set(deck.map((card) => card.id)).size, deck.length);
  for (const card of deck) {
    assert.match(card.id, /^r1:g0:/);
  }

  for (const color of COLORS) {
    const colored = cardsOfColor(deck, color);
    assert.equal(colored.length, 25, `${color} 每色共 25 张`);
    const numbers = colored.filter(isNumberCard);
    assert.equal(numbers.length, 19, `${color} 号码牌 19 张（1 个 0 + 每个 1..9 两张）`);
    assert.equal(numbers.filter((card) => card.value === 0).length, 1);
    for (let value = 1; value <= 9; value += 1) {
      assert.equal(numbers.filter((card) => card.value === value).length, 2, `${color} ${value} 两张`);
    }
    const actions = colored.filter(isActionCard);
    assert.equal(actions.length, 6, `${color} 行动牌 6 张`);
    assert.equal(actions.filter((card) => card.kind === 'skip').length, 2);
    assert.equal(actions.filter((card) => card.kind === 'reverse').length, 2);
    assert.equal(actions.filter((card) => card.kind === 'draw2').length, 2);
  }
  assert.equal(deck.filter((card) => card.kind === 'wild').length, 4);
  assert.equal(deck.filter((card) => card.kind === 'wild4').length, 4);
});

test('house deck：跨 generation id 完全唯一', () => {
  const gen0 = buildUnoHouseDeck(1, 0);
  const gen1 = buildUnoHouseDeck(1, 1);
  const otherRound = buildUnoHouseDeck(2, 0);
  const ids0 = gen0.map((card) => card.id);
  const ids1 = gen1.map((card) => card.id);
  const ids2 = otherRound.map((card) => card.id);
  assert.equal(new Set([...ids0, ...ids1]).size, ids0.length + ids1.length);
  assert.equal(new Set([...ids0, ...ids2]).size, ids0.length + ids2.length);
  assert.equal(new Set(ids1).size, ids1.length);
});

test('house deck：cardColor / isWild / isPenaltyCard', () => {
  assert.equal(cardColor(numberCard('x', 'green', 7)), 'green');
  assert.equal(cardColor(wildCard('x')), null);
  assert.equal(cardColor(wild4Card('x')), null);
  assert.equal(isWild(wildCard('x')), true);
  assert.equal(isWild(wild4Card('x')), true);
  assert.equal(isWild(numberCard('x')), false);
  assert.equal(isPenaltyCard(actionCard('x', 'draw2')), 'draw2');
  assert.equal(isPenaltyCard(wild4Card('x')), 'wild4');
  assert.equal(isPenaltyCard(actionCard('x', 'skip')), null);
  assert.equal(isPenaltyCard(wildCard('x')), null);
  assert.equal(isPenaltyCard(numberCard('x')), null);
});

test('house deck：cardScore 数字面值 / 行动 20 / 万能 50', () => {
  assert.equal(cardScore(numberCard('x', 'red', 0)), 0);
  assert.equal(cardScore(numberCard('x', 'red', 7)), 7);
  assert.equal(cardScore(numberCard('x', 'blue', 9)), 9);
  assert.equal(cardScore(actionCard('x', 'skip')), 20);
  assert.equal(cardScore(actionCard('x', 'reverse')), 20);
  assert.equal(cardScore(actionCard('x', 'draw2')), 20);
  assert.equal(cardScore(wildCard('x')), 50);
  assert.equal(cardScore(wild4Card('x')), 50);
});

test('house deck：isLegalPlay 同色/同面/万能矩阵', () => {
  const topRed3 = numberCard('top-red-3', 'red', 3);
  const topRedSkip = actionCard('top-red-skip', 'skip', 'red');
  // 同顶牌颜色
  assert.equal(isLegalPlay(numberCard('red-9', 'red', 9), topRed3, 'green'), true);
  // 同面不同色
  assert.equal(isLegalPlay(numberCard('blue-3', 'blue', 3), topRed3, 'blue'), true);
  // 同行动种类
  assert.equal(isLegalPlay(actionCard('blue-skip', 'skip', 'blue'), topRedSkip, 'blue'), true);
  // 同当前颜色
  assert.equal(isLegalPlay(numberCard('green-7', 'green', 7), topRed3, 'green'), true);
  // 万能牌恒合法
  assert.equal(isLegalPlay(wildCard('wild'), topRed3, 'red'), true);
  assert.equal(isLegalPlay(wild4Card('wild4'), topRedSkip, 'blue'), true);
  // 不同色不同面不合法
  assert.equal(isLegalPlay(numberCard('blue-5', 'blue', 5), topRed3, 'green'), false);
  // 行动牌不能盖不同色数字
  assert.equal(isLegalPlay(actionCard('blue-skip', 'skip', 'blue'), topRed3, 'green'), false);
});

test('house deck：recycleKeepTop 保留顶牌并把其余洗回牌堆', () => {
  const zones = zonesWith(
    [],
    [
      numberCard('r1:g0:yellow-1', 'yellow', 1),
      numberCard('r1:g0:green-1', 'green', 1),
      numberCard('r1:g0:red-1', 'red', 1),
    ],
    [],
  );
  const recycled = recycleKeepTop(zones, createSeededRandom('house-recycle'));
  assert.deepEqual(zoneOf(recycled, 'discardPile').map((card) => card.id), ['r1:g0:red-1']);
  assert.equal(new Set(zoneOf(recycled, 'deck').map((card) => card.id)).size, 2);
  assert.ok(zoneOf(recycled, 'deck').some((card) => card.id === 'r1:g0:yellow-1'));
  assert.ok(zoneOf(recycled, 'deck').some((card) => card.id === 'r1:g0:green-1'));
  assertUniqueAcrossZones(recycled);
});

test('house deck：recycleKeepTop 只剩顶牌时抛不变量错误', () => {
  const zones = zonesWith([], [numberCard('r1:g0:red-1', 'red', 1)], []);
  assert.throws(() => recycleKeepTop(zones, createSeededRandom('house-recycle-empty')), /不变量/);
});

test('house deck：drawWithExpansion 跨回收 + 一次补牌完成大额摸牌且保持唯一', () => {
  const zones = zonesWith(
    [
      numberCard('r1:g0:blue-1', 'blue', 1),
      numberCard('r1:g0:blue-2', 'blue', 2),
      numberCard('r1:g0:blue-3', 'blue', 3),
    ],
    [
      numberCard('r1:g0:green-1', 'green', 1),
      numberCard('r1:g0:green-2', 'green', 2),
      numberCard('r1:g0:green-3', 'green', 3),
    ],
    ['p1'],
  );
  const result = drawWithExpansion(zones, 'p1', 20, createSeededRandom('house-draw-expand'), 1);
  assert.equal(result.drawn.length, 20);
  assert.equal(result.deckGenerationsUsed, 1);
  assert.deepEqual(zoneOf(result.zones, 'discardPile').map((card) => card.id), ['r1:g0:green-3']);
  assert.equal(zoneOf(result.zones, handZone('p1')).length, 20);
  assertUniqueAcrossZones(result.zones);
  for (const card of result.drawn) {
    assert.match(card.id, /^r1:g[01]:/);
  }
});

test('house deck：drawWithExpansion 一次操作可补两个 generation', () => {
  const zones = zonesWith(
    [
      numberCard('r1:g0:blue-1', 'blue', 1),
      numberCard('r1:g0:blue-2', 'blue', 2),
    ],
    [numberCard('r1:g0:red-1', 'red', 1)],
    ['p1'],
  );
  const result = drawWithExpansion(zones, 'p1', 150, createSeededRandom('house-draw-two-gens'), 1);
  assert.equal(result.drawn.length, 150);
  assert.equal(result.deckGenerationsUsed, 2);
  assertUniqueAcrossZones(result.zones);
  for (const card of result.drawn) {
    assert.match(card.id, /^r1:g[012]:/);
  }
});

test('house deck：drawWithExpansion 非法数量抛不变量错误', () => {
  const zones = zonesWith([numberCard('r1:g0:red-1', 'red', 1)], [], ['p1']);
  const random = createSeededRandom('house-draw-invalid');
  assert.throws(() => drawWithExpansion(zones, 'p1', -1, random, 1), /不合法/);
  assert.throws(() => drawWithExpansion(zones, 'p1', 2.5, random, 1), /不合法/);
});

test('house deck：dealInitialHands 每人发 7 张', () => {
  const players = ['p1', 'p2', 'p3', 'p4'];
  const deck = shuffleCards(buildUnoHouseDeck(1, 0), createSeededRandom('house-deal'));
  const dealt = dealInitialHands(zonesWith(deck, [], players), players);
  for (const playerId of players) {
    assert.equal(zoneOf(dealt, handZone(playerId)).length, 7);
  }
  assert.equal(zoneOf(dealt, 'deck').length, UNO_HOUSE_GENERATION_SIZE - 28);
  assertUniqueAcrossZones(dealt);
});

test('house deck：createHouseZones 映射 round 到 deck/discardPile/hand:<id>', () => {
  const round: UnoHouseRoundState = {
    roundNumber: 1,
    phase: 'round_playing',
    players: ['p1', 'p2'],
    hands: { p1: [numberCard('r1:g0:red-5-1', 'red', 5)], p2: [] },
    deck: [numberCard('r1:g0:blue-1', 'blue', 1)],
    discardPile: [numberCard('r1:g0:red-3-1', 'red', 3)],
    topDiscard: numberCard('r1:g0:red-3-1', 'red', 3),
    currentColor: 'red',
    direction: 1,
    currentPlayerId: 'p1',
    hasDrawnThisTurn: false,
    pendingPenalty: null,
    unoRaceWindow: null,
    preCallPlayerIds: { p1: false, p2: false },
    deckGenerationCount: 1,
    turnToken: 'r1:t1',
    turnIndex: 0,
    sequence: 0,
    turnDeadlineAt: null,
    windowDeadlineAt: null,
  };
  const zones = createHouseZones(round);
  assert.deepEqual(zoneOf(zones, 'deck').map((card) => card.id), ['r1:g0:blue-1']);
  assert.deepEqual(zoneOf(zones, 'discardPile').map((card) => card.id), ['r1:g0:red-3-1']);
  assert.deepEqual(zoneOf(zones, handZone('p1')).map((card) => card.id), ['r1:g0:red-5-1']);
  assert.deepEqual(zoneOf(zones, handZone('p2')), []);
});

test('house deck：同种子 + 同操作产生完全一致的 id 顺序', () => {
  const a = shuffleCards(buildUnoHouseDeck(3, 0), createSeededRandom('house-seed'));
  const b = shuffleCards(buildUnoHouseDeck(3, 0), createSeededRandom('house-seed'));
  assert.deepEqual(a.map((card) => card.id), b.map((card) => card.id));

  const setup = (): CardZoneState<string, UnoHouseCard> => zonesWith(
    [numberCard('r1:g0:blue-1', 'blue', 1)],
    [numberCard('r1:g0:red-1', 'red', 1)],
    ['p1'],
  );
  const first = drawWithExpansion(setup(), 'p1', 12, createSeededRandom('house-draw-seed'), 1);
  const second = drawWithExpansion(setup(), 'p1', 12, createSeededRandom('house-draw-seed'), 1);
  assert.deepEqual(first.drawn.map((card) => card.id), second.drawn.map((card) => card.id));
  const snapshot = (result: { zones: CardZoneState<string, UnoHouseCard> }): Record<string, string[]> =>
    Object.fromEntries(
      Object.entries(result.zones.zones).map(([zone, cards]) => [zone, cards.map((card) => card.id)]),
    );
  assert.deepEqual(snapshot(first), snapshot(second));
});
