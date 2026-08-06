import test from 'node:test';
import assert from 'node:assert/strict';
import type { Actor, GameContext } from '@ldj/shared';
import { unoModule, type UnoCard, type UnoState } from '../server/module.ts';

const ctx: GameContext = {
  now: 1,
  random: { nextInt: () => 0, shuffle: <T>(items: readonly T[]) => [...items] },
};
const actor = (playerId: string): Actor => ({ kind: 'player' as const, playerId });
const systemActor: Actor = { kind: 'system', source: 'admin' };

function card(
  id: string,
  kind: UnoCard['kind'],
  color?: 'red' | 'yellow' | 'green' | 'blue',
  value?: number,
): UnoCard {
  return kind === 'number'
    ? { id, kind, color: color!, value: value! }
    : kind === 'wild' || kind === 'wild4'
      ? { id, kind }
      : { id, kind, color: color! };
}

function state(hand: UnoCard[], top: UnoCard): UnoState {
  return {
    schemaVersion: 1,
    phase: 'playing',
    players: ['a', 'b'],
    deck: [card('draw', 'number', 'blue', 1)],
    discardPile: [top],
    hands: { a: hand, b: [card('b-secret', 'number', 'green', 2)] },
    playerState: { a: { unoCalled: false }, b: { unoCalled: false } },
    currentPlayerId: 'a',
    direction: 1,
    currentColor: 'red',
    pendingDraw: 0,
    hasDrawnThisTurn: false,
    winnerId: null,
    lastPlayed: null,
  };
}

function assertNoCardAdapterFields(value: unknown): void {
  const serialized = JSON.stringify(value);
  assert.equal(serialized.includes('"zones"'), false);
  assert.equal(serialized.includes('"definitionId"'), false);
}

test('UNO 发牌、牌数和私有视图正确', () => {
  const initial = unoModule.createInitialState(ctx, ['a', 'b'], { variant: 'standard' });
  assert.equal(initial.hands.a!.length, 7);
  assert.equal(initial.hands.b!.length, 7);
  assert.equal(initial.deck.length + initial.discardPile.length + initial.hands.a!.length + initial.hands.b!.length, 108);
  assert.equal(new Set([...initial.deck, ...initial.discardPile, ...initial.hands.a!, ...initial.hands.b!].map((c) => c.id)).size, 108);

  const beforeViewBuild = structuredClone(initial);
  const a = unoModule.getPlayerView(initial, 'a');
  const b = unoModule.getPlayerView(initial, 'b');
  const unknown = unoModule.getPlayerView(initial, 'not-seated');
  const spectator = unoModule.getSpectatorView(initial);
  assert.deepEqual(initial, beforeViewBuild);
  assert.equal(a.me?.hand.length, 7);
  assert.equal(b.me?.hand.length, 7);
  assert.equal(unknown.me, null);
  assert.equal('hands' in spectator, false);
  assert.equal('me' in spectator, false);
  assert.equal(spectator.lastPlayed, null);
  assert.equal(spectator.deckCount, initial.deck.length);
  assert.equal(spectator.discardCount, 1);
  assert.equal(spectator.currentPlayerIndex, 0);
  assert.equal(spectator.nextPlayerId, 'b');
  assert.deepEqual(spectator.players.map((p) => p.isCurrentPlayer), [true, false]);
  assert.deepEqual(Object.keys(spectator), [
    'gameId',
    'phase',
    'players',
    'topDiscard',
    'currentColor',
    'currentPlayerId',
    'currentPlayerIndex',
    'nextPlayerId',
    'direction',
    'pendingDraw',
    'winnerId',
    'deckCount',
    'discardCount',
    'lastPlayed',
    'lastPlayedCard',
    'lastPlayedBy',
  ]);
  assert.deepEqual(Object.keys(a), [...Object.keys(spectator), 'me']);
  assert.deepEqual(Object.keys(a.me!), [
    'playerId',
    'hand',
    'hasDrawnThisTurn',
    'isCurrentPlayer',
    'playableCardIds',
  ]);

  const legacySnapshot = { ...initial };
  delete legacySnapshot.lastPlayed;
  assert.equal(unoModule.getSpectatorView(legacySnapshot).lastPlayed, null);
});

test('UNO 初始化拒绝重复玩家且不消耗随机', () => {
  let shuffleCalls = 0;
  const countingContext: GameContext = {
    now: 1,
    random: {
      nextInt: () => 0,
      shuffle: <T>(items: readonly T[]) => {
        shuffleCalls += 1;
        return [...items];
      },
    },
  };

  assert.throws(
    () => unoModule.createInitialState(countingContext, ['a', 'a'], { variant: 'standard' }),
    /UNO 玩家不能重复/,
  );
  assert.equal(shuffleCalls, 0);
});

test('UNO begin 可重复执行且不会重置对局', () => {
  const initial = state([card('red5', 'number', 'red', 5)], card('red3', 'number', 'red', 3));
  const first = unoModule.reduce(ctx, initial, systemActor, { type: 'begin' });
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.equal(first.state, initial);
  assert.deepEqual(first.events, []);

  const second = unoModule.reduce(ctx, first.state, systemActor, { type: 'begin' });
  assert.equal(second.ok, true);
  if (!second.ok) return;
  assert.equal(second.state, initial);
  assert.deepEqual(second.events, []);
});

test('UNO 拒绝不匹配牌，支持同色和万能牌', () => {
  const bad = state([card('blue5', 'number', 'blue', 5)], card('red3', 'number', 'red', 3));
  assert.equal(unoModule.reduce(ctx, bad, actor('a'), { type: 'play_card', cardId: 'blue5' }).ok, false);
  const good = state([card('red5', 'number', 'red', 5), card('wild', 'wild')], card('red3', 'number', 'red', 3));
  assert.equal(unoModule.reduce(ctx, good, actor('a'), { type: 'play_card', cardId: 'red5' }).ok, true);
  assert.equal(unoModule.reduce(ctx, good, actor('a'), { type: 'play_card', cardId: 'wild' }).ok, false);
  const wild = unoModule.reduce(ctx, good, actor('a'), { type: 'play_card', cardId: 'wild', declaredColor: 'blue' });
  assert.equal(wild.ok, true);
  if (wild.ok) assert.equal(wild.state.currentColor, 'blue');
});

test('UNO 公开视图展示最近出牌且不泄露其他玩家手牌', () => {
  const current = state(
    [card('red5', 'number', 'red', 5), card('blue9-secret', 'number', 'blue', 9)],
    card('red3', 'number', 'red', 3),
  );
  const before = unoModule.getPlayerView(current, 'a');
  assert.deepEqual(before.me?.playableCardIds, ['red5']);

  const played = unoModule.reduce(ctx, current, actor('a'), { type: 'play_card', cardId: 'red5' });
  assert.equal(played.ok, true);
  if (!played.ok) return;

  const aView = unoModule.getPlayerView(played.state, 'a');
  const bView = unoModule.getPlayerView(played.state, 'b');
  const spectator = unoModule.getSpectatorView(played.state);

  assert.equal(spectator.topDiscard.id, 'red5');
  assert.equal(spectator.lastPlayed?.playerId, 'a');
  assert.equal(spectator.lastPlayed?.card.id, 'red5');
  assert.equal(spectator.lastPlayed?.declaredColor, null);
  assert.equal(spectator.lastPlayed?.resultingColor, 'red');
  assert.equal(spectator.lastPlayedCard?.id, 'red5');
  assert.equal(spectator.lastPlayedBy, 'a');
  assert.equal(spectator.currentPlayerId, 'b');
  assert.equal(spectator.currentPlayerIndex, 1);
  assert.equal(spectator.nextPlayerId, 'a');
  assert.equal(spectator.deckCount, 1);
  assert.equal(spectator.discardCount, 2);
  assert.deepEqual(spectator.players.map((p) => ({ id: p.playerId, handCount: p.handCount, current: p.isCurrentPlayer })), [
    { id: 'a', handCount: 1, current: false },
    { id: 'b', handCount: 1, current: true },
  ]);

  assert.equal(JSON.stringify(spectator).includes('b-secret'), false);
  assert.equal(JSON.stringify(spectator).includes('blue9-secret'), false);
  assert.equal(JSON.stringify(aView).includes('b-secret'), false);
  assert.equal(JSON.stringify(bView).includes('b-secret'), true);
  assert.equal(JSON.stringify(bView).includes('blue9-secret'), false);
});

test('UNO 普通摸牌从牌堆头追加到手牌尾且不洗牌', () => {
  let shuffleCalls = 0;
  const drawContext: GameContext = {
    now: 1,
    random: {
      nextInt: () => 0,
      shuffle: <T>(items: readonly T[]) => {
        shuffleCalls += 1;
        return [...items];
      },
    },
  };
  const current = state(
    [card('held', 'number', 'green', 4)],
    card('top', 'number', 'red', 3),
  );
  current.deck = [
    card('draw-1', 'number', 'blue', 1),
    card('draw-2', 'number', 'yellow', 2),
  ];
  const before = structuredClone(current);

  const result = unoModule.reduce(drawContext, current, actor('a'), { type: 'draw_card' });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.deepEqual(result.state.hands.a?.map((item) => item.id), ['held', 'draw-1']);
  assert.deepEqual(result.state.deck.map((item) => item.id), ['draw-2']);
  assert.deepEqual(result.state.discardPile.map((item) => item.id), ['top']);
  assert.deepEqual(result.state.hands.b?.map((item) => item.id), ['b-secret']);
  assert.equal(result.state.hasDrawnThisTurn, true);
  assert.deepEqual(result.events, [{ type: 'card_drawn', playerId: 'a', count: 1 }]);
  assert.equal(shuffleCalls, 0);
  assert.deepEqual(current, before);
  assertNoCardAdapterFields(result.state);
  assertNoCardAdapterFields(result.events);
});

test('UNO 罚摸可跨弃牌回收边界并保留不足时部分成功语义', () => {
  const shuffleInputs: string[][] = [];
  const drawContext: GameContext = {
    now: 1,
    random: {
      nextInt: () => 0,
      shuffle: <T>(items: readonly T[]) => {
        shuffleInputs.push((items as readonly UnoCard[]).map((item) => item.id));
        return [...items].reverse();
      },
    },
  };
  const current = state(
    [card('held', 'number', 'green', 4)],
    card('top', 'number', 'red', 3),
  );
  current.currentPlayerId = 'b';
  current.pendingDraw = 4;
  current.deck = [card('deck-last', 'number', 'blue', 1)];
  current.discardPile = [
    card('recycle-1', 'number', 'green', 7),
    card('recycle-2', 'number', 'yellow', 8),
    card('top', 'number', 'red', 3),
  ];
  const before = structuredClone(current);

  const result = unoModule.reduce(drawContext, current, actor('b'), { type: 'draw_card' });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.deepEqual(result.state.hands.b?.map((item) => item.id), [
    'b-secret',
    'deck-last',
    'recycle-2',
    'recycle-1',
  ]);
  assert.deepEqual(result.state.deck, []);
  assert.deepEqual(result.state.discardPile.map((item) => item.id), ['top']);
  assert.deepEqual(shuffleInputs, [['recycle-1', 'recycle-2']]);
  assert.equal(result.state.pendingDraw, 0);
  assert.equal(result.state.currentPlayerId, 'a');
  assert.equal(result.state.hasDrawnThisTurn, false);
  assert.deepEqual(result.events, [{ type: 'card_drawn', playerId: 'b', count: 3 }]);
  assert.deepEqual(current, before);
});

test('UNO 只剩弃牌顶牌时摸零张并保留 legacy 回合状态', () => {
  let shuffleCalls = 0;
  const drawContext: GameContext = {
    now: 1,
    random: {
      nextInt: () => 0,
      shuffle: <T>(items: readonly T[]) => {
        shuffleCalls += 1;
        return [...items];
      },
    },
  };
  const current = state(
    [card('held', 'number', 'green', 4)],
    card('top', 'number', 'red', 3),
  );
  current.deck = [];
  const before = structuredClone(current);

  const result = unoModule.reduce(drawContext, current, actor('a'), { type: 'draw_card' });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.deepEqual(result.state.hands.a?.map((item) => item.id), ['held']);
  assert.deepEqual(result.state.deck, []);
  assert.deepEqual(result.state.discardPile.map((item) => item.id), ['top']);
  assert.equal(result.state.hasDrawnThisTurn, true);
  assert.deepEqual(result.events, [{ type: 'card_drawn', playerId: 'a', count: 0 }]);
  assert.equal(shuffleCalls, 0);
  assert.deepEqual(current, before);
});

test('UNO 出牌按实例移动并保持事件、视角和输入结构', () => {
  const current = state(
    [
      card('before', 'number', 'blue', 1),
      card('play', 'number', 'red', 5),
      card('after', 'number', 'green', 6),
    ],
    card('top', 'number', 'red', 3),
  );
  current.discardPile = [
    card('discard-old', 'number', 'yellow', 2),
    card('top', 'number', 'red', 3),
  ];
  const before = structuredClone(current);

  const result = unoModule.reduce(ctx, current, actor('a'), { type: 'play_card', cardId: 'play' });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.deepEqual(result.state.hands.a?.map((item) => item.id), ['before', 'after']);
  assert.deepEqual(result.state.discardPile.map((item) => item.id), ['discard-old', 'top', 'play']);
  assert.deepEqual(result.events, [{ type: 'card_played', playerId: 'a', card: card('play', 'number', 'red', 5) }]);
  assert.deepEqual(result.state.lastPlayed, {
    playerId: 'a',
    card: card('play', 'number', 'red', 5),
    declaredColor: null,
    resultingColor: 'red',
  });
  assert.deepEqual(current, before);
  assertNoCardAdapterFields(result.state);
  assertNoCardAdapterFields(result.events);
  assertNoCardAdapterFields(unoModule.getPlayerView(result.state, 'a'));
  assertNoCardAdapterFields(unoModule.getSpectatorView(result.state));
});

test('UNO 行动牌推进、罚摸与清空手牌获胜', () => {
  const current = state(
    [card('d2', 'draw2', 'red'), card('last', 'number', 'red', 9)],
    card('red3', 'number', 'red', 3),
  );
  const played = unoModule.reduce(ctx, current, actor('a'), { type: 'play_card', cardId: 'd2' });
  assert.equal(played.ok, true);
  if (!played.ok) return;
  assert.equal(played.state.pendingDraw, 2);
  assert.equal(played.state.lastPlayed?.card.id, 'd2');

  const drawn = unoModule.reduce(ctx, played.state, actor('b'), { type: 'draw_card' });
  assert.equal(drawn.ok, true);
  if (!drawn.ok) return;
  assert.equal(drawn.state.hands.b!.length, 3);

  const winState = {
    ...drawn.state,
    currentPlayerId: 'a',
    currentColor: 'red' as const,
    hands: { ...drawn.state.hands, a: [card('last', 'number', 'red', 9)] },
  };
  const won = unoModule.reduce(ctx, winState, actor('a'), { type: 'play_card', cardId: 'last' });
  assert.equal(won.ok, true);
  if (won.ok) {
    assert.equal(won.state.phase, 'game_over');
    assert.equal(won.state.lastPlayed?.card.id, 'last');
    assert.deepEqual(unoModule.getResult(won.state), { winnerId: 'a' });
  }
});
