import { parseDurianAction, parseDurianConfig } from './schemas.ts';
import {
  DURIAN_FRUITS,
  type DemandChange,
  type DurianAction,
  type DurianConfig,
  type DurianEvent,
  type DurianFruit,
  type DurianReduceResult,
  type DurianState,
  type InventoryCard,
  type OrderCard,
  type OrderOption,
  type StaffEvent,
} from './types.ts';

const STOCK_COUNTS: Record<DurianFruit, number> = {
  amber_pear: 6,
  cloud_berry: 6,
  jade_melon: 6,
  moon_plum: 5,
  sun_fig: 5,
};
const EVENTS: readonly StaffEvent[] = ['double_check', 'extra_basket', 'mixed_crate'];

const deny = (message: string): DurianReduceResult => ({ ok: false, code: 'ACTION_NOT_ALLOWED', message });
const zeroFruitRecord = (): Record<DurianFruit, number> => ({
  amber_pear: 0,
  cloud_berry: 0,
  jade_melon: 0,
  moon_plum: 0,
  sun_fig: 0,
});

export function buildDurianInventory(): InventoryCard[] {
  const remaining = { ...STOCK_COUNTS };
  const inventory: InventoryCard[] = [];
  while (inventory.length < 28) {
    for (const fruit of DURIAN_FRUITS) {
      if (remaining[fruit] === 0) continue;
      const number = STOCK_COUNTS[fruit] - remaining[fruit] + 1;
      inventory.push({ id: `${fruit}-${number}`, fruit });
      remaining[fruit] -= 1;
    }
  }
  return inventory;
}

export function buildDurianOrderDeck(): OrderCard[] {
  return Array.from({ length: 36 }, (_, index) => {
    const first = DURIAN_FRUITS[index % DURIAN_FRUITS.length]!;
    const second = DURIAN_FRUITS[(index + 1) % DURIAN_FRUITS.length]!;
    return {
      id: `order-${index + 1}`,
      options: [
        { fruit: first, quantity: index % 3 === 0 ? 2 : 1 },
        { fruit: second, quantity: index % 4 === 0 ? 2 : 1 },
      ],
      staffEvent: EVENTS[index % EVENTS.length]!,
    };
  });
}

function eventChanges(option: OrderOption, event: StaffEvent): DemandChange[] {
  if (event === 'double_check') return [{ fruit: option.fruit, quantity: option.quantity * 2 }];
  if (event === 'extra_basket') return [{ fruit: option.fruit, quantity: option.quantity + 1 }];
  const nextFruit = DURIAN_FRUITS[(DURIAN_FRUITS.indexOf(option.fruit) + 1) % DURIAN_FRUITS.length]!;
  return [{ fruit: option.fruit, quantity: option.quantity }, { fruit: nextFruit, quantity: 1 }];
}

export function createDurianState(players: readonly string[], configInput: unknown = {}): DurianState {
  if (players.length < 2 || players.length > 7) throw new Error('Durian 需要 2 至 7 名玩家');
  if (new Set(players).size !== players.length || players.some((id) => id.length < 1)) throw new Error('玩家列表无效');
  const config: DurianConfig = parseDurianConfig(configInput);
  const deck = (config.orderDeck ?? buildDurianOrderDeck()).map((card) => structuredClone(card));
  const inventory = buildDurianInventory();
  const availableInventory = inventory.map((card) => ({ ...card }));
  const playerInventory = Object.fromEntries(players.map((id) => [id, availableInventory.shift()!]));
  const centralInventory = availableInventory.shift()!;
  const removedInventory = availableInventory;
  const stock = zeroFruitRecord();
  for (const card of [...Object.values(playerInventory), centralInventory]) stock[card.fruit] += 1;
  const currentOrder = deck.shift() ?? null;
  const state: DurianState = {
    schemaVersion: 1,
    phase: currentOrder ? 'ordering' : 'game_over',
    players: [...players],
    inventory,
    playerInventory,
    centralInventory,
    removedInventory,
    stock,
    demand: zeroFruitRecord(),
    orderDeck: deck,
    currentOrder,
    history: [],
    currentPlayerId: currentOrder ? players[0]! : null,
    bell: null,
    angerLevel: 1,
    penalties: Object.fromEntries(players.map((id) => [id, 0])),
    winners: currentOrder ? [] : [...players],
  };
  assertDurianInvariants(state);
  return state;
}

export function isDurianOversold(state: DurianState): boolean {
  return DURIAN_FRUITS.some((fruit) => state.demand[fruit] > state.stock[fruit]);
}

function finishOrAdvance(state: DurianState): DurianEvent[] {
  const reachedLimit = state.players.some((id) => state.penalties[id]! >= 7);
  if (reachedLimit || state.orderDeck.length === 0) {
    const minimum = Math.min(...state.players.map((id) => state.penalties[id]!));
    state.phase = 'game_over';
    state.currentPlayerId = null;
    state.currentOrder = null;
    state.bell = null;
    state.winners = state.players.filter((id) => state.penalties[id] === minimum);
    return [{ type: 'game_finished', winners: [...state.winners] }];
  }
  const previous = state.history.at(-1)!.playerId;
  state.currentPlayerId = state.players[(state.players.indexOf(previous) + 1) % state.players.length]!;
  state.currentOrder = state.orderDeck.shift()!;
  state.phase = 'ordering';
  state.bell = null;
  return [];
}

function settlePenalty(state: DurianState, penalizedPlayerId: string): DurianEvent[] {
  const points = state.angerLevel;
  state.penalties[penalizedPlayerId] = state.penalties[penalizedPlayerId]! + points;
  state.angerLevel = Math.min(7, state.angerLevel + 1);
  const event: DurianEvent = { type: 'bell_resolved', oversold: isDurianOversold(state), penalizedPlayerId, points };
  return [event, ...finishOrAdvance(state)];
}

export function reduceDurianState(state: DurianState, actionInput: DurianAction | unknown): DurianReduceResult {
  let action: DurianAction;
  try { action = parseDurianAction(actionInput); } catch (error) { return deny(error instanceof Error ? error.message : '动作无效'); }
  // 平台开局投递的 begin 为幂等系统动作：不推进状态。
  if (action.type === 'begin') return { ok: true, nextState: state, events: [] };
  if (state.phase === 'game_over') return deny('本局已经结束');
  if (!state.players.includes(action.playerId)) return deny('只有参局玩家可以操作');
  const next = structuredClone(state);
  const events: DurianEvent[] = [];

  if (action.type === 'submit_order') {
    if (state.phase !== 'ordering' || !state.currentOrder) return deny('当前不能提交订单');
    if (action.playerId !== state.currentPlayerId) return deny('还没轮到你');
    const changes = eventChanges(state.currentOrder.options[action.optionIndex], state.currentOrder.staffEvent);
    for (const change of changes) next.demand[change.fruit] += change.quantity;
    next.history.push({ orderId: state.currentOrder.id, playerId: action.playerId, optionIndex: action.optionIndex, staffEvent: state.currentOrder.staffEvent, changes });
    next.phase = 'buzzer';
    next.bell = { windowId: `bell-${next.history.length}`, status: 'open', claimantId: null };
    events.push({ type: 'order_submitted', playerId: action.playerId, orderId: state.currentOrder.id, changes });
  } else if (action.type === 'ring_bell') {
    if (state.phase !== 'buzzer' || !state.bell) return deny('按铃窗口未开放');
    if (action.playerId === state.currentPlayerId) return deny('当前下单者不能按铃');
    if (state.bell.status === 'locked') return deny('已经有人先按铃');
    next.bell = { windowId: state.bell.windowId, status: 'locked', claimantId: action.playerId };
    events.push({ type: 'bell_claimed', playerId: action.playerId });
  } else if (action.type === 'resolve_bell') {
    if (state.phase !== 'buzzer' || state.bell?.status !== 'locked') return deny('没有待裁决的按铃');
    if (action.playerId !== state.currentPlayerId) return deny('只有当前下单者可以裁决');
    const oversold = isDurianOversold(state);
    events.push(...settlePenalty(next, oversold ? state.currentPlayerId! : state.bell.claimantId));
  } else {
    if (state.phase !== 'buzzer' || state.bell?.status !== 'open') return deny('当前不能关闭按铃窗口');
    if (action.playerId !== state.currentPlayerId) return deny('只有当前下单者可以关闭窗口');
    events.push({ type: 'bell_closed' }, ...finishOrAdvance(next));
  }
  assertDurianInvariants(next);
  return { ok: true, nextState: next, events };
}

export function assertDurianInvariants(state: DurianState): void {
  if (state.schemaVersion !== 1) throw new Error('状态版本无效');
  if (state.players.length < 2 || state.players.length > 7 || new Set(state.players).size !== state.players.length) throw new Error('玩家列表无效');
  if (state.inventory.length !== 28 || new Set(state.inventory.map((card) => card.id)).size !== 28) throw new Error('库存牌必须是 28 张唯一牌');
  const assigned = state.players.map((id) => state.playerInventory[id]);
  if (assigned.some((card) => card === undefined)) throw new Error('玩家库存分配缺失');
  if (!state.centralInventory || !Array.isArray(state.removedInventory)) throw new Error('库存分区无效');
  const partition = [...assigned, state.centralInventory, ...state.removedInventory];
  const inventoryIds = new Set(state.inventory.map((card) => card.id));
  if (
    partition.length !== 28
    || partition.some((card) => !card)
    || new Set(partition.map((card) => card!.id)).size !== 28
    || partition.some((card) => !card || !inventoryIds.has(card.id))
  ) {
    throw new Error('库存分区无效');
  }
  if (state.removedInventory.length !== 27 - state.players.length) throw new Error('移出本轮的库存数量无效');
  if (state.angerLevel < 1 || state.angerLevel > 7) throw new Error('怒气等级必须在 1 至 7');
  const activeStock = zeroFruitRecord();
  for (const card of [...assigned, state.centralInventory]) activeStock[card!.fruit] += 1;
  for (const fruit of DURIAN_FRUITS) if (state.stock[fruit] !== activeStock[fruit] || state.demand[fruit] < 0) throw new Error('库存或需求无效');
  for (const id of state.players) if (!Number.isInteger(state.penalties[id]) || state.penalties[id]! < 0) throw new Error('处罚无效');
  if (state.phase === 'ordering' && (!state.currentPlayerId || !state.currentOrder || state.bell !== null)) throw new Error('下单阶段状态无效');
  if (state.phase === 'buzzer' && (!state.currentPlayerId || !state.currentOrder || state.bell === null)) throw new Error('按铃阶段状态无效');
  if (state.phase === 'game_over' && (state.currentPlayerId !== null || state.currentOrder !== null || state.bell !== null || state.winners.length === 0)) throw new Error('终局状态无效');
}
