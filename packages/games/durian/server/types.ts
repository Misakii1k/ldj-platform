export const DURIAN_FRUITS = ['amber_pear', 'cloud_berry', 'jade_melon', 'moon_plum', 'sun_fig'] as const;

export type DurianFruit = (typeof DURIAN_FRUITS)[number];
export type StaffEvent = 'double_check' | 'extra_basket' | 'mixed_crate';
export type DurianPhase = 'ordering' | 'buzzer' | 'game_over';

export interface InventoryCard {
  id: string;
  fruit: DurianFruit;
}

export interface OrderOption {
  fruit: DurianFruit;
  quantity: 1 | 2;
}

export interface OrderCard {
  id: string;
  options: readonly [OrderOption, OrderOption];
  staffEvent: StaffEvent;
}

export interface DemandChange {
  fruit: DurianFruit;
  quantity: number;
}

export interface OrderRecord {
  orderId: string;
  playerId: string;
  optionIndex: 0 | 1;
  staffEvent: StaffEvent;
  changes: DemandChange[];
}

export type BellWindow =
  | { windowId: string; status: 'open'; claimantId: null }
  | { windowId: string; status: 'locked'; claimantId: string };

export interface DurianConfig {
  rulesetId?: 'durian_orchard_v1';
  orderDeck?: OrderCard[];
}

export interface DurianState {
  schemaVersion: 1;
  phase: DurianPhase;
  players: string[];
  inventory: InventoryCard[];
  playerInventory: Record<string, InventoryCard>;
  centralInventory: InventoryCard;
  removedInventory: InventoryCard[];
  stock: Record<DurianFruit, number>;
  demand: Record<DurianFruit, number>;
  orderDeck: OrderCard[];
  currentOrder: OrderCard | null;
  history: OrderRecord[];
  currentPlayerId: string | null;
  bell: BellWindow | null;
  angerLevel: number;
  penalties: Record<string, number>;
  winners: string[];
}

export type DurianAction =
  | { type: 'begin' }
  | { type: 'submit_order'; playerId: string; optionIndex: 0 | 1 }
  | { type: 'ring_bell'; playerId: string }
  | { type: 'resolve_bell'; playerId: string }
  | { type: 'close_bell'; playerId: string };

export type DurianEvent =
  | { type: 'order_submitted'; playerId: string; orderId: string; changes: DemandChange[] }
  | { type: 'bell_claimed'; playerId: string }
  | { type: 'bell_resolved'; oversold: boolean; penalizedPlayerId: string; points: number }
  | { type: 'bell_closed' }
  | { type: 'game_finished'; winners: string[] };

export type DurianReduceResult =
  | { ok: false; code: 'ACTION_NOT_ALLOWED'; message: string }
  | { ok: true; nextState: DurianState; events: DurianEvent[] };

export interface DurianPublicView {
  gameId: 'durian';
  rulesetId: 'durian_orchard_v1';
  schemaVersion: 1;
  phase: DurianPhase;
  players: string[];
  demand: Record<DurianFruit, number>;
  currentOrder: OrderCard | null;
  history: OrderRecord[];
  currentPlayerId: string | null;
  bell: BellWindow | null;
  angerLevel: number;
  penalties: Record<string, number>;
  winners: string[];
}

export interface DurianPlayerView extends DurianPublicView {
  me: {
    playerId: string;
    ownInventoryHidden: true;
    visibleInventory: { playerId: string; card: InventoryCard }[];
  } | null;
}

export interface DurianResult {
  winners: string[];
  penalties: Record<string, number>;
}
