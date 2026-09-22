/** bell_clash_v1 客户端严格视角类型与解析器（与服务端视图形状一一对应）。 */

export const COLORS = ['red', 'yellow', 'green', 'blue'] as const;
export type CardColor = (typeof COLORS)[number];
export type BellClashPhase = 'playing' | 'game_over';

export interface NumberCard {
  kind: 'number';
  color: CardColor;
  number: number;
}

export interface PhraseCard {
  kind: 'phrase';
  color: CardColor;
  phrase: string;
}

export type BellClashCard = NumberCard | PhraseCard;

export interface BellClashPublicView {
  gameId: 'bell-clash';
  rulesetId: 'bell_clash_v1';
  schemaVersion: 1;
  phase: BellClashPhase;
  players: string[];
  handCounts: Record<string, number>;
  currentPlayerId: string;
  discardTop: BellClashCard | null;
  bellOpen: boolean;
  bellClaimantId: string | null;
  drawCount: number;
  winners: string[];
  /** 当前计时截止时刻；终局为 null */
  deadlineAt: number | null;
  /** 截止时刻的类别：回合 or 抢铃窗口。两类时长差很多，倒计时环据此换 phaseKey */
  deadlineKind: 'turn' | 'bell' | null;
}

export interface BellClashPlayerView extends BellClashPublicView {
  me: {
    playerId: string;
    hand: BellClashCard[];
  } | null;
}

const PUBLIC_KEYS = [
  'gameId', 'rulesetId', 'schemaVersion', 'phase', 'players', 'handCounts',
  'currentPlayerId', 'discardTop', 'bellOpen', 'bellClaimantId', 'drawCount', 'winners',
  'deadlineAt', 'deadlineKind',
] as const;
const ME_KEYS = ['playerId', 'hand'] as const;

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

function isBool(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isPlayerIds(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isPlayerId);
}

function isColor(value: unknown): value is CardColor {
  return typeof value === 'string' && (COLORS as readonly string[]).includes(value);
}

function parseCard(value: unknown): BellClashCard | null {
  if (!isObject(value) || Object.keys(value).length !== 3) return null;
  if (value.kind === 'number') {
    if (!isColor(value.color) || !isNonNegativeInteger(value.number) || (value.number as number) < 1 || (value.number as number) > 8) return null;
    return { kind: 'number', color: value.color, number: value.number as number };
  }
  if (value.kind === 'phrase') {
    if (!isColor(value.color) || typeof value.phrase !== 'string' || value.phrase.length < 1) return null;
    return { kind: 'phrase', color: value.color, phrase: value.phrase };
  }
  return null;
}

function parseCards(value: unknown): BellClashCard[] | null {
  if (!Array.isArray(value)) return null;
  const cards: BellClashCard[] = [];
  for (const item of value) {
    const card = parseCard(item);
    if (card === null) return null;
    cards.push(card);
  }
  return cards;
}

function parseBase(view: Record<string, unknown>, withMe: boolean): BellClashPublicView | null {
  if (!hasExactKeys(view, withMe ? [...PUBLIC_KEYS, 'me'] : PUBLIC_KEYS)) return null;
  if (view.gameId !== 'bell-clash' || view.rulesetId !== 'bell_clash_v1' || view.schemaVersion !== 1) return null;
  if (view.phase !== 'playing' && view.phase !== 'game_over') return null;
  if (!isPlayerIds(view.players) || !isPlayerId(view.currentPlayerId)) return null;
  if (!isObject(view.handCounts)) return null;
  for (const key of Object.keys(view.handCounts)) {
    if (!isNonNegativeInteger(view.handCounts[key])) return null;
  }
  if (view.discardTop !== null && parseCard(view.discardTop) === null) return null;
  if (!isBool(view.bellOpen)) return null;
  if (view.bellClaimantId !== null && !isPlayerId(view.bellClaimantId)) return null;
  if (!isNonNegativeInteger(view.drawCount) || !isPlayerIds(view.winners)) return null;
  if (view.deadlineAt !== null && typeof view.deadlineAt !== 'number') return null;
  if (view.deadlineKind !== null && view.deadlineKind !== 'turn' && view.deadlineKind !== 'bell') return null;
  return {
    gameId: 'bell-clash',
    rulesetId: 'bell_clash_v1',
    schemaVersion: 1,
    phase: view.phase as BellClashPhase,
    players: [...view.players],
    handCounts: { ...(view.handCounts as Record<string, number>) },
    currentPlayerId: view.currentPlayerId as string,
    discardTop: view.discardTop === null ? null : parseCard(view.discardTop),
    bellOpen: view.bellOpen as boolean,
    bellClaimantId: view.bellClaimantId as string | null,
    drawCount: view.drawCount as number,
    winners: [...view.winners],
    deadlineAt: view.deadlineAt as number | null,
    deadlineKind: view.deadlineKind as 'turn' | 'bell' | null,
  };
}

function parseMe(value: unknown): BellClashPlayerView['me'] {
  if (value === null) return null;
  if (!isObject(value) || !hasExactKeys(value, ME_KEYS) || !isPlayerId(value.playerId)) return null;
  const hand = parseCards(value.hand);
  if (hand === null) return null;
  return { playerId: value.playerId, hand };
}

export function parseBellClashView(
  view: unknown,
  role: 'player' | 'spectator',
): BellClashPlayerView | BellClashPublicView | null {
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
