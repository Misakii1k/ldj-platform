/** landlord_platform_v1 客户端严格视角类型与解析器。 */

export type LandlordPhase = 'bidding' | 'playing' | 'game_over';
export type LandlordTeam = 'landlord' | 'farmers';
export type LandlordRank = '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A' | '2' | 'SJ' | 'BJ';
export type LandlordSuit = 'spades' | 'hearts' | 'clubs' | 'diamonds';
export type LandlordComboType =
  | 'single'
  | 'pair'
  | 'triple'
  | 'triple_single'
  | 'triple_pair'
  | 'straight'
  | 'pair_sequence'
  | 'bomb'
  | 'rocket';

export interface LandlordCard {
  id: string;
  rank: LandlordRank;
  suit?: LandlordSuit;
}

export interface LandlordCombo {
  type: LandlordComboType;
  mainRank: number;
  length: number;
  cards: LandlordCard[];
}

export interface LandlordPlatformPublicView {
  gameId: 'landlord';
  rulesetId: 'landlord_platform_v1';
  schemaVersion: 1;
  phase: LandlordPhase;
  players: { playerId: string; handCount: number }[];
  bottomCards: LandlordCard[];
  bids: { playerId: string; score: 0 | 1 | 2 | 3 }[];
  currentBidderId: string | null;
  landlordId: string | null;
  currentPlayerId: string | null;
  currentTrick: { playerId: string; combo: LandlordCombo } | null;
  passCount: number;
  multiplier: number;
  winnerTeam: LandlordTeam | null;
  winnerId: string | null;
  deadlineAt: number | null;
  aborted: boolean;
}

export interface LandlordPlatformPlayerView extends LandlordPlatformPublicView {
  me: { playerId: string; hand: LandlordCard[] } | null;
}

const PUBLIC_KEYS = [
  'gameId', 'rulesetId', 'schemaVersion', 'phase', 'players', 'bottomCards', 'bids',
  'currentBidderId', 'landlordId', 'currentPlayerId', 'currentTrick', 'passCount',
  'multiplier', 'winnerTeam', 'winnerId', 'deadlineAt', 'aborted',
] as const;
const CARD_KEYS = ['id', 'rank', 'suit'] as const;
const PLAYER_KEYS = ['playerId', 'handCount'] as const;
const BID_KEYS = ['playerId', 'score'] as const;
const COMBO_KEYS = ['type', 'mainRank', 'length', 'cards'] as const;
const TRICK_KEYS = ['playerId', 'combo'] as const;
const ME_KEYS = ['playerId', 'hand'] as const;

const RANKS: readonly LandlordRank[] = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2', 'SJ', 'BJ'];
const SUITS: readonly LandlordSuit[] = ['spades', 'hearts', 'clubs', 'diamonds'];
const COMBO_TYPES: readonly LandlordComboType[] = [
  'single', 'pair', 'triple', 'triple_single', 'triple_pair', 'straight',
  'pair_sequence', 'bomb', 'rocket',
];

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

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isNullablePlayerId(value: unknown): value is string | null {
  return value === null || isPlayerId(value);
}

function parseCard(value: unknown): LandlordCard | null {
  if (!isObject(value)) return null;
  const keys = Object.keys(value);
  if (keys.length !== 2 && keys.length !== 3) return null;
  if (!keys.every((key) => CARD_KEYS.includes(key as (typeof CARD_KEYS)[number]))) return null;
  if (!isPlayerId(value.id) || !RANKS.includes(value.rank as LandlordRank)) return null;
  if (value.suit === undefined) return { id: value.id, rank: value.rank as LandlordRank };
  if (!SUITS.includes(value.suit as LandlordSuit)) return null;
  return { id: value.id, rank: value.rank as LandlordRank, suit: value.suit as LandlordSuit };
}

function parseCards(value: unknown): LandlordCard[] | null {
  if (!Array.isArray(value)) return null;
  const cards: LandlordCard[] = [];
  for (const item of value) {
    const card = parseCard(item);
    if (card === null) return null;
    cards.push(card);
  }
  return cards;
}

function parseCombo(value: unknown): LandlordCombo | null {
  if (!isObject(value) || !hasExactKeys(value, COMBO_KEYS)) return null;
  if (!COMBO_TYPES.includes(value.type as LandlordComboType)) return null;
  if (!isNonNegativeInteger(value.mainRank) || !Number.isInteger(value.length) || (value.length as number) < 1) return null;
  const cards = parseCards(value.cards);
  if (cards === null || cards.length < 1 || cards.length > 20) return null;
  return {
    type: value.type as LandlordComboType,
    mainRank: value.mainRank,
    length: value.length as number,
    cards,
  };
}

function parsePlayers(value: unknown): LandlordPlatformPublicView['players'] | null {
  if (!Array.isArray(value)) return null;
  const players: LandlordPlatformPublicView['players'] = [];
  for (const item of value) {
    if (!isObject(item) || !hasExactKeys(item, PLAYER_KEYS)) return null;
    if (!isPlayerId(item.playerId) || !isNonNegativeInteger(item.handCount)) return null;
    players.push({ playerId: item.playerId, handCount: item.handCount });
  }
  return players;
}

function parseBids(value: unknown): LandlordPlatformPublicView['bids'] | null {
  if (!Array.isArray(value)) return null;
  const bids: LandlordPlatformPublicView['bids'] = [];
  for (const item of value) {
    if (!isObject(item) || !hasExactKeys(item, BID_KEYS)) return null;
    if (!isPlayerId(item.playerId) || ![0, 1, 2, 3].includes(item.score as number)) return null;
    bids.push({ playerId: item.playerId, score: item.score as 0 | 1 | 2 | 3 });
  }
  return bids;
}

function parseTrick(value: unknown): LandlordPlatformPublicView['currentTrick'] | null {
  if (value === null) return null;
  if (!isObject(value) || !hasExactKeys(value, TRICK_KEYS) || !isPlayerId(value.playerId)) return null;
  const combo = parseCombo(value.combo);
  return combo === null ? null : { playerId: value.playerId, combo };
}

function parseBase(view: Record<string, unknown>, withMe: boolean): LandlordPlatformPublicView | null {
  if (!hasExactKeys(view, withMe ? [...PUBLIC_KEYS, 'me'] : PUBLIC_KEYS)) return null;
  if (view.gameId !== 'landlord' || view.rulesetId !== 'landlord_platform_v1' || view.schemaVersion !== 1) return null;
  if (view.phase !== 'bidding' && view.phase !== 'playing' && view.phase !== 'game_over') return null;
  const players = parsePlayers(view.players);
  const bottomCards = parseCards(view.bottomCards);
  const bids = parseBids(view.bids);
  const currentTrick = parseTrick(view.currentTrick);
  if (players === null || bottomCards === null || bids === null) return null;
  if (view.currentTrick !== null && currentTrick === null) return null;
  if (!isNullablePlayerId(view.currentBidderId) || !isNullablePlayerId(view.landlordId)
    || !isNullablePlayerId(view.currentPlayerId) || !isNullablePlayerId(view.winnerId)) return null;
  if (!isNonNegativeInteger(view.passCount) || !Number.isInteger(view.multiplier) || (view.multiplier as number) < 1) return null;
  if (view.winnerTeam !== null && view.winnerTeam !== 'landlord' && view.winnerTeam !== 'farmers') return null;
  if (view.deadlineAt !== null && !Number.isInteger(view.deadlineAt)) return null;
  if (typeof view.aborted !== 'boolean') return null;
  return {
    gameId: 'landlord',
    rulesetId: 'landlord_platform_v1',
    schemaVersion: 1,
    phase: view.phase,
    players,
    bottomCards,
    bids,
    currentBidderId: view.currentBidderId,
    landlordId: view.landlordId,
    currentPlayerId: view.currentPlayerId,
    currentTrick,
    passCount: view.passCount,
    multiplier: view.multiplier as number,
    winnerTeam: view.winnerTeam as LandlordTeam | null,
    winnerId: view.winnerId,
    deadlineAt: view.deadlineAt as number | null,
    aborted: view.aborted,
  };
}

function parseMe(value: unknown): LandlordPlatformPlayerView['me'] {
  if (value === null) return null;
  if (!isObject(value) || !hasExactKeys(value, ME_KEYS) || !isPlayerId(value.playerId)) return null;
  const hand = parseCards(value.hand);
  return hand === null ? null : { playerId: value.playerId, hand };
}

export function parseLandlordPlatformView(
  view: unknown,
  role: 'player' | 'spectator',
): LandlordPlatformPlayerView | LandlordPlatformPublicView | null {
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
