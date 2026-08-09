import assert from 'node:assert/strict';
import test from 'node:test';
import { DURIAN_FRUITS, type OrderCard } from '../server/types.ts';
import { parseDurianAction, parseDurianConfig } from '../server/schemas.ts';
import {
  assertDurianInvariants,
  buildDurianInventory,
  buildDurianOrderDeck,
  createDurianState,
  isDurianOversold,
  reduceDurianState,
} from '../server/rules.ts';

function accepted(state: ReturnType<typeof createDurianState>, action: unknown) {
  const result = reduceDurianState(state, action);
  if (!result.ok) throw new Error(result.message);
  return result.nextState;
}

function order(id: string, staffEvent: OrderCard['staffEvent'], fruit = DURIAN_FRUITS[0]): OrderCard {
  return {
    id,
    options: [{ fruit, quantity: 1 }, { fruit: DURIAN_FRUITS[1], quantity: 2 }],
    staffEvent,
  };
}

test('库存固定 28 张且覆盖五种水果', () => {
  const inventory = buildDurianInventory();
  assert.equal(inventory.length, 28);
  assert.equal(new Set(inventory.map((card) => card.id)).size, 28);
  assert.deepEqual(new Set(inventory.map((card) => card.fruit)), new Set(DURIAN_FRUITS));
});

test('订单固定 36 张、每张二选一且覆盖三类有限事件', () => {
  const deck = buildDurianOrderDeck();
  assert.equal(deck.length, 36);
  assert.equal(new Set(deck.map((card) => card.id)).size, 36);
  assert.ok(deck.every((card) => card.options.length === 2 && card.options[0].fruit !== card.options[1].fruit));
  assert.deepEqual(new Set(deck.map((card) => card.staffEvent)), new Set(['double_check', 'extra_basket', 'mixed_crate']));
});

test('初始化接受 2 至 7 人并拒绝边界外及重复玩家', () => {
  assert.equal(createDurianState(['a', 'b']).players.length, 2);
  assert.equal(createDurianState(['a', 'b', 'c', 'd', 'e', 'f', 'g']).players.length, 7);
  assert.throws(() => createDurianState(['a']), /2 至 7/);
  assert.throws(() => createDurianState(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']), /2 至 7/);
  assert.throws(() => createDurianState(['a', 'a']), /玩家列表无效/);
});

test('解析器严格拒绝多余字段和非法订单选项', () => {
  assert.deepEqual(parseDurianAction({ type: 'ring_bell', playerId: 'a' }), { type: 'ring_bell', playerId: 'a' });
  assert.throws(() => parseDurianAction({ type: 'ring_bell', playerId: 'a', extra: true }), /字段无效/);
  assert.throws(() => parseDurianAction({ type: 'submit_order', playerId: 'a', optionIndex: 2 }), /选项无效/);
  assert.throws(() => parseDurianConfig({ orderDeck: [] }), /不能为空/);
});

test('三个店员事件产生确定且有限的需求变化', () => {
  const deck = [order('double', 'double_check'), order('extra', 'extra_basket'), order('mixed', 'mixed_crate')];
  let state = createDurianState(['a', 'b'], { orderDeck: deck });
  state = accepted(state, { type: 'submit_order', playerId: 'a', optionIndex: 0 });
  assert.deepEqual(state.history[0]!.changes, [{ fruit: 'amber_pear', quantity: 2 }]);
  state = accepted(state, { type: 'close_bell', playerId: 'a' });
  state = accepted(state, { type: 'submit_order', playerId: 'b', optionIndex: 0 });
  assert.deepEqual(state.history[1]!.changes, [{ fruit: 'amber_pear', quantity: 2 }]);
  state = accepted(state, { type: 'close_bell', playerId: 'b' });
  state = accepted(state, { type: 'submit_order', playerId: 'a', optionIndex: 0 });
  assert.deepEqual(state.history[2]!.changes, [{ fruit: 'amber_pear', quantity: 1 }, { fruit: 'cloud_berry', quantity: 1 }]);
});

test('仅当前玩家可提交订单且 reducer 不修改原状态', () => {
  const state = createDurianState(['a', 'b']);
  const rejected = reduceDurianState(state, { type: 'submit_order', playerId: 'b', optionIndex: 0 });
  assert.equal(rejected.ok, false);
  const next = accepted(state, { type: 'submit_order', playerId: 'a', optionIndex: 1 });
  assert.equal(state.phase, 'ordering');
  assert.equal(state.history.length, 0);
  assert.equal(next.phase, 'buzzer');
  assert.equal(next.history.length, 1);
});

test('首个合法按铃者锁定窗口且当前下单者不能按铃', () => {
  let state = createDurianState(['a', 'b', 'c']);
  state = accepted(state, { type: 'submit_order', playerId: 'a', optionIndex: 0 });
  assert.equal(reduceDurianState(state, { type: 'ring_bell', playerId: 'a' }).ok, false);
  state = accepted(state, { type: 'ring_bell', playerId: 'b' });
  assert.deepEqual(state.bell, { windowId: 'bell-1', status: 'locked', claimantId: 'b' });
  const late = reduceDurianState(state, { type: 'ring_bell', playerId: 'c' });
  assert.equal(late.ok, false);
  assert.deepEqual(state.bell, { windowId: 'bell-1', status: 'locked', claimantId: 'b' });
});

test('误报处罚按铃者，正确超卖指控处罚下单者', () => {
  const safeDeck = [order('safe', 'mixed_crate'), order('next', 'mixed_crate')];
  let safe = createDurianState(['a', 'b'], { orderDeck: safeDeck });
  safe = accepted(safe, { type: 'submit_order', playerId: 'a', optionIndex: 0 });
  safe = accepted(safe, { type: 'ring_bell', playerId: 'b' });
  safe = accepted(safe, { type: 'resolve_bell', playerId: 'a' });
  assert.equal(safe.penalties.b, 1);

  let oversold = createDurianState(['a', 'b'], { orderDeck: safeDeck });
  oversold.demand.amber_pear = oversold.stock.amber_pear;
  oversold = accepted(oversold, { type: 'submit_order', playerId: 'a', optionIndex: 0 });
  assert.equal(isDurianOversold(oversold), true);
  oversold = accepted(oversold, { type: 'ring_bell', playerId: 'b' });
  oversold = accepted(oversold, { type: 'resolve_bell', playerId: 'a' });
  assert.equal(oversold.penalties.a, 1);
});

test('处罚达到 7 后终局，最低处罚者可并列获胜且结束后拒绝动作', () => {
  const safeDeck = [order('safe', 'mixed_crate'), order('next', 'mixed_crate')];
  let state = createDurianState(['a', 'b', 'c'], { orderDeck: safeDeck });
  state.penalties.b = 6;
  state.angerLevel = 1;
  state = accepted(state, { type: 'submit_order', playerId: 'a', optionIndex: 0 });
  state = accepted(state, { type: 'ring_bell', playerId: 'b' });
  state = accepted(state, { type: 'resolve_bell', playerId: 'a' });
  assert.equal(state.phase, 'game_over');
  assert.equal(state.penalties.b, 7);
  assert.deepEqual(state.winners, ['a', 'c']);
  assert.equal(reduceDurianState(state, { type: 'ring_bell', playerId: 'a' }).ok, false);
  assertDurianInvariants(state);
});

test('怒气封顶为 7，不变量拒绝破损状态', () => {
  let state = createDurianState(['a', 'b']);
  state.angerLevel = 7;
  state = accepted(state, { type: 'submit_order', playerId: 'a', optionIndex: 0 });
  state = accepted(state, { type: 'ring_bell', playerId: 'b' });
  state = accepted(state, { type: 'resolve_bell', playerId: 'a' });
  assert.equal(state.angerLevel, 7);
  const broken = structuredClone(state);
  broken.inventory.pop();
  assert.throws(() => assertDurianInvariants(broken), /28 张/);
});
