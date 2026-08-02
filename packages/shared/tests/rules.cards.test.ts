import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { RandomSource } from '../src/game/contract.ts';
import {
  buildCardDeck,
  drawCards,
  moveCards,
  shuffleCards,
  type CardDefinition,
  type CardZoneState,
} from '../src/game/rules/cards.ts';

const definitions: readonly CardDefinition[] = [
  { id: 'guard', count: 2 },
  { id: 'prince', count: 1 },
];

function zones(): CardZoneState<'deck' | 'hand' | 'discard'> {
  return { zones: { deck: buildCardDeck(definitions), hand: [], discard: [] } };
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
  assert.throws(() => buildCardDeck([{ id: 'guard', count: 0 }]), /正整数/);
});

test('抽牌按牌堆顺序移动且不修改输入', () => {
  const state = zones();
  const result = drawCards(state, 'deck', 'hand', 2);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.cards.map((card) => card.id), ['guard:1', 'guard:2']);
  assert.deepEqual(result.state.zones.deck.map((card) => card.id), ['prince:1']);
  assert.deepEqual(result.state.zones.hand.map((card) => card.id), ['guard:1', 'guard:2']);
  assert.equal(state.zones.deck.length, 3);
  assert.equal(state.zones.hand.length, 0);
});

test('空牌堆和不足数量返回显式错误', () => {
  const empty: CardZoneState<'deck' | 'hand'> = { zones: { deck: [], hand: [] } };
  assert.deepEqual(drawCards(empty, 'deck', 'hand'), { ok: false, error: 'EMPTY_ZONE' });
  assert.deepEqual(drawCards(zones(), 'deck', 'hand', 4), { ok: false, error: 'INSUFFICIENT_CARDS' });
});

test('按实例 ID 移动区域且拒绝重复或缺失卡牌', () => {
  const state = zones();
  const moved = moveCards(state, 'deck', 'discard', ['guard:2', 'prince:1']);
  assert.equal(moved.ok, true);
  if (!moved.ok) return;
  assert.deepEqual(moved.cards.map((card) => card.id), ['guard:2', 'prince:1']);
  assert.deepEqual(moved.state.zones.deck.map((card) => card.id), ['guard:1']);
  assert.deepEqual(moved.state.zones.discard.map((card) => card.id), ['guard:2', 'prince:1']);
  assert.deepEqual(moveCards(state, 'deck', 'hand', ['guard:1', 'guard:1']), { ok: false, error: 'DUPLICATE_CARD' });
  assert.deepEqual(moveCards(state, 'deck', 'hand', ['missing']), { ok: false, error: 'CARD_NOT_FOUND' });
});

test('洗牌只使用注入随机源并保持输入不变', () => {
  const calls: string[][] = [];
  const random: RandomSource = {
    nextInt: () => 0,
    shuffle: <T>(items: readonly T[]) => {
      calls.push(items.map(String));
      return [...items].reverse();
    },
  };
  const deck = buildCardDeck(definitions);
  const shuffled = shuffleCards(deck, random);
  assert.deepEqual(shuffled.map((card) => card.id), ['prince:1', 'guard:2', 'guard:1']);
  assert.deepEqual(deck.map((card) => card.id), ['guard:1', 'guard:2', 'prince:1']);
  assert.equal(calls.length, 1);
});
