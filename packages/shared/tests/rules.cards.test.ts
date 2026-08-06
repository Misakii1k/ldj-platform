import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { RandomSource } from '../src/game/contract.ts';
import { createSeededRandom } from '../src/game/random.ts';
import {
  buildCardDeck,
  dealCards,
  drawCards,
  moveCards,
  recycleDiscardKeepingTop,
  shuffleCards,
  type CardDefinition,
  type CardZoneState,
} from '../src/game/rules/cards.ts';

const definitions: readonly CardDefinition[] = [
  { id: 'guard', count: 2 },
  { id: 'prince', count: 1 },
];

interface TestCard {
  readonly id: string;
  readonly face: string;
}

type TestZone = 'deck' | 'hand-a' | 'hand-b' | 'discard';

function testCard(id: string): TestCard {
  return { id, face: `face-${id}` };
}

function zones(): CardZoneState<'deck' | 'hand' | 'discard'> {
  return { zones: { deck: buildCardDeck(definitions), hand: [], discard: [] } };
}

function customZones(): CardZoneState<TestZone, TestCard> {
  return {
    zones: {
      deck: [testCard('one'), testCard('two'), testCard('three'), testCard('four')],
      'hand-a': [],
      'hand-b': [],
      discard: [],
    },
  };
}

test('建牌堆生成稳定且唯一的实例 ID', () => {
  const first = buildCardDeck(definitions);
  const second = buildCardDeck(definitions);
  assert.deepEqual(first, second);
  assert.deepEqual(first.map((card) => card.id), ['guard:1', 'guard:2', 'prince:1']);
  assert.equal(new Set(first.map((card) => card.id)).size, first.length);
});

test('建牌堆拒绝重复定义和非法数量', () => {
  assert.throws(() => buildCardDeck([{ id: 'guard', count: 1 }, { id: 'guard', count: 1 }]), /重复/);
  for (const count of [0, 1.5, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => buildCardDeck([{ id: 'guard', count }]), /正安全整数/);
  }
});

test('抽牌按牌堆顺序移动且保留自定义对象', () => {
  const one = testCard('one');
  const state: CardZoneState<'deck' | 'hand', TestCard> = {
    zones: { deck: [one, testCard('two'), testCard('three')], hand: [] },
  };
  const result = drawCards(state, 'deck', 'hand', 2);
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.deepEqual(result.cards.map((card) => card.id), ['one', 'two']);
  assert.equal(result.cards[0], one);
  assert.deepEqual(result.state.zones.deck.map((card) => card.id), ['three']);
  assert.deepEqual(result.state.zones.hand.map((card) => card.id), ['one', 'two']);
  assert.deepEqual(result.state.zones.hand[0], { id: 'one', face: 'face-one' });
  assert.equal('definitionId' in result.state.zones.hand[0]!, false);
  assert.equal(state.zones.deck.length, 3);
  assert.equal(state.zones.hand.length, 0);
});

test('抽牌拒绝缺失牌区、同区、非法数量、空区和数量不足', () => {
  const missing = { zones: { deck: [testCard('one')] } } as unknown as CardZoneState<'deck' | 'hand', TestCard>;
  assert.deepEqual(drawCards(missing, 'deck', 'hand'), { ok: false, error: 'ZONE_NOT_FOUND' });
  assert.deepEqual(drawCards(customZones(), 'deck', 'deck'), { ok: false, error: 'SAME_ZONE' });
  for (const count of [0, -1, 1.5, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
    assert.deepEqual(drawCards(customZones(), 'deck', 'hand-a', count), { ok: false, error: 'INVALID_COUNT' });
  }
  const empty: CardZoneState<'deck' | 'hand', TestCard> = { zones: { deck: [], hand: [] } };
  assert.deepEqual(drawCards(empty, 'deck', 'hand'), { ok: false, error: 'EMPTY_ZONE' });
  assert.deepEqual(drawCards(customZones(), 'deck', 'hand-a', 5), { ok: false, error: 'INSUFFICIENT_CARDS' });
});

test('按请求顺序移动实例且不修改输入', () => {
  const state = zones();
  const moved = moveCards(state, 'deck', 'discard', ['guard:2', 'prince:1']);
  assert.equal(moved.ok, true);
  if (!moved.ok) return;

  assert.deepEqual(moved.cards.map((card) => card.id), ['guard:2', 'prince:1']);
  assert.deepEqual(moved.state.zones.deck.map((card) => card.id), ['guard:1']);
  assert.deepEqual(moved.state.zones.discard.map((card) => card.id), ['guard:2', 'prince:1']);
  assert.deepEqual(state.zones.deck.map((card) => card.id), ['guard:1', 'guard:2', 'prince:1']);
  assert.deepEqual(state.zones.discard, []);
});

test('移动拒绝缺失牌区、同区、空请求、重复请求和缺失实例', () => {
  const state = zones();
  const missing = { zones: { deck: state.zones.deck } } as unknown as CardZoneState<'deck' | 'hand', typeof state.zones.deck[number]>;
  assert.deepEqual(moveCards(missing, 'deck', 'hand', ['guard:1']), { ok: false, error: 'ZONE_NOT_FOUND' });
  assert.deepEqual(moveCards(state, 'deck', 'deck', ['guard:1']), { ok: false, error: 'SAME_ZONE' });
  assert.deepEqual(moveCards(state, 'deck', 'hand', []), { ok: false, error: 'EMPTY_REQUEST' });
  assert.deepEqual(moveCards(state, 'deck', 'hand', ['guard:1', 'guard:1']), {
    ok: false,
    error: 'DUPLICATE_REQUESTED_CARD',
  });
  assert.deepEqual(moveCards(state, 'deck', 'hand', ['missing']), { ok: false, error: 'CARD_NOT_FOUND' });
});

test('所有区域在操作前拒绝同区或跨区重复实例 ID', () => {
  const duplicateInZone: CardZoneState<'deck' | 'hand', TestCard> = {
    zones: { deck: [testCard('same'), testCard('same')], hand: [] },
  };
  const duplicateAcrossZones: CardZoneState<'deck' | 'hand', TestCard> = {
    zones: { deck: [testCard('same')], hand: [testCard('same')] },
  };

  assert.deepEqual(drawCards(duplicateInZone, 'deck', 'hand'), { ok: false, error: 'DUPLICATE_CARD_ID' });
  assert.deepEqual(moveCards(duplicateAcrossZones, 'deck', 'hand', ['same']), {
    ok: false,
    error: 'DUPLICATE_CARD_ID',
  });
});

test('轮流发牌按目标顺序逐轮追加且原状态不变', () => {
  const state = customZones();
  const result = dealCards(state, 'deck', ['hand-a', 'hand-b'], 2);
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.deepEqual(result.cards.map((card) => card.id), ['one', 'two', 'three', 'four']);
  assert.deepEqual(result.state.zones.deck, []);
  assert.deepEqual(result.state.zones['hand-a'].map((card) => card.id), ['one', 'three']);
  assert.deepEqual(result.state.zones['hand-b'].map((card) => card.id), ['two', 'four']);
  assert.deepEqual(state.zones.deck.map((card) => card.id), ['one', 'two', 'three', 'four']);
  assert.deepEqual(state.zones['hand-a'], []);
});

test('轮流发牌拒绝非法目标、数量和不足牌数并保持原子性', () => {
  const state = customZones();
  const before = structuredClone(state);
  assert.deepEqual(dealCards(state, 'deck', [], 1), { ok: false, error: 'EMPTY_REQUEST' });
  assert.deepEqual(dealCards(state, 'deck', ['hand-a', 'hand-a'], 1), {
    ok: false,
    error: 'DUPLICATE_DESTINATION',
  });
  assert.deepEqual(dealCards(state, 'deck', ['deck'], 1), { ok: false, error: 'SAME_ZONE' });
  for (const count of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.deepEqual(dealCards(state, 'deck', ['hand-a'], count), { ok: false, error: 'INVALID_COUNT' });
  }
  assert.deepEqual(dealCards(state, 'deck', ['hand-a', 'hand-b'], 3), {
    ok: false,
    error: 'INSUFFICIENT_CARDS',
  });
  assert.deepEqual(state, before);
});

test('轮流发牌拒绝缺失牌区和损坏的重复实例状态', () => {
  const missing = { zones: { deck: [testCard('one')], 'hand-a': [] } } as unknown as CardZoneState<TestZone, TestCard>;
  assert.deepEqual(dealCards(missing, 'deck', ['hand-a', 'hand-b'], 1), {
    ok: false,
    error: 'ZONE_NOT_FOUND',
  });
  const duplicate = customZones();
  const damaged: CardZoneState<TestZone, TestCard> = {
    zones: { ...duplicate.zones, discard: [testCard('one')] },
  };
  assert.deepEqual(dealCards(damaged, 'deck', ['hand-a'], 1), {
    ok: false,
    error: 'DUPLICATE_CARD_ID',
  });
});

test('回收保留弃牌顶牌、确定性洗牌并精确消耗随机', () => {
  const state: CardZoneState<'deck' | 'discard', TestCard> = {
    zones: {
      deck: [],
      discard: [testCard('one'), testCard('two'), testCard('three'), testCard('top')],
    },
  };
  const random = createSeededRandom('cards-recycle', 7);
  const first = recycleDiscardKeepingTop(state, 'deck', 'discard', random);
  assert.equal(first.ok, true);
  if (!first.ok) return;

  assert.equal(random.getCursor(), 9);
  assert.deepEqual(first.state.zones.discard.map((card) => card.id), ['top']);
  assert.deepEqual(first.state.zones.deck, first.cards);
  assert.deepEqual(
    [...first.state.zones.deck, ...first.state.zones.discard].map((card) => card.id).sort(),
    ['one', 'three', 'top', 'two'],
  );
  assert.deepEqual(state.zones.deck, []);
  assert.deepEqual(state.zones.discard.map((card) => card.id), ['one', 'two', 'three', 'top']);

  const repeatRandom = createSeededRandom('cards-recycle', 7);
  const repeat = recycleDiscardKeepingTop(state, 'deck', 'discard', repeatRandom);
  assert.equal(repeat.ok, true);
  if (repeat.ok) assert.deepEqual(repeat.state, first.state);
});

test('回收一张可回收牌不消耗随机', () => {
  const state: CardZoneState<'deck' | 'discard', TestCard> = {
    zones: { deck: [], discard: [testCard('one'), testCard('top')] },
  };
  const random = createSeededRandom('cards-single', 11);
  const result = recycleDiscardKeepingTop(state, 'deck', 'discard', random);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(random.getCursor(), 11);
  assert.deepEqual(result.state.zones.deck.map((card) => card.id), ['one']);
  assert.deepEqual(result.state.zones.discard.map((card) => card.id), ['top']);
});

test('回收拒绝缺失/相同牌区、非空摸牌堆及无可回收牌且不调用随机', () => {
  let shuffleCalls = 0;
  const random: Pick<RandomSource, 'shuffle'> = {
    shuffle: <T>(items: readonly T[]) => {
      shuffleCalls += 1;
      return [...items];
    },
  };
  const missing = { zones: { deck: [] } } as unknown as CardZoneState<'deck' | 'discard', TestCard>;
  assert.deepEqual(recycleDiscardKeepingTop(missing, 'deck', 'discard', random), {
    ok: false,
    error: 'ZONE_NOT_FOUND',
  });
  const normal: CardZoneState<'deck' | 'discard', TestCard> = {
    zones: { deck: [], discard: [testCard('one'), testCard('top')] },
  };
  assert.deepEqual(recycleDiscardKeepingTop(normal, 'deck', 'deck', random), {
    ok: false,
    error: 'SAME_ZONE',
  });
  assert.deepEqual(
    recycleDiscardKeepingTop(
      { zones: { deck: [testCard('draw')], discard: [testCard('one'), testCard('top')] } },
      'deck',
      'discard',
      random,
    ),
    { ok: false, error: 'DRAW_PILE_NOT_EMPTY' },
  );
  assert.deepEqual(
    recycleDiscardKeepingTop({ zones: { deck: [], discard: [] } }, 'deck', 'discard', random),
    { ok: false, error: 'EMPTY_ZONE' },
  );
  assert.deepEqual(
    recycleDiscardKeepingTop({ zones: { deck: [], discard: [testCard('top')] } }, 'deck', 'discard', random),
    { ok: false, error: 'NO_RECYCLABLE_CARDS' },
  );
  assert.equal(shuffleCalls, 0);
});

test('回收拒绝重复实例且不消耗随机', () => {
  let shuffleCalls = 0;
  const random: Pick<RandomSource, 'shuffle'> = {
    shuffle: <T>(items: readonly T[]) => {
      shuffleCalls += 1;
      return [...items];
    },
  };
  const damaged: CardZoneState<'deck' | 'discard', TestCard> = {
    zones: { deck: [], discard: [testCard('same'), testCard('same')] },
  };
  assert.deepEqual(recycleDiscardKeepingTop(damaged, 'deck', 'discard', random), {
    ok: false,
    error: 'DUPLICATE_CARD_ID',
  });
  assert.equal(shuffleCalls, 0);
});

test('洗牌隔离会原地修改参数的随机源', () => {
  const deck = [testCard('one'), testCard('two'), testCard('three')];
  const before = [...deck];
  const random: Pick<RandomSource, 'shuffle'> = {
    shuffle: <T>(items: readonly T[]) => {
      const mutable = items as T[];
      mutable.reverse();
      return mutable;
    },
  };

  const shuffled = shuffleCards(deck, random);
  assert.deepEqual(shuffled.map((card) => card.id), ['three', 'two', 'one']);
  assert.deepEqual(deck, before);
});
