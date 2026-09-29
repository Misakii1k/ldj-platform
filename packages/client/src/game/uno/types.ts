/**
 * UNO 客户端视角类型与严格解析器（D3 Task 9）。
 * 镜像 server unoPublicViewSchema / unoPlayerViewSchema：
 * 只接受精确字段，未知键、非法卡牌形状、非法颜色一律拒绝；
 * me 语义由调用方按角色决定（观战视角不得携带 me）。
 */

export type UnoColor = 'red' | 'yellow' | 'green' | 'blue';

export const UNO_COLORS: readonly UnoColor[] = ['red', 'yellow', 'green', 'blue'];
export const UNO_COLOR_NAMES: Record<UnoColor, string> = {
  red: '红',
  yellow: '黄',
  green: '绿',
  blue: '蓝',
};

/** 卡牌文本标签（legacy 与 house 主舞台共用同一权威实现）。 */
export function cardLabel(card: UnoCard): string {
  switch (card.kind) {
    case 'number': return String(card.value);
    case 'skip': return '跳过';
    case 'reverse': return '反转';
    case 'draw2': return '+2';
    case 'wild4': return '+4';
    default: return '万能';
  }
}

export function colorLabel(color: UnoColor | string | null | undefined): string {
  return color ? (UNO_COLOR_NAMES[color as UnoColor] ?? color) : '任意色';
}

/** 获取 UNO 卡牌对应的静态高清立绘资源路径 */
export function getUnoCardAssetPath(card: UnoCard | null | undefined): string {
  if (!card) return '/assets/uno/back.png';
  if (card.kind === 'number') {
    return `/assets/uno/${card.color}_${card.value}.png`;
  }
  if (card.kind === 'skip') {
    return `/assets/uno/${card.color}_skip.png`;
  }
  if (card.kind === 'reverse') {
    return `/assets/uno/${card.color}_reverse.png`;
  }
  if (card.kind === 'draw2') {
    return `/assets/uno/${card.color}_draw2.png`;
  }
  if (card.kind === 'wild4') {
    return '/assets/uno/wild4.png';
  }
  if (card.kind === 'wild') {
    return '/assets/uno/wild.png';
  }
  return '/assets/uno/back.png';
}

export type UnoCard =
  | { id: string; kind: 'number'; color: UnoColor; value: number }
  | { id: string; kind: 'skip' | 'reverse' | 'draw2'; color: UnoColor }
  | { id: string; kind: 'wild' | 'wild4' };

export interface UnoLastPlayed {
  playerId: string;
  card: UnoCard;
  declaredColor: UnoColor | null;
  resultingColor: UnoColor;
}

export interface UnoPlayerSummary {
  playerId: string;
  handCount: number;
  unoCalled: boolean;
  isCurrentPlayer: boolean;
}

export interface UnoPublicView {
  gameId: 'uno';
  phase: 'playing' | 'game_over';
  players: UnoPlayerSummary[];
  topDiscard: UnoCard;
  currentColor: UnoColor;
  currentPlayerId: string;
  currentPlayerIndex: number;
  nextPlayerId: string;
  direction: 1 | -1;
  pendingDraw: number;
  winnerId: string | null;
  deckCount: number;
  discardCount: number;
  lastPlayed: UnoLastPlayed | null;
  lastPlayedCard: UnoCard | null;
  lastPlayedBy: string | null;
}

export interface UnoPlayerView extends UnoPublicView {
  me: {
    playerId: string;
    hand: UnoCard[];
    hasDrawnThisTurn: boolean;
    isCurrentPlayer: boolean;
    playableCardIds: string[];
  } | null;
}

const PUBLIC_KEYS = [
  'gameId', 'phase', 'players', 'topDiscard', 'currentColor', 'currentPlayerId',
  'currentPlayerIndex', 'nextPlayerId', 'direction', 'pendingDraw', 'winnerId',
  'deckCount', 'discardCount', 'lastPlayed', 'lastPlayedCard', 'lastPlayedBy',
] as const;

const PLAYER_SUMMARY_KEYS = ['playerId', 'handCount', 'unoCalled', 'isCurrentPlayer'] as const;
const LAST_PLAYED_KEYS = ['playerId', 'card', 'declaredColor', 'resultingColor'] as const;
const ME_KEYS = ['playerId', 'hand', 'hasDrawnThisTurn', 'isCurrentPlayer', 'playableCardIds'] as const;

const COLORS: readonly UnoColor[] = ['red', 'yellow', 'green', 'blue'];

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

function isNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isBoolean(v: unknown): v is boolean {
  return typeof v === 'boolean';
}

function hasExactKeys(record: Record<string, unknown>, allowed: readonly string[]): boolean {
  const keys = Object.keys(record);
  if (keys.length !== allowed.length) return false;
  const allowedSet = new Set<string>(allowed);
  return keys.every((key) => allowedSet.has(key));
}

function isColor(v: unknown): v is UnoColor {
  return isString(v) && COLORS.includes(v as UnoColor);
}

function parseCard(v: unknown): UnoCard | null {
  if (!isObject(v)) return null;
  const { id, kind, color, value } = v;
  if (!isString(id)) return null;
  switch (kind) {
    case 'number':
      if (!isColor(color) || !isNumber(value) || !Number.isInteger(value)) return null;
      if (value < 0 || value > 9) return null;
      return { id, kind: 'number', color, value };
    case 'skip':
    case 'reverse':
    case 'draw2':
      if (!isColor(color)) return null;
      return { id, kind, color };
    case 'wild':
    case 'wild4':
      if ('color' in v || 'value' in v) return null;
      return { id, kind };
    default:
      return null;
  }
}

function parseLastPlayed(v: unknown): UnoLastPlayed | null {
  if (!isObject(v) || !hasExactKeys(v, LAST_PLAYED_KEYS)) return null;
  const { playerId, card, declaredColor, resultingColor } = v;
  if (!isString(playerId)) return null;
  const parsedCard = parseCard(card);
  if (parsedCard === null) return null;
  if (declaredColor !== null && !isColor(declaredColor)) return null;
  if (!isColor(resultingColor)) return null;
  return {
    playerId,
    card: parsedCard,
    declaredColor: declaredColor as UnoColor | null,
    resultingColor,
  };
}

function parsePlayerSummary(v: unknown): UnoPlayerSummary | null {
  if (!isObject(v) || !hasExactKeys(v, PLAYER_SUMMARY_KEYS)) return null;
  const { playerId, handCount, unoCalled, isCurrentPlayer } = v;
  if (!isString(playerId) || !isNumber(handCount) || !isBoolean(unoCalled) || !isBoolean(isCurrentPlayer)) return null;
  return { playerId, handCount, unoCalled, isCurrentPlayer };
}

function parseBase(v: Record<string, unknown>, allowMe: boolean): UnoPublicView | null {
  if (!hasExactKeys(v, allowMe ? [...PUBLIC_KEYS, 'me'] : PUBLIC_KEYS)) return null;
  const {
    gameId, phase, players, topDiscard, currentColor, currentPlayerId,
    currentPlayerIndex, nextPlayerId, direction, pendingDraw, winnerId,
    deckCount, discardCount, lastPlayed, lastPlayedCard, lastPlayedBy,
  } = v;
  if (gameId !== 'uno') return null;
  if (phase !== 'playing' && phase !== 'game_over') return null;
  if (!isColor(currentColor)) return null;
  if (!isString(currentPlayerId) || !isNumber(currentPlayerIndex) || !isString(nextPlayerId)) return null;
  if (direction !== 1 && direction !== -1) return null;
  if (!isNumber(pendingDraw) || !isNumber(deckCount) || !isNumber(discardCount)) return null;
  if (winnerId !== null && !isString(winnerId)) return null;
  if (lastPlayedBy !== null && !isString(lastPlayedBy)) return null;
  if (!Array.isArray(players)) return null;
  const parsedPlayers: UnoPlayerSummary[] = [];
  for (const entry of players) {
    const parsed = parsePlayerSummary(entry);
    if (parsed === null) return null;
    parsedPlayers.push(parsed);
  }
  const parsedTop = parseCard(topDiscard);
  if (parsedTop === null) return null;
  const parsedLastPlayed = lastPlayed === null ? null : parseLastPlayed(lastPlayed);
  if (lastPlayed !== null && parsedLastPlayed === null) return null;
  const parsedLastPlayedCard = lastPlayedCard === null ? null : parseCard(lastPlayedCard);
  if (lastPlayedCard !== null && parsedLastPlayedCard === null) return null;
  return {
    gameId: 'uno',
    phase: phase as UnoPublicView['phase'],
    players: parsedPlayers,
    topDiscard: parsedTop,
    currentColor,
    currentPlayerId,
    currentPlayerIndex,
    nextPlayerId,
    direction: direction as 1 | -1,
    pendingDraw,
    winnerId: winnerId as string | null,
    deckCount,
    discardCount,
    lastPlayed: parsedLastPlayed,
    lastPlayedCard: parsedLastPlayedCard,
    lastPlayedBy: lastPlayedBy as string | null,
  };
}

function parseMe(v: unknown): UnoPlayerView['me'] {
  if (v === null) return null;
  if (!isObject(v) || !hasExactKeys(v, ME_KEYS)) return null;
  const { playerId, hand, hasDrawnThisTurn, isCurrentPlayer, playableCardIds } = v;
  if (!isString(playerId) || !isBoolean(hasDrawnThisTurn) || !isBoolean(isCurrentPlayer)) return null;
  if (!Array.isArray(hand) || !Array.isArray(playableCardIds)) return null;
  const parsedHand: UnoCard[] = [];
  for (const card of hand) {
    const parsed = parseCard(card);
    if (parsed === null) return null;
    parsedHand.push(parsed);
  }
  for (const id of playableCardIds) if (!isString(id)) return null;
  return { playerId, hand: parsedHand, hasDrawnThisTurn, isCurrentPlayer, playableCardIds: playableCardIds as string[] };
}

/**
 * 严格解析 UNO 视角。me 语义由调用方按角色决定：
 * - 观战视角：me 键必须缺失；
 * - 玩家视角：me 必须存在（可为 null）。
 */
export function parseUnoView(
  view: unknown,
  role: 'player' | 'spectator',
): UnoPlayerView | UnoPublicView | null {
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

// —— uno_platform_house_v1 视角（D4-U-UI，镜像 server/house 白名单视图）——

export type UnoHousePhase = 'round_playing' | 'round_over' | 'match_over';
export type UnoHouseMode = 'individual' | 'team';
export type UnoHouseRoundCount = 1 | 3 | 5 | 7;

export interface UnoHousePlayerSummary {
  playerId: string;
  handCount: number;
  unoCalled: boolean;
  isCurrentPlayer: boolean;
  teamId: string | null;
}

export interface UnoHousePendingPenalty {
  total: number;
  kind: 'draw2' | 'draw4';
  responderId: string;
  challengeable: boolean;
  windowToken: string;
}

export interface UnoHouseRaceWindow {
  targetPlayerId: string;
  windowToken: string;
  openedAtSequence: number;
  closesEarlyOnNextEffective: true;
}

export interface UnoHouseClockInfo {
  turnDeadlineAt: number | null;
  windowDeadlineAt: number | null;
}

export interface UnoHouseMatchRankingEntry {
  playerId: string;
  total: number;
  rank: number;
}

export interface UnoHousePublicView {
  gameId: 'uno';
  rulesetId: 'uno_platform_house_v1';
  phase: UnoHousePhase;
  round: number;
  roundLimit: UnoHouseRoundCount;
  mode: UnoHouseMode;
  players: UnoHousePlayerSummary[];
  topDiscard: UnoCard;
  currentColor: UnoColor;
  currentPlayerId: string;
  direction: 1 | -1;
  pendingPenalty: UnoHousePendingPenalty | null;
  unoRaceWindow: UnoHouseRaceWindow | null;
  deckCount: number;
  discardCount: number;
  roundScores: number[][];
  cumulativeScores: number[];
  matchRanking: UnoHouseMatchRankingEntry[] | null;
  clockInfo: UnoHouseClockInfo;
  /** 最近一局的结算快照（仅 round_over / match_over 阶段下发；对局中恒为 null）。 */
  lastRound: UnoHouseLastRound | null;
}

export interface UnoHouseLastRound {
  roundNumber: number;
  finisherPlayerId: string;
  /** 每人结算时剩余手牌（按 players 顺序，出完的人是空数组）。 */
  remainingHands: UnoCard[][];
}

export interface UnoHousePlayerMeView {
  playerId: string;
  hand: UnoCard[];
  playableCardIds: string[];
  capabilities: string[];
  hasDrawnThisTurn: boolean;
  isCurrentPlayer: boolean;
  activeWindow: string | null;
}

export interface UnoHouseRoundResult {
  roundNumber: number;
  finisherPlayerId: string;
  perPlayerTotals: number[];
  teamTotals: number[] | null;
  winnerPlayerIds: string[];
  teamWinnerIds: string[] | null;
  remainingHands?: UnoCard[][];
}

export interface UnoHousePlayerView extends UnoHousePublicView {
  me: UnoHousePlayerMeView | null;
}

const HOUSE_PUBLIC_KEYS = [
  'gameId', 'rulesetId', 'phase', 'round', 'roundLimit', 'mode', 'players',
  'topDiscard', 'currentColor', 'currentPlayerId', 'direction', 'pendingPenalty',
  'unoRaceWindow', 'deckCount', 'discardCount', 'roundScores', 'cumulativeScores',
  'matchRanking', 'clockInfo', 'lastRound',
] as const;

const HOUSE_PLAYER_SUMMARY_KEYS = ['playerId', 'handCount', 'unoCalled', 'isCurrentPlayer', 'teamId'] as const;
const HOUSE_PENALTY_KEYS = ['total', 'kind', 'responderId', 'challengeable', 'windowToken'] as const;
const HOUSE_RACE_KEYS = ['targetPlayerId', 'windowToken', 'openedAtSequence', 'closesEarlyOnNextEffective'] as const;
const HOUSE_CLOCK_KEYS = ['turnDeadlineAt', 'windowDeadlineAt'] as const;
const HOUSE_RANKING_KEYS = ['playerId', 'total', 'rank'] as const;
const HOUSE_LAST_ROUND_KEYS = ['roundNumber', 'finisherPlayerId', 'remainingHands'] as const;
const HOUSE_ME_KEYS = [
  'playerId', 'hand', 'playableCardIds', 'capabilities', 'hasDrawnThisTurn',
  'isCurrentPlayer', 'activeWindow',
] as const;

const HOUSE_PHASES: readonly UnoHousePhase[] = ['round_playing', 'round_over', 'match_over'];
const HOUSE_MODES: readonly UnoHouseMode[] = ['individual', 'team'];
const HOUSE_ROUND_LIMITS = new Set<number>([1, 3, 5, 7]);

function parseHousePlayerSummary(v: unknown): UnoHousePlayerSummary | null {
  if (!isObject(v) || !hasExactKeys(v, HOUSE_PLAYER_SUMMARY_KEYS)) return null;
  const { playerId, handCount, unoCalled, isCurrentPlayer, teamId } = v;
  if (!isString(playerId) || !isNumber(handCount) || !isBoolean(unoCalled) || !isBoolean(isCurrentPlayer)) return null;
  if (teamId !== null && !isString(teamId)) return null;
  return { playerId, handCount, unoCalled, isCurrentPlayer, teamId: teamId as string | null };
}

function parseHousePenalty(v: unknown): UnoHousePendingPenalty | null {
  if (!isObject(v) || !hasExactKeys(v, HOUSE_PENALTY_KEYS)) return null;
  const { total, kind, responderId, challengeable, windowToken } = v;
  if (!isNumber(total) || (kind !== 'draw2' && kind !== 'draw4')) return null;
  if (!isString(responderId) || !isBoolean(challengeable) || !isString(windowToken)) return null;
  return { total, kind, responderId, challengeable, windowToken };
}

function parseHouseRaceWindow(v: unknown): UnoHouseRaceWindow | null {
  if (!isObject(v) || !hasExactKeys(v, HOUSE_RACE_KEYS)) return null;
  const { targetPlayerId, windowToken, openedAtSequence, closesEarlyOnNextEffective } = v;
  if (!isString(targetPlayerId) || !isString(windowToken) || !isNumber(openedAtSequence)) return null;
  if (closesEarlyOnNextEffective !== true) return null;
  return { targetPlayerId, windowToken, openedAtSequence, closesEarlyOnNextEffective };
}

function parseHouseClock(v: unknown): UnoHouseClockInfo | null {
  if (!isObject(v) || !hasExactKeys(v, HOUSE_CLOCK_KEYS)) return null;
  const { turnDeadlineAt, windowDeadlineAt } = v;
  if (turnDeadlineAt !== null && !isNumber(turnDeadlineAt)) return null;
  if (windowDeadlineAt !== null && !isNumber(windowDeadlineAt)) return null;
  return { turnDeadlineAt: turnDeadlineAt as number | null, windowDeadlineAt: windowDeadlineAt as number | null };
}

function parseHouseRanking(v: unknown): UnoHouseMatchRankingEntry | null {
  if (!isObject(v) || !hasExactKeys(v, HOUSE_RANKING_KEYS)) return null;
  const { playerId, total, rank } = v;
  if (!isString(playerId) || !isNumber(total) || !isNumber(rank)) return null;
  return { playerId, total, rank };
}

function parseHouseLastRound(v: unknown): UnoHouseLastRound | null {
  if (!isObject(v) || !hasExactKeys(v, HOUSE_LAST_ROUND_KEYS)) return null;
  const { roundNumber, finisherPlayerId, remainingHands } = v;
  if (!isNumber(roundNumber) || !isString(finisherPlayerId)) return null;
  if (!Array.isArray(remainingHands)) return null;
  const parsedHands: UnoCard[][] = [];
  for (const hand of remainingHands) {
    if (!Array.isArray(hand)) return null;
    const parsedHand: UnoCard[] = [];
    for (const card of hand) {
      const parsed = parseCard(card);
      if (parsed === null) return null;
      parsedHand.push(parsed);
    }
    parsedHands.push(parsedHand);
  }
  return { roundNumber, finisherPlayerId, remainingHands: parsedHands };
}

function parseHouseMe(v: unknown): UnoHousePlayerMeView | null {
  if (v === null) return null;
  if (!isObject(v) || !hasExactKeys(v, HOUSE_ME_KEYS)) return null;
  const { playerId, hand, playableCardIds, capabilities, hasDrawnThisTurn, isCurrentPlayer, activeWindow } = v;
  if (!isString(playerId) || !isBoolean(hasDrawnThisTurn) || !isBoolean(isCurrentPlayer)) return null;
  if (activeWindow !== null && !isString(activeWindow)) return null;
  if (!Array.isArray(hand) || !Array.isArray(playableCardIds) || !Array.isArray(capabilities)) return null;
  const parsedHand: UnoCard[] = [];
  for (const card of hand) {
    const parsed = parseCard(card);
    if (parsed === null) return null;
    parsedHand.push(parsed);
  }
  for (const id of playableCardIds) if (!isString(id)) return null;
  for (const cap of capabilities) if (!isString(cap)) return null;
  return {
    playerId,
    hand: parsedHand,
    playableCardIds: playableCardIds as string[],
    capabilities: capabilities as string[],
    hasDrawnThisTurn,
    isCurrentPlayer,
    activeWindow: activeWindow as string | null,
  };
}

/**
 * 严格解析 uno_platform_house_v1 视角。me 语义由调用方按角色决定：
 * - 观战视角：me 键必须缺失；
 * - 玩家视角：me 必须存在（可为 null）。
 * 任何未知键、缺失键或非法枚举都返回 null。
 */
export function parseUnoHouseView(
  view: unknown,
  role: 'player' | 'spectator',
): UnoHousePlayerView | UnoHousePublicView | null {
  if (!isObject(view)) return null;
  if (!hasExactKeys(view, role === 'spectator' ? HOUSE_PUBLIC_KEYS : [...HOUSE_PUBLIC_KEYS, 'me'])) return null;
  const {
    gameId, rulesetId, phase, round, roundLimit, mode, players, topDiscard,
    currentColor, currentPlayerId, direction, pendingPenalty, unoRaceWindow,
    deckCount, discardCount, roundScores, cumulativeScores, matchRanking, clockInfo,
    lastRound,
  } = view;
  if (gameId !== 'uno' || rulesetId !== 'uno_platform_house_v1') return null;
  if (!HOUSE_PHASES.includes(phase as UnoHousePhase)) return null;
  if (!HOUSE_MODES.includes(mode as UnoHouseMode)) return null;
  if (!isNumber(round) || !HOUSE_ROUND_LIMITS.has(roundLimit as number)) return null;
  if (!isColor(currentColor) || !isString(currentPlayerId)) return null;
  if (direction !== 1 && direction !== -1) return null;
  if (!isNumber(deckCount) || !isNumber(discardCount)) return null;
  if (!Array.isArray(players) || !Array.isArray(roundScores) || !Array.isArray(cumulativeScores)) return null;

  const parsedPlayers: UnoHousePlayerSummary[] = [];
  for (const entry of players) {
    const parsed = parseHousePlayerSummary(entry);
    if (parsed === null) return null;
    parsedPlayers.push(parsed);
  }
  const parsedTop = parseCard(topDiscard);
  if (parsedTop === null) return null;
  const parsedPenalty = pendingPenalty === null ? null : parseHousePenalty(pendingPenalty);
  if (pendingPenalty !== null && parsedPenalty === null) return null;
  const parsedRace = unoRaceWindow === null ? null : parseHouseRaceWindow(unoRaceWindow);
  if (unoRaceWindow !== null && parsedRace === null) return null;
  const parsedClock = parseHouseClock(clockInfo);
  if (parsedClock === null) return null;
  const parsedLastRound = lastRound === null ? null : parseHouseLastRound(lastRound);
  if (lastRound !== null && parsedLastRound === null) return null;

  const parsedRoundScores: number[][] = [];
  for (const row of roundScores) {
    if (!Array.isArray(row) || !row.every((n) => isNumber(n))) return null;
    parsedRoundScores.push(row as number[]);
  }
  if (!cumulativeScores.every((n) => isNumber(n))) return null;

  let parsedRanking: UnoHouseMatchRankingEntry[] | null = null;
  if (matchRanking !== null) {
    if (!Array.isArray(matchRanking)) return null;
    parsedRanking = [];
    for (const entry of matchRanking) {
      const parsed = parseHouseRanking(entry);
      if (parsed === null) return null;
      parsedRanking.push(parsed);
    }
  }

  const base: UnoHousePublicView = {
    gameId: 'uno',
    rulesetId: 'uno_platform_house_v1',
    phase: phase as UnoHousePhase,
    round: round as number,
    roundLimit: roundLimit as UnoHouseRoundCount,
    mode: mode as UnoHouseMode,
    players: parsedPlayers,
    topDiscard: parsedTop,
    currentColor,
    currentPlayerId,
    direction: direction as 1 | -1,
    pendingPenalty: parsedPenalty,
    unoRaceWindow: parsedRace,
    deckCount,
    discardCount,
    roundScores: parsedRoundScores,
    cumulativeScores: cumulativeScores as number[],
    matchRanking: parsedRanking,
    clockInfo: parsedClock,
    lastRound: parsedLastRound,
  };

  if (role === 'spectator') {
    if ('me' in view) return null;
    return base;
  }
  if (!('me' in view)) return null;
  const me = parseHouseMe(view.me);
  if (view.me !== null && me === null) return null;
  return { ...base, me };
}
