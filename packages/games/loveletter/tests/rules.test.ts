import assert from 'node:assert/strict';
import test from 'node:test';
import { parseLoveLetterAction, parseLoveLetterConfig } from '../server/schemas.ts';
import {
  affectionTarget,
  assertLoveLetterInvariants,
  buildLoveLetterDeck,
  createLoveLetterState,
  reduceLoveLetterState,
} from '../server/rules.ts';
import type { LoveLetterCard, LoveLetterRole, LoveLetterState } from '../server/types.ts';

function deckWith(prefix: LoveLetterRole[]): LoveLetterCard[] {
  const remaining = buildLoveLetterDeck();
  const selected = prefix.map((role) => {
    const index = remaining.findIndex((card) => card.role === role);
    assert.notEqual(index, -1, `缺少角色 ${role}`);
    return remaining.splice(index, 1)[0]!;
  });
  return [...selected, ...remaining];
}

function stateWithDeals(a: LoveLetterRole, b: LoveLetterRole, draw: LoveLetterRole, futureDeckOrders?: LoveLetterCard[][]) {
  // 两人局：第 1 张备用，第 2 张暗置移除，第 3/4 张发给 a/b，第 5 张由 a 摸取。
  const deckOrder = deckWith(['guard', 'priest', a, b, draw]);
  return createLoveLetterState(['a', 'b'], { deckOrder, ...(futureDeckOrders ? { futureDeckOrders } : {}) });
}

function accepted(state: LoveLetterState, action: unknown): LoveLetterState {
  const result = reduceLoveLetterState(state, action);
  if (!result.ok) throw new Error(result.message);
  return result.nextState;
}

test('经典牌组恰为 16 张且角色数量正确', () => {
  const deck = buildLoveLetterDeck();
  assert.equal(deck.length, 16);
  assert.equal(new Set(deck.map((card) => card.id)).size, 16);
  assert.deepEqual(
    Object.fromEntries([...new Set(deck.map((card) => card.role))].map((role) => [role, deck.filter((card) => card.role === role).length])),
    { guard: 5, priest: 2, baron: 2, handmaid: 2, prince: 2, king: 1, countess: 1, princess: 1 },
  );
});

test('2–4 人初始化、两人备用与暗置移除一张、摸一张开始回合', () => {
  const two = createLoveLetterState(['a', 'b']);
  assert.equal(two.reserveCard !== null, true);
  assert.equal(two.removedCards.length, 1);
  assert.equal(two.hands.a!.length, 2);
  assert.equal(two.hands.b!.length, 1);
  assert.equal(createLoveLetterState(['a', 'b', 'c']).affectionTarget, 5);
  assert.equal(createLoveLetterState(['a', 'b', 'c', 'd']).affectionTarget, 4);
  assert.equal(affectionTarget(2), 7);
  assert.throws(() => createLoveLetterState(['a']), /2 至 4/);
  assert.throws(() => createLoveLetterState(['a', 'a']), /玩家列表无效/);
  assertLoveLetterInvariants(two);
});

test('动作和配置解析严格拒绝非法字段、猜守卫及坏牌组', () => {
  assert.deepEqual(parseLoveLetterAction({ type: 'play_card', playerId: 'a', cardId: 'x' }), {
    type: 'play_card', playerId: 'a', cardId: 'x',
  });
  assert.throws(() => parseLoveLetterAction({ type: 'play_card', playerId: 'a', cardId: 'x', extra: true }), /字段无效/);
  assert.throws(() => parseLoveLetterConfig({ deckOrder: [] }), /16 张/);
  const state = stateWithDeals('guard', 'priest', 'prince');
  const guard = state.hands.a!.find((card) => card.role === 'guard')!;
  assert.equal(reduceLoveLetterState(state, {
    type: 'play_card', playerId: 'a', cardId: guard.id, targetPlayerId: 'b', guessedRole: 'guard',
  }).ok, false);
});

test('伯爵夫人与王子或国王同手时必须打出伯爵夫人', () => {
  const state = stateWithDeals('countess', 'guard', 'prince');
  const prince = state.hands.a!.find((card) => card.role === 'prince')!;
  const rejected = reduceLoveLetterState(state, { type: 'play_card', playerId: 'a', cardId: prince.id, targetPlayerId: 'a' });
  assert.equal(rejected.ok, false);
  const countess = state.hands.a!.find((card) => card.role === 'countess')!;
  const next = accepted(state, { type: 'play_card', playerId: 'a', cardId: countess.id });
  assert.equal(next.currentPlayerId, 'b');
});

test('王子可选择自己，弃公主立即淘汰', () => {
  let princeState = stateWithDeals('guard', 'priest', 'prince');
  const prince = princeState.hands.a!.find((card) => card.role === 'prince')!;
  princeState = accepted(princeState, { type: 'play_card', playerId: 'a', cardId: prince.id, targetPlayerId: 'a' });
  assert.equal(princeState.discardPiles.a!.some((card) => card.role === 'guard'), true);
  assert.equal(princeState.hands.a!.length, 1);

  const princessState = stateWithDeals('princess', 'guard', 'priest');
  princessState.affection.b = 6;
  const princess = princessState.hands.a!.find((card) => card.role === 'princess')!;
  const finished = accepted(princessState, { type: 'play_card', playerId: 'a', cardId: princess.id });
  assert.equal(finished.phase, 'game_over');
  assert.deepEqual(finished.winners, ['b']);
});

test('守卫猜中淘汰目标，神父记录私密查验', () => {
  const guardState = stateWithDeals('guard', 'princess', 'priest');
  const guard = guardState.hands.a!.find((card) => card.role === 'guard')!;
  const afterGuard = accepted(guardState, {
    type: 'play_card', playerId: 'a', cardId: guard.id, targetPlayerId: 'b', guessedRole: 'princess',
  });
  assert.equal(afterGuard.round, 2);
  assert.equal(afterGuard.affection.a, 1);

  const priestState = stateWithDeals('priest', 'princess', 'guard');
  const priest = priestState.hands.a!.find((card) => card.role === 'priest')!;
  const afterPriest = accepted(priestState, { type: 'play_card', playerId: 'a', cardId: priest.id, targetPlayerId: 'b' });
  assert.deepEqual(afterPriest.inspections[0], { viewerId: 'a', targetPlayerId: 'b', role: 'princess', round: 1 });
});

test('侍女保护持续到自己的下回合，受保护导致无目标时牌仍可打出', () => {
  let state = stateWithDeals('handmaid', 'priest', 'guard');
  const handmaid = state.hands.a!.find((card) => card.role === 'handmaid')!;
  state = accepted(state, { type: 'play_card', playerId: 'a', cardId: handmaid.id });
  assert.deepEqual(state.protectedPlayers, ['a']);
  const priest = state.hands.b!.find((card) => card.role === 'priest')!;
  assert.equal(reduceLoveLetterState(state, {
    type: 'play_card', playerId: 'b', cardId: priest.id, targetPlayerId: 'a',
  }).ok, false);
  state = accepted(state, { type: 'play_card', playerId: 'b', cardId: priest.id });
  assert.equal(state.currentPlayerId, 'a');
  assert.deepEqual(state.protectedPlayers, []);
  assert.equal(state.inspections.length, 0);
});

test('男爵比较淘汰较低手牌，国王交换双方手牌', () => {
  const baronState = stateWithDeals('baron', 'guard', 'princess');
  const baron = baronState.hands.a!.find((card) => card.role === 'baron')!;
  const afterBaron = accepted(baronState, {
    type: 'play_card', playerId: 'a', cardId: baron.id, targetPlayerId: 'b',
  });
  assert.equal(afterBaron.affection.a, 1);
  assert.equal(afterBaron.round, 2);

  const kingState = stateWithDeals('king', 'princess', 'guard');
  const king = kingState.hands.a!.find((card) => card.role === 'king')!;
  const afterKing = accepted(kingState, {
    type: 'play_card', playerId: 'a', cardId: king.id, targetPlayerId: 'b',
  });
  assert.equal(afterKing.hands.a![0]!.role, 'princess');
  assert.equal(afterKing.hands.b!.some((card) => card.role === 'guard'), true);
});

test('牌库耗尽先比较手牌，再以弃牌总值打破同点', () => {
  let handWins = stateWithDeals('countess', 'princess', 'guard');
  handWins.removedCards.push(...handWins.deck.splice(0));
  const countess = handWins.hands.a!.find((card) => card.role === 'countess')!;
  handWins = accepted(handWins, { type: 'play_card', playerId: 'a', cardId: countess.id });
  assert.equal(handWins.affection.b, 1);
  assert.equal(handWins.round, 2);

  let discardWins = stateWithDeals('guard', 'guard', 'priest');
  const bonusIndex = discardWins.deck.findIndex((card) => card.role === 'king');
  discardWins.discardPiles.a!.push(discardWins.deck.splice(bonusIndex, 1)[0]!);
  discardWins.removedCards.push(...discardWins.deck.splice(0));
  const priest = discardWins.hands.a!.find((card) => card.role === 'priest')!;
  discardWins = accepted(discardWins, {
    type: 'play_card', playerId: 'a', cardId: priest.id, targetPlayerId: 'b',
  });
  assert.equal(discardWins.affection.a, 1);
  assert.equal(discardWins.round, 2);
});

test('达到好感阈值立即结束整局，结束后拒绝动作', () => {
  const state = stateWithDeals('guard', 'princess', 'priest');
  state.affection.a = 6;
  const guard = state.hands.a!.find((card) => card.role === 'guard')!;
  const finished = accepted(state, {
    type: 'play_card', playerId: 'a', cardId: guard.id, targetPlayerId: 'b', guessedRole: 'princess',
  });
  assert.equal(finished.phase, 'game_over');
  assert.deepEqual(finished.winners, ['a']);
  assert.equal(finished.affection.a, 7);
  assert.equal(reduceLoveLetterState(finished, { type: 'play_card', playerId: 'a', cardId: guard.id }).ok, false);
  assertLoveLetterInvariants(finished);
});

test('非法目标和越权动作不改变状态，不变量拒绝牌守恒破损', () => {
  const state = stateWithDeals('priest', 'princess', 'guard');
  const priest = state.hands.a!.find((card) => card.role === 'priest')!;
  const before = structuredClone(state);
  assert.equal(reduceLoveLetterState(state, {
    type: 'play_card', playerId: 'a', cardId: priest.id, targetPlayerId: 'a',
  }).ok, false);
  assert.equal(reduceLoveLetterState(state, {
    type: 'play_card', playerId: 'b', cardId: state.hands.b![0]!.id, targetPlayerId: 'a',
  }).ok, false);
  assert.deepEqual(state, before);
  const broken = structuredClone(state);
  broken.deck.pop();
  assert.throws(() => assertLoveLetterInvariants(broken), /守恒/);
});
