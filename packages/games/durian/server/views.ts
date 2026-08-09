import { DURIAN_FRUITS } from './types.ts';
import type {
  BellWindow,
  DurianFruit,
  DurianPlayerView,
  DurianPublicView,
  DurianState,
  InventoryCard,
  OrderCard,
  OrderRecord,
} from './types.ts';

function copyOrder(order: OrderCard | null): OrderCard | null {
  return order ? structuredClone(order) : null;
}

function buildPublicView(state: DurianState): DurianPublicView {
  return {
    gameId: 'durian',
    rulesetId: 'durian_orchard_v1',
    schemaVersion: 1,
    phase: state.phase,
    players: [...state.players],
    demand: { ...state.demand },
    currentOrder: copyOrder(state.currentOrder),
    history: structuredClone(state.history),
    currentPlayerId: state.currentPlayerId,
    bell: state.bell ? { ...state.bell } as BellWindow : null,
    angerLevel: state.angerLevel,
    penalties: { ...state.penalties },
    winners: [...state.winners],
  };
}

export function buildDurianPlayerView(state: DurianState, playerId: string): DurianPlayerView {
  return {
    ...buildPublicView(state),
    me: state.players.includes(playerId)
      ? {
          playerId,
          ownInventoryHidden: true,
          visibleInventory: state.players
            .filter((id) => id !== playerId)
            .map((id) => ({ playerId: id, card: { ...state.playerInventory[id]! } })),
        }
      : null,
  };
}

export function buildDurianSpectatorView(state: DurianState): DurianPublicView {
  return buildPublicView(state);
}

function record(input: unknown, label: string): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) throw new Error(`${label} 必须是对象`);
  return input as Record<string, unknown>;
}

function stringArray(input: unknown, label: string): string[] {
  if (!Array.isArray(input) || input.some((item) => typeof item !== 'string')) throw new Error(`${label} 无效`);
  return [...input];
}

function numberRecord(input: unknown, label: string): Record<string, number> {
  const value = record(input, label);
  if (Object.values(value).some((item) => !Number.isInteger(item) || (item as number) < 0)) throw new Error(`${label} 无效`);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, item as number]));
}

function parsePublic(input: unknown): DurianPublicView {
  const value = record(input, 'Durian 视图');
  const expected = ['gameId', 'rulesetId', 'schemaVersion', 'phase', 'players', 'demand', 'currentOrder', 'history', 'currentPlayerId', 'bell', 'angerLevel', 'penalties', 'winners'];
  if (Object.keys(value).length !== expected.length || expected.some((key) => !(key in value))) throw new Error('Durian 视图字段无效');
  if (value.gameId !== 'durian' || value.rulesetId !== 'durian_orchard_v1' || value.schemaVersion !== 1) throw new Error('Durian 视图身份无效');
  if (value.phase !== 'ordering' && value.phase !== 'buzzer' && value.phase !== 'game_over') throw new Error('Durian 阶段无效');
  if (value.currentPlayerId !== null && typeof value.currentPlayerId !== 'string') throw new Error('当前玩家无效');
  if (!Number.isInteger(value.angerLevel) || (value.angerLevel as number) < 1 || (value.angerLevel as number) > 7) throw new Error('怒气无效');
  if (value.currentOrder !== null) record(value.currentOrder, '当前订单');
  if (!Array.isArray(value.history)) throw new Error('订单轨迹无效');
  if (value.bell !== null) record(value.bell, '按铃窗口');
  const demand = numberRecord(value.demand, '需求') as Record<DurianFruit, number>;
  return {
    gameId: value.gameId,
    rulesetId: value.rulesetId,
    schemaVersion: value.schemaVersion,
    phase: value.phase,
    players: stringArray(value.players, '玩家列表'),
    demand,
    currentOrder: value.currentOrder === null ? null : structuredClone(value.currentOrder) as OrderCard,
    history: structuredClone(value.history) as OrderRecord[],
    currentPlayerId: value.currentPlayerId,
    bell: value.bell === null ? null : structuredClone(value.bell) as BellWindow,
    angerLevel: value.angerLevel as number,
    penalties: numberRecord(value.penalties, '处罚'),
    winners: stringArray(value.winners, '赢家'),
  };
}

export function parseDurianSpectatorView(input: unknown): DurianPublicView {
  return parsePublic(input);
}

export function parseDurianPlayerView(input: unknown): DurianPlayerView {
  const value = record(input, 'Durian 玩家视图');
  if (!('me' in value)) throw new Error('Durian 玩家视图缺少 me');
  const { me, ...publicValue } = value;
  const parsed = parsePublic(publicValue);
  if (me === null) return { ...parsed, me: null };
  const self = record(me, 'Durian 本人视图');
  if (Object.keys(self).length !== 3 || typeof self.playerId !== 'string' || self.ownInventoryHidden !== true || !Array.isArray(self.visibleInventory)) {
    throw new Error('Durian 本人视图无效');
  }
  const visibleInventory = self.visibleInventory.map((entry) => {
    const visible = record(entry, '可见库存');
    if (Object.keys(visible).length !== 2 || typeof visible.playerId !== 'string') throw new Error('可见库存无效');
    const card = record(visible.card, '库存牌');
    if (
      Object.keys(card).length !== 2
      || typeof card.id !== 'string'
      || typeof card.fruit !== 'string'
      || !DURIAN_FRUITS.includes(card.fruit as DurianFruit)
    ) throw new Error('库存牌无效');
    const parsedCard: InventoryCard = { id: card.id, fruit: card.fruit as DurianFruit };
    return { playerId: visible.playerId, card: parsedCard };
  });
  return { ...parsed, me: { playerId: self.playerId, ownInventoryHidden: true, visibleInventory } };
}
