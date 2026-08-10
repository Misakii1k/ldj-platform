import { parseLoveLetterAction, parseLoveLetterConfig } from './schemas.ts';
import {
  LOVELETTER_ROLES,
  type LoveLetterAction,
  type LoveLetterCard,
  type LoveLetterEvent,
  type LoveLetterReduceResult,
  type LoveLetterRole,
  type LoveLetterState,
  type PlayCardAction,
} from './types.ts';

const COUNTS: Record<LoveLetterRole, number> = {
  guard: 5,
  priest: 2,
  baron: 2,
  handmaid: 2,
  prince: 2,
  king: 1,
  countess: 1,
  princess: 1,
};
const VALUES: Record<LoveLetterRole, LoveLetterCard['value']> = {
  guard: 1, priest: 2, baron: 3, handmaid: 4, prince: 5, king: 6, countess: 7, princess: 8,
};
const TARGET_OTHER = new Set<LoveLetterRole>(['guard', 'priest', 'baron', 'king']);
const deny = (message: string): LoveLetterReduceResult => ({ ok: false, code: 'ACTION_NOT_ALLOWED', message });

export function buildLoveLetterDeck(): LoveLetterCard[] {
  return LOVELETTER_ROLES.flatMap((role) =>
    Array.from({ length: COUNTS[role] }, (_, index) => ({
      id: `${role}-${index + 1}`,
      role,
      value: VALUES[role],
    })),
  );
}

export function affectionTarget(playerCount: number): number {
  if (playerCount === 2) return 7;
  if (playerCount === 3) return 5;
  if (playerCount === 4) return 4;
  throw new Error('情书需要 2 至 4 名玩家');
}

function validateDeck(cards: readonly LoveLetterCard[]): void {
  if (cards.length !== 16 || new Set(cards.map((card) => card.id)).size !== 16) throw new Error('牌组必须包含 16 张唯一角色牌');
  for (const role of LOVELETTER_ROLES) {
    if (cards.filter((card) => card.role === role && card.value === VALUES[role]).length !== COUNTS[role]) {
      throw new Error('牌组组成无效');
    }
  }
}

function prepareRound(
  players: readonly string[],
  deckOrder: readonly LoveLetterCard[],
  affection: Record<string, number>,
  round: number,
  starterId: string,
  futureDeckOrders: LoveLetterCard[][],
): LoveLetterState {
  validateDeck(deckOrder);
  const deck = deckOrder.map((card) => ({ ...card }));
  const reserveCard = deck.shift()!;
  const removedCards = players.length === 2 ? deck.splice(0, 3) : [];
  const hands: Record<string, LoveLetterCard[]> = Object.fromEntries(players.map((id) => [id, [deck.shift()!]]));
  hands[starterId]!.push(deck.shift()!);
  return {
    schemaVersion: 1,
    phase: 'playing',
    players: [...players],
    round,
    deck,
    reserveCard,
    removedCards,
    hands,
    discardPiles: Object.fromEntries(players.map((id) => [id, []])),
    eliminatedPlayers: [],
    protectedPlayers: [],
    currentPlayerId: starterId,
    affection: { ...affection },
    affectionTarget: affectionTarget(players.length),
    inspections: [],
    roundWinners: [],
    winners: [],
    futureDeckOrders: futureDeckOrders.map((cards) => cards.map((card) => ({ ...card }))),
  };
}

export function createLoveLetterState(players: readonly string[], configInput: unknown = {}): LoveLetterState {
  if (players.length < 2 || players.length > 4) throw new Error('情书需要 2 至 4 名玩家');
  if (new Set(players).size !== players.length || players.some((id) => id.length < 1)) throw new Error('玩家列表无效');
  const config = parseLoveLetterConfig(configInput);
  const state = prepareRound(
    players,
    config.deckOrder ?? buildLoveLetterDeck(),
    Object.fromEntries(players.map((id) => [id, 0])),
    1,
    players[0]!,
    config.futureDeckOrders ?? [],
  );
  assertLoveLetterInvariants(state);
  return state;
}

function isAlive(state: LoveLetterState, playerId: string): boolean {
  return state.players.includes(playerId) && !state.eliminatedPlayers.includes(playerId);
}

function eliminate(state: LoveLetterState, playerId: string, reason: LoveLetterRole, events: LoveLetterEvent[]): void {
  if (!isAlive(state, playerId)) return;
  state.eliminatedPlayers.push(playerId);
  state.protectedPlayers = state.protectedPlayers.filter((id) => id !== playerId);
  state.discardPiles[playerId]!.push(...state.hands[playerId]!);
  state.hands[playerId] = [];
  events.push({ type: 'player_eliminated', playerId, reason });
}

function validOtherTargets(state: LoveLetterState, actorId: string): string[] {
  return state.players.filter(
    (id) => id !== actorId && isAlive(state, id) && !state.protectedPlayers.includes(id),
  );
}

function discardTotal(state: LoveLetterState, playerId: string): number {
  return state.discardPiles[playerId]!.reduce((sum, card) => sum + card.value, 0);
}

function roundWinners(state: LoveLetterState): string[] {
  const alive = state.players.filter((id) => isAlive(state, id));
  let bestHand = -1;
  let bestDiscard = -1;
  let winners: string[] = [];
  for (const id of alive) {
    const hand = state.hands[id]![0]?.value ?? -1;
    const discarded = discardTotal(state, id);
    if (hand > bestHand || (hand === bestHand && discarded > bestDiscard)) {
      bestHand = hand;
      bestDiscard = discarded;
      winners = [id];
    } else if (hand === bestHand && discarded === bestDiscard) winners.push(id);
  }
  return winners;
}

function nextAlive(state: LoveLetterState, from: string): string {
  const start = state.players.indexOf(from);
  for (let offset = 1; offset <= state.players.length; offset += 1) {
    const candidate = state.players[(start + offset) % state.players.length]!;
    if (isAlive(state, candidate)) return candidate;
  }
  throw new Error('没有存活玩家');
}

function settleRound(state: LoveLetterState, events: LoveLetterEvent[]): LoveLetterState {
  const winners = roundWinners(state);
  for (const id of winners) state.affection[id] = state.affection[id]! + 1;
  state.roundWinners = winners;
  events.push({ type: 'round_finished', winners: [...winners] });
  const gameWinners = state.players.filter((id) => state.affection[id]! >= state.affectionTarget);
  if (gameWinners.length > 0) {
    state.phase = 'game_over';
    state.currentPlayerId = null;
    state.winners = gameWinners;
    events.push({ type: 'game_finished', winners: [...gameWinners] });
    return state;
  }
  const nextDeck = state.futureDeckOrders.shift() ?? buildLoveLetterDeck();
  const nextStarter = winners[0]!;
  const next = prepareRound(
    state.players,
    nextDeck,
    state.affection,
    state.round + 1,
    nextStarter,
    state.futureDeckOrders,
  );
  events.push({ type: 'round_started', round: next.round, currentPlayerId: nextStarter });
  return next;
}

function princeDiscard(
  state: LoveLetterState,
  targetId: string,
  events: LoveLetterEvent[],
): void {
  const discarded = state.hands[targetId]!.shift()!;
  state.discardPiles[targetId]!.push(discarded);
  if (discarded.role === 'princess') {
    eliminate(state, targetId, 'princess', events);
    return;
  }
  const replacement = state.deck.shift() ?? state.reserveCard;
  if (replacement) {
    state.hands[targetId]!.push(replacement);
    if (replacement === state.reserveCard) state.reserveCard = null;
  }
}

function requiredTarget(
  state: LoveLetterState,
  action: PlayCardAction,
  role: LoveLetterRole,
): string | null | undefined {
  if (TARGET_OTHER.has(role)) {
    const candidates = validOtherTargets(state, action.playerId);
    if (candidates.length === 0) return action.targetPlayerId === undefined ? null : undefined;
    if (!action.targetPlayerId || !candidates.includes(action.targetPlayerId)) return undefined;
    return action.targetPlayerId;
  }
  if (role === 'prince') {
    const candidates = state.players.filter((id) =>
      isAlive(state, id) && (id === action.playerId || !state.protectedPlayers.includes(id)),
    );
    if (!action.targetPlayerId || !candidates.includes(action.targetPlayerId)) return undefined;
    return action.targetPlayerId;
  }
  if (action.targetPlayerId !== undefined) return undefined;
  return null;
}

function applyRole(
  state: LoveLetterState,
  actorId: string,
  card: LoveLetterCard,
  targetId: string | null,
  guessedRole: LoveLetterRole | undefined,
  events: LoveLetterEvent[],
): void {
  if (card.role === 'princess') eliminate(state, actorId, 'princess', events);
  else if (card.role === 'handmaid') {
    state.protectedPlayers.push(actorId);
    events.push({ type: 'player_protected', playerId: actorId });
  } else if (card.role === 'priest' && targetId) {
    state.inspections.push({ viewerId: actorId, targetPlayerId: targetId, role: state.hands[targetId]![0]!.role, round: state.round });
    events.push({ type: 'hand_inspected', viewerId: actorId, targetPlayerId: targetId });
  } else if (card.role === 'guard' && targetId && guessedRole && state.hands[targetId]![0]!.role === guessedRole) {
    eliminate(state, targetId, 'guard', events);
  } else if (card.role === 'baron' && targetId) {
    const actorValue = state.hands[actorId]![0]!.value;
    const targetValue = state.hands[targetId]![0]!.value;
    if (actorValue < targetValue) eliminate(state, actorId, 'baron', events);
    else if (targetValue < actorValue) eliminate(state, targetId, 'baron', events);
  } else if (card.role === 'prince' && targetId) princeDiscard(state, targetId, events);
  else if (card.role === 'king' && targetId) {
    [state.hands[actorId], state.hands[targetId]] = [state.hands[targetId]!, state.hands[actorId]!];
    events.push({ type: 'hands_swapped', playerIds: [actorId, targetId] });
  }
}

function advanceTurn(state: LoveLetterState, from: string): void {
  const next = nextAlive(state, from);
  state.protectedPlayers = state.protectedPlayers.filter((id) => id !== next);
  const drawn = state.deck.shift();
  if (!drawn) throw new Error('推进回合时牌库为空');
  state.hands[next]!.push(drawn);
  state.currentPlayerId = next;
}

export function reduceLoveLetterState(state: LoveLetterState, actionInput: LoveLetterAction | unknown): LoveLetterReduceResult {
  let action: LoveLetterAction;
  try { action = parseLoveLetterAction(actionInput); } catch (error) { return deny(error instanceof Error ? error.message : '动作无效'); }
  // 平台开局投递的 begin 为幂等系统动作：不推进状态。
  if (action.type === 'begin') return { ok: true, nextState: state, events: [] };
  if (state.phase === 'game_over') return deny('本局已经结束');
  if (action.playerId !== state.currentPlayerId) return deny('还没轮到你');
  if (!isAlive(state, action.playerId)) return deny('已淘汰玩家不能操作');
  const hand = state.hands[action.playerId] ?? [];
  const played = hand.find((card) => card.id === action.cardId);
  if (!played) return deny('选择的手牌无效');
  if (hand.length !== 2) return deny('当前手牌状态无效');
  if (hand.some((card) => card.role === 'countess') && hand.some((card) => card.role === 'prince' || card.role === 'king') && played.role !== 'countess') {
    return deny('持有伯爵夫人与王子或国王时必须打出伯爵夫人');
  }
  const target = requiredTarget(state, action, played.role);
  if (target === undefined) return deny('目标玩家无效');
  if (played.role === 'guard' && target !== null && (!action.guessedRole || action.guessedRole === 'guard')) return deny('守卫必须猜测守卫以外的角色');
  if (played.role !== 'guard' && action.guessedRole !== undefined) return deny('该角色不需要猜测');

  const next = structuredClone(state);
  const events: LoveLetterEvent[] = [{ type: 'card_played', playerId: action.playerId, role: played.role }];
  next.hands[action.playerId] = next.hands[action.playerId]!.filter((card) => card.id !== played.id);
  next.discardPiles[action.playerId]!.push(played);
  applyRole(next, action.playerId, played, target, action.guessedRole, events);

  const aliveCount = next.players.filter((id) => isAlive(next, id)).length;
  const settled = aliveCount <= 1 || next.deck.length === 0;
  const result = settled ? settleRound(next, events) : next;
  if (!settled) advanceTurn(result, action.playerId);
  assertLoveLetterInvariants(result);
  return { ok: true, nextState: result, events };
}

export function assertLoveLetterInvariants(state: LoveLetterState): void {
  if (state.schemaVersion !== 1) throw new Error('状态版本无效');
  if (state.players.length < 2 || state.players.length > 4 || new Set(state.players).size !== state.players.length) throw new Error('玩家列表无效');
  if (state.affectionTarget !== affectionTarget(state.players.length)) throw new Error('好感阈值无效');
  for (const id of state.players) {
    if (!Array.isArray(state.hands[id]) || !Array.isArray(state.discardPiles[id])) throw new Error('玩家牌区缺失');
    if (!Number.isInteger(state.affection[id]) || state.affection[id]! < 0) throw new Error('好感无效');
    if (state.phase === 'playing') {
      const expected = id === state.currentPlayerId ? 2 : isAlive(state, id) ? 1 : 0;
      if (state.hands[id]!.length !== expected) throw new Error('玩家手牌数量无效');
    }
  }
  if (new Set(state.eliminatedPlayers).size !== state.eliminatedPlayers.length || state.eliminatedPlayers.some((id) => !state.players.includes(id))) throw new Error('淘汰列表无效');
  if (new Set(state.protectedPlayers).size !== state.protectedPlayers.length || state.protectedPlayers.some((id) => !isAlive(state, id))) throw new Error('保护列表无效');
  if (state.phase === 'playing' && (!state.currentPlayerId || !isAlive(state, state.currentPlayerId) || state.winners.length > 0)) throw new Error('进行中状态无效');
  if (state.phase === 'game_over' && (state.currentPlayerId !== null || state.winners.length === 0)) throw new Error('终局状态无效');

  const cards = [
    ...state.deck,
    ...(state.reserveCard ? [state.reserveCard] : []),
    ...state.removedCards,
    ...state.players.flatMap((id) => [...state.hands[id]!, ...state.discardPiles[id]!]),
  ];
  if (cards.length !== 16 || new Set(cards.map((card) => card.id)).size !== 16) throw new Error('角色牌守恒无效');
  validateDeck(cards);
}