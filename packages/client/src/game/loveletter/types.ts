/** loveletter_classic16_v1 客户端严格视角类型与解析器（与服务端视图形状一一对应）。 */

export const LOVELETTER_ROLES = [
  'guard', 'priest', 'baron', 'handmaid', 'prince', 'king', 'countess', 'princess',
] as const;
export type LoveLetterRole = (typeof LOVELETTER_ROLES)[number];
export type LoveLetterPhase = 'playing' | 'game_over';

export interface LoveLetterCard {
  id: string;
  role: LoveLetterRole;
  value: number;
}

export interface LoveLetterInspection {
  viewerId: string;
  targetPlayerId: string;
  role: LoveLetterRole;
  round: number;
}

export interface LoveLetterPublicView {
  gameId: 'loveletter';
  rulesetId: 'loveletter_classic16_v1';
  schemaVersion: 1;
  phase: LoveLetterPhase;
  players: { playerId: string; handCount: number; discarded: LoveLetterCard[] }[];
  round: number;
  deckCount: number;
  removedCards: LoveLetterCard[];
  eliminatedPlayers: string[];
  protectedPlayers: string[];
  currentPlayerId: string | null;
  affection: Record<string, number>;
  affectionTarget: number;
  roundWinners: string[];
  winners: string[];
}

export interface LoveLetterPlayerView extends LoveLetterPublicView {
  me: {
    playerId: string;
    hand: LoveLetterCard[];
    inspections: LoveLetterInspection[];
  } | null;
}

const PUBLIC_KEYS = [
  'gameId', 'rulesetId', 'schemaVersion', 'phase', 'players', 'round', 'deckCount',
  'removedCards', 'eliminatedPlayers', 'protectedPlayers', 'currentPlayerId',
  'affection', 'affectionTarget', 'roundWinners', 'winners',
] as const;
const ME_KEYS = ['playerId', 'hand', 'inspections'] as const;

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

function isRole(value: unknown): value is LoveLetterRole {
  return typeof value === 'string' && (LOVELETTER_ROLES as readonly string[]).includes(value);
}

function parseCard(value: unknown): LoveLetterCard | null {
  if (!isObject(value) || Object.keys(value).length !== 3) return null;
  if (!isPlayerId(value.id) || !isRole(value.role)) return null;
  if (!isNonNegativeInteger(value.value) || (value.value as number) < 1 || (value.value as number) > 8) return null;
  return { id: value.id, role: value.role, value: value.value as number };
}

function parseCards(value: unknown): LoveLetterCard[] | null {
  if (!Array.isArray(value)) return null;
  const cards: LoveLetterCard[] = [];
  for (const item of value) {
    const card = parseCard(item);
    if (card === null) return null;
    cards.push(card);
  }
  return cards;
}

function parseInspection(value: unknown): LoveLetterInspection | null {
  if (!isObject(value) || Object.keys(value).length !== 4) return null;
  if (!isPlayerId(value.viewerId) || !isPlayerId(value.targetPlayerId) || !isRole(value.role)) return null;
  if (!isNonNegativeInteger(value.round)) return null;
  return { viewerId: value.viewerId, targetPlayerId: value.targetPlayerId, role: value.role, round: value.round as number };
}

function parseBase(view: Record<string, unknown>, withMe: boolean): LoveLetterPublicView | null {
  if (!hasExactKeys(view, withMe ? [...PUBLIC_KEYS, 'me'] : PUBLIC_KEYS)) return null;
  if (view.gameId !== 'loveletter' || view.rulesetId !== 'loveletter_classic16_v1' || view.schemaVersion !== 1) return null;
  if (view.phase !== 'playing' && view.phase !== 'game_over') return null;
  if (!isNonNegativeInteger(view.round) || (view.round as number) < 1 || !isNonNegativeInteger(view.deckCount)) return null;
  if (!isNonNegativeInteger(view.affectionTarget) || (view.affectionTarget as number) < 1) return null;
  if (view.currentPlayerId !== null && !isPlayerId(view.currentPlayerId)) return null;
  if (!Array.isArray(view.players)) return null;
  const players: LoveLetterPublicView['players'] = [];
  for (const item of view.players) {
    if (!isObject(item) || Object.keys(item).length !== 3 || !isPlayerId(item.playerId)) return null;
    if (!isNonNegativeInteger(item.handCount)) return null;
    const discarded = parseCards(item.discarded);
    if (discarded === null) return null;
    players.push({ playerId: item.playerId, handCount: item.handCount, discarded });
  }
  const removedCards = parseCards(view.removedCards);
  if (removedCards === null) return null;
  if (!Array.isArray(view.eliminatedPlayers) || !view.eliminatedPlayers.every(isPlayerId)) return null;
  if (!Array.isArray(view.protectedPlayers) || !view.protectedPlayers.every(isPlayerId)) return null;
  if (!isObject(view.affection)) return null;
  const affection: Record<string, number> = {};
  for (const key of Object.keys(view.affection)) {
    if (!isNonNegativeInteger(view.affection[key])) return null;
    affection[key] = view.affection[key] as number;
  }
  if (!Array.isArray(view.roundWinners) || !view.roundWinners.every(isPlayerId)) return null;
  if (!Array.isArray(view.winners) || !view.winners.every(isPlayerId)) return null;
  return {
    gameId: 'loveletter',
    rulesetId: 'loveletter_classic16_v1',
    schemaVersion: 1,
    phase: view.phase as LoveLetterPhase,
    players,
    round: view.round as number,
    deckCount: view.deckCount as number,
    removedCards,
    eliminatedPlayers: [...view.eliminatedPlayers],
    protectedPlayers: [...view.protectedPlayers],
    currentPlayerId: view.currentPlayerId as string | null,
    affection,
    affectionTarget: view.affectionTarget as number,
    roundWinners: [...view.roundWinners],
    winners: [...view.winners],
  };
}

function parseMe(value: unknown): LoveLetterPlayerView['me'] {
  if (value === null) return null;
  if (!isObject(value) || !hasExactKeys(value, ME_KEYS) || !isPlayerId(value.playerId)) return null;
  const hand = parseCards(value.hand);
  if (hand === null || !Array.isArray(value.inspections)) return null;
  const inspections: LoveLetterInspection[] = [];
  for (const item of value.inspections) {
    const inspection = parseInspection(item);
    if (inspection === null) return null;
    inspections.push(inspection);
  }
  return { playerId: value.playerId, hand, inspections };
}

export function parseLoveLetterView(
  view: unknown,
  role: 'player' | 'spectator',
): LoveLetterPlayerView | LoveLetterPublicView | null {
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
