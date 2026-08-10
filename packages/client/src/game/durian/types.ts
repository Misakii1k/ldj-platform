/** durian_orchard_v1 客户端严格视角类型与解析器（与服务端视图形状一一对应）。 */

export const DURIAN_FRUITS = ['amber_pear', 'cloud_berry', 'jade_melon', 'moon_plum', 'sun_fig'] as const;
export type DurianFruit = (typeof DURIAN_FRUITS)[number];
export type DurianPhase = 'ordering' | 'buzzer' | 'game_over';
export type DurianStaffEvent = 'double_check' | 'extra_basket' | 'mixed_crate';

export interface DurianOrderOption {
  fruit: DurianFruit;
  quantity: 1 | 2;
}

export interface DurianOrderCard {
  id: string;
  options: readonly [DurianOrderOption, DurianOrderOption];
  staffEvent: DurianStaffEvent;
}

export interface DurianDemandChange {
  fruit: DurianFruit;
  quantity: number;
}

export interface DurianOrderRecord {
  orderId: string;
  playerId: string;
  optionIndex: 0 | 1;
  staffEvent: DurianStaffEvent;
  changes: DurianDemandChange[];
}

export interface DurianBell {
  windowId: string;
  status: 'open' | 'locked';
  claimantId: string | null;
}

export interface DurianPublicView {
  gameId: 'durian';
  rulesetId: 'durian_orchard_v1';
  schemaVersion: 1;
  phase: DurianPhase;
  players: string[];
  demand: Record<DurianFruit, number>;
  currentOrder: DurianOrderCard | null;
  history: DurianOrderRecord[];
  currentPlayerId: string | null;
  bell: DurianBell | null;
  angerLevel: number;
  penalties: Record<string, number>;
  winners: string[];
}

export interface DurianPlayerView extends DurianPublicView {
  me: {
    playerId: string;
    ownInventoryHidden: true;
    visibleInventory: { playerId: string; card: { id: string; fruit: DurianFruit } }[];
  } | null;
}

const PUBLIC_KEYS = [
  'gameId', 'rulesetId', 'schemaVersion', 'phase', 'players', 'demand', 'currentOrder',
  'history', 'currentPlayerId', 'bell', 'angerLevel', 'penalties', 'winners',
] as const;
const ME_KEYS = ['playerId', 'ownInventoryHidden', 'visibleInventory'] as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(record: Record<string, unknown>, allowed: readonly string[]): boolean {
  const keys = Object.keys(record);
  if (keys.length !== allowed.length) return false;
  const allowedSet = new Set<string>(allowed);
  return keys.every((key) => allowedSet.has(key));
}

function isPlayerId(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 1 && value.length <= 64;
}

function isFruit(value: unknown): value is DurianFruit {
  return typeof value === 'string' && (DURIAN_FRUITS as readonly string[]).includes(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function parseFruitRecord(value: unknown): Record<DurianFruit, number> | null {
  if (!isObject(value)) return null;
  const result: Record<string, number> = {};
  for (const key of Object.keys(value)) {
    if (!isFruit(key) || !isNonNegativeInteger(value[key])) return null;
    result[key] = value[key] as number;
  }
  for (const fruit of DURIAN_FRUITS) {
    if (!(fruit in result)) result[fruit] = 0;
  }
  return result as Record<DurianFruit, number>;
}

function parseOrderOption(value: unknown): DurianOrderOption | null {
  if (!isObject(value) || Object.keys(value).length !== 2) return null;
  if (!isFruit(value.fruit)) return null;
  if (value.quantity !== 1 && value.quantity !== 2) return null;
  return { fruit: value.fruit, quantity: value.quantity as 1 | 2 };
}

function parseOrderCard(value: unknown): DurianOrderCard | null {
  if (!isObject(value) || Object.keys(value).length !== 3) return null;
  if (!isPlayerId(value.id)) return null;
  if (!Array.isArray(value.options) || value.options.length !== 2) return null;
  const options = value.options.map(parseOrderOption);
  if (options.some((option) => option === null)) return null;
  const staffEvent = value.staffEvent;
  if (staffEvent !== 'double_check' && staffEvent !== 'extra_basket' && staffEvent !== 'mixed_crate') return null;
  return { id: value.id, options: [options[0]!, options[1]!], staffEvent };
}

function parseOrderRecord(value: unknown): DurianOrderRecord | null {
  if (!isObject(value) || Object.keys(value).length !== 5) return null;
  if (!isPlayerId(value.orderId) || !isPlayerId(value.playerId)) return null;
  if (value.optionIndex !== 0 && value.optionIndex !== 1) return null;
  if (value.staffEvent !== 'double_check' && value.staffEvent !== 'extra_basket' && value.staffEvent !== 'mixed_crate') return null;
  if (!Array.isArray(value.changes)) return null;
  const changes: DurianDemandChange[] = [];
  for (const change of value.changes) {
    if (!isObject(change) || Object.keys(change).length !== 2 || !isFruit(change.fruit) || !isNonNegativeInteger(change.quantity)) return null;
    changes.push({ fruit: change.fruit, quantity: change.quantity });
  }
  return { orderId: value.orderId, playerId: value.playerId, optionIndex: value.optionIndex, staffEvent: value.staffEvent, changes };
}

function parseBell(value: unknown): DurianBell | null {
  if (value === null) return null;
  if (!isObject(value) || Object.keys(value).length !== 3 || !isPlayerId(value.windowId)) return null;
  if (value.status === 'open') {
    return value.claimantId === null ? { windowId: value.windowId, status: 'open', claimantId: null } : null;
  }
  if (value.status === 'locked' && isPlayerId(value.claimantId)) {
    return { windowId: value.windowId, status: 'locked', claimantId: value.claimantId };
  }
  return null;
}

function parseBase(view: Record<string, unknown>, withMe: boolean): DurianPublicView | null {
  if (!hasExactKeys(view, withMe ? [...PUBLIC_KEYS, 'me'] : PUBLIC_KEYS)) return null;
  if (view.gameId !== 'durian' || view.rulesetId !== 'durian_orchard_v1' || view.schemaVersion !== 1) return null;
  if (view.phase !== 'ordering' && view.phase !== 'buzzer' && view.phase !== 'game_over') return null;
  if (!Array.isArray(view.players) || !view.players.every(isPlayerId)) return null;
  const demand = parseFruitRecord(view.demand);
  const currentOrder = parseOrderCard(view.currentOrder);
  const bell = parseBell(view.bell);
  if (demand === null || currentOrder === null && view.currentOrder !== null || bell === null && view.bell !== null) return null;
  if (!Array.isArray(view.history)) return null;
  const history: DurianOrderRecord[] = [];
  for (const item of view.history) {
    const record = parseOrderRecord(item);
    if (record === null) return null;
    history.push(record);
  }
  if (view.currentOrder !== null && currentOrder === null) return null;
  if (view.bell !== null && bell === null) return null;
  if (view.currentPlayerId !== null && !isPlayerId(view.currentPlayerId)) return null;
  if (!isNonNegativeInteger(view.angerLevel) || (view.angerLevel as number) < 1 || (view.angerLevel as number) > 7) return null;
  if (!isObject(view.penalties)) return null;
  for (const key of Object.keys(view.penalties)) {
    if (!isNonNegativeInteger(view.penalties[key])) return null;
  }
  if (!Array.isArray(view.winners) || !view.winners.every(isPlayerId)) return null;
  return {
    gameId: 'durian',
    rulesetId: 'durian_orchard_v1',
    schemaVersion: 1,
    phase: view.phase as DurianPhase,
    players: [...view.players],
    demand,
    currentOrder,
    history,
    currentPlayerId: view.currentPlayerId as string | null,
    bell,
    angerLevel: view.angerLevel as number,
    penalties: { ...view.penalties } as Record<string, number>,
    winners: [...view.winners],
  };
}

function parseMe(value: unknown): DurianPlayerView['me'] {
  if (value === null) return null;
  if (!isObject(value) || !hasExactKeys(value, ME_KEYS) || !isPlayerId(value.playerId)) return null;
  if (value.ownInventoryHidden !== true || !Array.isArray(value.visibleInventory)) return null;
  const visibleInventory: NonNullable<DurianPlayerView['me']>['visibleInventory'] = [];
  for (const item of value.visibleInventory) {
    if (!isObject(item) || Object.keys(item).length !== 2 || !isPlayerId(item.playerId)) return null;
    const card = item.card;
    if (!isObject(card) || Object.keys(card).length !== 2 || !isPlayerId(card.id) || !isFruit(card.fruit)) return null;
    visibleInventory.push({ playerId: item.playerId, card: { id: card.id, fruit: card.fruit } });
  }
  return { playerId: value.playerId, ownInventoryHidden: true, visibleInventory };
}

export function parseDurianView(
  view: unknown,
  role: 'player' | 'spectator',
): DurianPlayerView | DurianPublicView | null {
  if (!isObject(view)) return null;
  if (role === 'spectator') {
    if ('me' in view) return null;
    return parseBase(view, false);
  }
  if (!('me' in view)) return null;
  const base = parseBase(view, true);
  if (base === null) return null;
  const me = parseMe(view.me);
  if (view.me !== null && me === null) return null;
  return { ...base, me };
}
