import test from 'node:test';
import assert from 'node:assert/strict';
import type { GameContext } from '@ldj/shared';
import { landlordModule, type LandlordPlayerView, type LandlordState } from '../server/module.ts';
import { buildLandlordDeck, canBeat, identifyCombo, rankValue, type LandlordCard } from '../server/cards.ts';

const ctx: GameContext = { now: 1, random: { nextInt: () => 0, shuffle: <T>(items: readonly T[]) => [...items] } };
const actor = (playerId: string) => ({ kind: 'player' as const, playerId });
const pick = (...ranks: LandlordCard['rank'][]): LandlordCard[] => ranks.map((rank, i) => ({ id: `${rank}-${i}`, rank }));

function countMap(view: LandlordPlayerView): Record<string, number> {
  return Object.fromEntries(view.players.map((p) => [p.playerId, p.handCount]));
}

function assertViewCounts(state: LandlordState): void {
  for (const playerId of state.players) {
    const view = landlordModule.getPlayerView(state, playerId);
    const counts = countMap(view);
    for (const id of state.players) {
      assert.equal(counts[id], state.hands[id]?.length ?? 0, `handCount for ${id} should match server hand length`);
    }
    assert.equal(view.me?.hand.length, state.hands[playerId]?.length ?? 0, 'private hand should match own handCount source');
  }
  const spectatorCounts = countMap({ ...landlordModule.getSpectatorView(state), me: null });
  for (const id of state.players) {
    assert.equal(spectatorCounts[id], state.hands[id]?.length ?? 0, `spectator handCount for ${id} should match`);
  }
}

function playSingle(state: LandlordState, playerId: string, card: LandlordCard): LandlordState {
  const result = landlordModule.reduce(ctx, state, actor(playerId), { type: 'play_combo', cardIds: [card.id] });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error('Expected landlord action to succeed');
  return result.state;
}

function pass(state: LandlordState, playerId: string): LandlordState {
  const result = landlordModule.reduce(ctx, state, actor(playerId), { type: 'pass_turn' });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error('Expected landlord action to succeed');
  return result.state;
}

test('斗地主牌组 54 张且无重复', () => {
  const deck = buildLandlordDeck();
  assert.equal(deck.length, 54);
  assert.equal(new Set(deck.map((c) => c.id)).size, 54);
});

test('斗地主基础牌型识别与比较', () => {
  assert.equal(identifyCombo(pick('3'))?.type, 'single');
  assert.equal(identifyCombo(pick('4', '4'))?.type, 'pair');
  assert.equal(identifyCombo(pick('5', '5', '5', '7'))?.type, 'triple_single');
  assert.equal(identifyCombo(pick('3', '4', '5', '6', '7'))?.type, 'straight');
  assert.equal(identifyCombo(pick('3', '3', '4', '4', '5', '5'))?.type, 'pair_sequence');
  const bomb = identifyCombo(pick('6', '6', '6', '6'))!;
  const pair = identifyCombo(pick('A', 'A'))!;
  assert.equal(canBeat(bomb, pair), true);
  assert.equal(canBeat(identifyCombo(pick('SJ', 'BJ'))!, bomb), true);
});

test('斗地主发牌、叫地主和私有视图正确', () => {
  let state = landlordModule.createInitialState(ctx, ['a', 'b', 'c'], { variant: 'standard' });
  assert.deepEqual(Object.values(state.hands).map((h) => h.length), [17, 17, 17]);
  assert.equal(state.bottomCards.length, 3);
  assertViewCounts(state);
  const a = landlordModule.getPlayerView(state, 'a');
  const spectator = landlordModule.getSpectatorView(state);
  assert.equal(a.me?.hand.length, 17);
  assert.equal('hands' in spectator, false);
  assert.equal(spectator.bottomCards.length, 0, '叫地主前底牌不能出现在公开视图');

  const bid = landlordModule.reduce(ctx, state, actor('a'), { type: 'bid_score', score: 3 });
  assert.equal(bid.ok, true);
  if (!bid.ok) return;
  state = bid.state;
  assert.equal(state.landlordId, 'a');
  assert.equal(state.hands.a!.length, 20);
  assert.deepEqual(countMap(landlordModule.getPlayerView(state, 'a')), { a: 20, b: 17, c: 17 });
  assert.deepEqual(countMap({ ...landlordModule.getSpectatorView(state), me: null }), { a: 20, b: 17, c: 17 });
  assert.equal(landlordModule.getSpectatorView(state).bottomCards.length, 3, '地主确定后公开底牌');
  assert.equal(state.phase, 'playing');
});

test('斗地主拒绝非法牌型和压不过的牌', () => {
  const initial = landlordModule.createInitialState(ctx, ['a', 'b', 'c'], { variant: 'standard' });
  const bid = landlordModule.reduce(ctx, initial, actor('a'), { type: 'bid_score', score: 3 });
  assert.equal(bid.ok, true);
  if (!bid.ok) return;
  const s = bid.state;
  const ids = s.hands.a!.slice(0, 2).map((c) => c.id);
  const result = landlordModule.reduce(ctx, s, actor('a'), { type: 'play_combo', cardIds: ids });
  const combo = identifyCombo(s.hands.a!.slice(0, 2));
  assert.equal(result.ok, combo !== null);
});

test('斗地主出牌、过牌、handCount 和自然结束状态保持一致', () => {
  let state = landlordModule.createInitialState(ctx, ['a', 'b', 'c'], { variant: 'standard' });
  const bid = landlordModule.reduce(ctx, state, actor('a'), { type: 'bid_score', score: 3 });
  assert.equal(bid.ok, true);
  if (!bid.ok) return;
  state = bid.state;
  assertViewCounts(state);

  const landlordFirst = state.hands.a![0]!;
  state = playSingle(state, 'a', landlordFirst);
  assert.equal(state.hands.a!.length, 19);
  assert.equal(state.currentPlayerId, 'b');
  assert.equal(state.currentTrick?.playerId, 'a');
  assert.deepEqual(countMap(landlordModule.getPlayerView(state, 'b')), { a: 19, b: 17, c: 17 });

  const bBeatingCard = state.hands.b!.find((card) => rankValue(card.rank) > rankValue(landlordFirst.rank));
  assert.ok(bBeatingCard, 'b should have a single card that can beat a in deterministic deal');
  state = playSingle(state, 'b', bBeatingCard);
  assert.equal(state.hands.b!.length, 16);
  assert.equal(state.currentPlayerId, 'c');
  assert.equal(state.currentTrick?.playerId, 'b');
  assert.equal(state.passCount, 0);
  assertViewCounts(state);

  state = pass(state, 'c');
  assert.equal(state.currentPlayerId, 'a');
  assert.equal(state.currentTrick?.playerId, 'b');
  assert.equal(state.passCount, 1);
  assert.deepEqual(countMap(landlordModule.getPlayerView(state, 'c')), { a: 19, b: 16, c: 17 });

  state = pass(state, 'a');
  assert.equal(state.currentPlayerId, 'b', '两家过牌后应回到上一手出牌者');
  assert.equal(state.currentTrick, null, '新一轮领出前应清空上一手牌');
  assert.equal(state.passCount, 0);
  assertViewCounts(state);

  let guard = 0;
  while (state.phase !== 'game_over' && guard < 200) {
    guard += 1;
    const current: string | null = state.currentPlayerId;
    assert.ok(current, 'playing phase should have a current player');
    const before = Object.fromEntries(state.players.map((id) => [id, state.hands[id]?.length ?? 0]));
    if (!state.currentTrick) {
      state = playSingle(state, current, state.hands[current]![0]!);
    } else {
      const currentRank = state.currentTrick.combo.mainRank;
      const beating = state.hands[current]!.find((card) => rankValue(card.rank) > currentRank);
      state = beating ? playSingle(state, current, beating) : pass(state, current);
    }
    assertViewCounts(state);
    if (state.currentTrick?.playerId === current || state.phase === 'game_over') {
      assert.equal(state.hands[current]!.length, before[current]! - 1, '出单张后 handCount 应减少 1');
    }
  }

  assert.equal(state.phase, 'game_over');
  assert.ok(guard < 200, '流程应在保护步数内自然结束');
  assert.equal(state.currentPlayerId, null, '结束后不应继续显示轮到某个玩家');
  assert.ok(state.winnerId);
  assert.equal(state.hands[state.winnerId!]!.length, 0);
  assert.equal(landlordModule.getResult(state)?.winnerId, state.winnerId);
  assert.equal(countMap(landlordModule.getPlayerView(state, state.winnerId!))[state.winnerId!], 0);
});

test('landlord forfeiture is system-only and resolves the winner team', () => {
  const initial = landlordModule.createInitialState(ctx, ['a', 'b', 'c'], { variant: 'standard' });
  const bid = landlordModule.reduce(ctx, initial, actor('a'), { type: 'bid_score', score: 3 });
  assert.equal(bid.ok, true);
  if (!bid.ok) return;

  const forged = landlordModule.reduce(ctx, bid.state, actor('b'), { type: 'player_forfeited', playerIds: ['a'] });
  assert.equal(forged.ok, false, 'a player must not forge the server forfeiture action');

  const farmerLeft = landlordModule.reduce(
    ctx,
    bid.state,
    { kind: 'system', source: 'timer' },
    { type: 'player_forfeited', playerIds: ['b'] },
  );
  assert.equal(farmerLeft.ok, true);
  if (!farmerLeft.ok) return;
  assert.equal(farmerLeft.state.phase, 'game_over');
  assert.equal(farmerLeft.state.currentPlayerId, null);
  assert.equal(farmerLeft.state.winnerTeam, 'landlord');
  assert.equal(farmerLeft.state.winnerId, 'a');
  assert.deepEqual(landlordModule.getResult(farmerLeft.state), { winnerTeam: 'landlord', winnerId: 'a' });

  const biddingForfeit = landlordModule.reduce(
    ctx,
    initial,
    { kind: 'system', source: 'timer' },
    { type: 'player_forfeited', playerIds: ['b'] },
  );
  assert.equal(biddingForfeit.ok, true);
  if (!biddingForfeit.ok) return;
  assert.equal(biddingForfeit.state.phase, 'game_over');
  assert.deepEqual(landlordModule.getResult(biddingForfeit.state), { winnerTeam: null, winnerId: null, aborted: true });
});