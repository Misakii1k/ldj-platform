/** landlord_platform_v1 — 纯规则 reducer（GameModuleV2）。 */
import type { Actor, GameContext, GameEffect, PrivateGameEvent } from '@ldj/shared';
import {
  buildLandlordDeck,
  canBeat,
  identifyCombo,
  sortCards,
  type LandlordCard,
  type LandlordCombo,
} from '../cards.ts';
import { platformActionSchema, platformStateSchema } from './schemas.ts';
import type {
  PlatformAction,
  PlatformEvent,
  PlatformPlayerView,
  PlatformPublicView,
  PlatformResult,
  PlatformState,
} from './types.ts';

export type PlatformReduceResult =
  | { ok: false; code: string; message: string }
  | {
      ok: true;
      nextState: PlatformState;
      publicEvents: PlatformEvent[];
      privateEvents: PrivateGameEvent[];
      effects: GameEffect[];
      resultCandidate: PlatformResult | null;
    };

const BID_PHASE_MS = 30_000;
const PLAY_PHASE_MS = 30_000;

const PLAYER_ACTIONS = new Set<PlatformAction['type']>(['bid_score', 'play_combo', 'pass_turn']);

const deny = (message: string): PlatformReduceResult => ({ ok: false, code: 'ACTION_NOT_ALLOWED', message });
const noop = (state: PlatformState): PlatformReduceResult => ({
  ok: true,
  nextState: state,
  publicEvents: [],
  privateEvents: [],
  effects: [],
  resultCandidate: null,
});
const okResult = (state: PlatformState, publicEvents: PlatformEvent[], effects: GameEffect[]): PlatformReduceResult => ({
  ok: true,
  nextState: state,
  publicEvents,
  privateEvents: [],
  effects,
  resultCandidate: state.phase === 'game_over' ? buildPlatformResult(state) : null,
});
const next = (state: PlatformState, from: string): string =>
  state.players[(state.players.indexOf(from) + 1) % state.players.length]!;

function cancelCurrentTimer(state: PlatformState, effects: GameEffect[]): void {
  if (state.phaseToken) effects.push({ type: 'cancel_timer', timerId: `landlord:${state.phaseToken}` });
  state.deadlineAt = null;
  state.phaseToken = null;
}

function scheduleBidTimer(state: PlatformState, ctx: GameContext, effects: GameEffect[]): void {
  const token = `bid:${state.currentBidderId}`;
  state.phaseToken = token;
  state.deadlineAt = ctx.now + BID_PHASE_MS;
  effects.push({
    type: 'schedule_timer',
    timerId: `landlord:${token}`,
    deadlineAt: state.deadlineAt,
    action: { type: 'phase_timeout', phase: 'bidding', token },
  });
}

function schedulePlayTimer(state: PlatformState, ctx: GameContext, effects: GameEffect[]): void {
  const token = `play:${state.currentPlayerId}`;
  state.phaseToken = token;
  state.deadlineAt = ctx.now + PLAY_PHASE_MS;
  effects.push({
    type: 'schedule_timer',
    timerId: `landlord:${token}`,
    deadlineAt: state.deadlineAt,
    action: { type: 'phase_timeout', phase: 'playing', token },
  });
}

function decideLandlord(state: PlatformState, ctx: GameContext, publicEvents: PlatformEvent[], effects: GameEffect[]): void {
  const best = [...state.bids].sort((a, b) => b.score - a.score)[0];
  const landlordId = best && best.score > 0 ? best.playerId : state.players[0]!;
  state.landlordId = landlordId;
  state.multiplier = Math.max(1, best?.score ?? 1);
  state.hands[landlordId] = sortCards([...(state.hands[landlordId] ?? []), ...state.bottomCards]);
  state.phase = 'playing';
  state.currentBidderId = null;
  state.currentPlayerId = landlordId;
  state.deadlineAt = null;
  state.phaseToken = null;
  publicEvents.push({ type: 'landlord_decided', playerId: landlordId });
  effects.push({ type: 'system_message', text: `${landlordId} 成为地主，倍数 ${state.multiplier}` });
  schedulePlayTimer(state, ctx, effects);
}

function applyBid(state: PlatformState, ctx: GameContext, score: 0 | 1 | 2 | 3, publicEvents: PlatformEvent[], effects: GameEffect[]): void {
  const playerId = state.currentBidderId!;
  cancelCurrentTimer(state, effects);
  state.bids = [...state.bids, { playerId, score }];
  publicEvents.push({ type: 'bid', playerId, score });
  if (score === 3 || state.bids.length === state.players.length) decideLandlord(state, ctx, publicEvents, effects);
  else {
    state.currentBidderId = next(state, playerId);
    scheduleBidTimer(state, ctx, effects);
  }
}

function applyPass(state: PlatformState, ctx: GameContext, publicEvents: PlatformEvent[], effects: GameEffect[]): void {
  const playerId = state.currentPlayerId!;
  cancelCurrentTimer(state, effects);
  state.passCount += 1;
  publicEvents.push({ type: 'passed', playerId });
  if (state.passCount >= 2) {
    state.currentPlayerId = state.currentTrick!.playerId;
    state.currentTrick = null;
    state.passCount = 0;
  } else {
    state.currentPlayerId = next(state, playerId);
  }
  schedulePlayTimer(state, ctx, effects);
}

function applyPlay(
  state: PlatformState,
  ctx: GameContext,
  playerId: string,
  cardIds: readonly string[],
  combo: LandlordCombo,
  publicEvents: PlatformEvent[],
  effects: GameEffect[],
): void {
  cancelCurrentTimer(state, effects);
  state.hands[playerId] = state.hands[playerId]!.filter((card) => !cardIds.includes(card.id));
  state.currentTrick = { playerId, combo };
  state.passCount = 0;
  publicEvents.push({ type: 'combo_played', playerId, combo });
  if (state.hands[playerId]!.length === 0) {
    const winnerTeam = playerId === state.landlordId ? 'landlord' : 'farmers';
    state.phase = 'game_over';
    state.winnerTeam = winnerTeam;
    state.winnerId = playerId;
    state.currentPlayerId = null;
    state.currentBidderId = null;
    state.currentTrick = null;
    state.deadlineAt = null;
    state.phaseToken = null;
    publicEvents.push({ type: 'game_finished', winnerTeam, winnerId: playerId });
    effects.push({ type: 'system_message', text: winnerTeam === 'landlord' ? '地主获胜！' : '农民获胜！' });
  } else {
    state.currentPlayerId = next(state, playerId);
    schedulePlayTimer(state, ctx, effects);
  }
}

function finishWithWinner(state: PlatformState, winnerTeam: 'landlord' | 'farmers', winnerId: string, publicEvents: PlatformEvent[], effects: GameEffect[]): void {
  state.phase = 'game_over';
  state.winnerTeam = winnerTeam;
  state.winnerId = winnerId;
  state.currentBidderId = null;
  state.currentPlayerId = null;
  state.currentTrick = null;
  state.passCount = 0;
  state.deadlineAt = null;
  state.phaseToken = null;
  publicEvents.push({ type: 'game_finished', winnerTeam, winnerId });
  effects.push({ type: 'system_message', text: `${winnerTeam === 'landlord' ? '地主' : '农民'}获胜（对手退出）` });
}

function abortGame(state: PlatformState, text: string, publicEvents: PlatformEvent[], effects: GameEffect[]): void {
  state.phase = 'game_over';
  state.winnerTeam = null;
  state.winnerId = null;
  state.currentBidderId = null;
  state.currentPlayerId = null;
  state.currentTrick = null;
  state.passCount = 0;
  state.deadlineAt = null;
  state.phaseToken = null;
  state.aborted = true;
  publicEvents.push({ type: 'game_aborted', reason: 'player_forfeited' });
  effects.push({ type: 'system_message', text });
}

function settleForfeit(state: PlatformState, forfeited: ReadonlySet<string>, publicEvents: PlatformEvent[], effects: GameEffect[]): void {
  cancelCurrentTimer(state, effects);
  if (!state.landlordId) {
    abortGame(state, '有玩家退出，叫地主阶段无法继续，本局中止', publicEvents, effects);
    return;
  }
  const landlordId = state.landlordId;
  const landlordForfeited = forfeited.has(landlordId);
  const remainingFarmers = state.players.filter((id) => id !== landlordId && !forfeited.has(id));
  if (landlordForfeited && remainingFarmers.length > 0) {
    finishWithWinner(state, 'farmers', remainingFarmers[0]!, publicEvents, effects);
  } else if (!landlordForfeited && forfeited.size > 0) {
    finishWithWinner(state, 'landlord', landlordId, publicEvents, effects);
  } else {
    abortGame(state, '所有玩家均已退出，本局中止', publicEvents, effects);
  }
}

/** 阶段超时确定性兜底：叫分超时记为不叫；出牌超时能过则过，领出必出则自动出最小单张。 */
function applyTimeoutFallback(state: PlatformState, ctx: GameContext, publicEvents: PlatformEvent[], effects: GameEffect[]): void {
  if (state.phase === 'bidding') {
    applyBid(state, ctx, 0, publicEvents, effects);
    return;
  }
  if (state.currentTrick) {
    applyPass(state, ctx, publicEvents, effects);
    return;
  }
  const hand = state.hands[state.currentPlayerId!] ?? [];
  const card = hand[0]!;
  applyPlay(state, ctx, state.currentPlayerId!, [card.id], identifyCombo([card])!, publicEvents, effects);
}

export function createPlatformInitialState(ctx: GameContext, players: string[], _config: unknown): PlatformState {
  if (players.length !== 3) throw new Error('斗地主固定 3 人');
  if (new Set(players).size !== players.length) throw new Error('玩家列表存在重复');
  const deck = ctx.random.shuffle(buildLandlordDeck());
  const hands: Record<string, LandlordCard[]> = Object.fromEntries(players.map((id) => [id, []]));
  for (let i = 0; i < 17; i += 1) {
    for (const id of players) hands[id]!.push(deck.shift()!);
  }
  for (const id of players) hands[id] = sortCards(hands[id]!);
  return {
    schemaVersion: 1,
    phase: 'bidding',
    players: [...players],
    hands,
    bottomCards: sortCards(deck),
    bids: [],
    currentBidderId: players[0]!,
    landlordId: null,
    currentPlayerId: null,
    currentTrick: null,
    passCount: 0,
    multiplier: 1,
    winnerTeam: null,
    winnerId: null,
    deadlineAt: null,
    phaseToken: null,
    aborted: false,
  };
}

export function reducePlatform(ctx: GameContext, state: PlatformState, actor: Actor, action: PlatformAction): PlatformReduceResult {
  if (state.phase === 'game_over') return actor.kind === 'system' ? noop(state) : deny('本局已经结束');
  const playerAction = PLAYER_ACTIONS.has(action.type);
  if (playerAction && actor.kind !== 'player') return deny('该动作只允许玩家发起');
  if (!playerAction && actor.kind !== 'system') return deny('该动作只允许系统发起');

  const s = structuredClone(state);
  const publicEvents: PlatformEvent[] = [];
  const effects: GameEffect[] = [];
  const done = (): PlatformReduceResult => okResult(s, publicEvents, effects);

  if (action.type === 'begin') {
    if (state.phase !== 'bidding' || state.phaseToken !== null) return noop(state);
    scheduleBidTimer(s, ctx, effects);
    return done();
  }

  if (action.type === 'phase_timeout') {
    // 陈旧计时器（phase/token 失配）一律吞掉：不得炸掉对局，也不得推进状态
    if (state.phase !== action.phase || state.phaseToken !== action.token) return noop(state);
    applyTimeoutFallback(s, ctx, publicEvents, effects);
    return done();
  }

  if (action.type === 'player_forfeited') {
    const forfeited = new Set(action.playerIds.filter((id) => s.players.includes(id)));
    if (forfeited.size === 0) return noop(state);
    settleForfeit(s, forfeited, publicEvents, effects);
    return done();
  }

  const playerId = (actor as { playerId: string }).playerId;
  if (!state.players.includes(playerId)) return deny('只有参局玩家可以操作');

  if (state.phase === 'bidding') {
    if (action.type !== 'bid_score') return deny('当前是叫地主阶段');
    if (playerId !== state.currentBidderId) return deny('还没轮到你叫分');
    applyBid(s, ctx, action.score, publicEvents, effects);
    return done();
  }

  if (playerId !== state.currentPlayerId) return deny('还没轮到你');
  if (action.type === 'pass_turn') {
    if (!state.currentTrick) return deny('当前不能不出');
    applyPass(s, ctx, publicEvents, effects);
    return done();
  }
  if (action.type !== 'play_combo') return deny('当前只能出牌或不出');
  const hand = s.hands[playerId] ?? [];
  const chosen = action.cardIds.map((id) => hand.find((card) => card.id === id));
  if (chosen.some((card) => !card) || new Set(action.cardIds).size !== action.cardIds.length) return deny('选择的手牌无效');
  const combo = identifyCombo(chosen as LandlordCard[]);
  if (!combo) return deny('牌型不合法');
  if (!canBeat(combo, s.currentTrick?.combo ?? null)) return deny('这手牌压不过当前牌');
  applyPlay(s, ctx, playerId, action.cardIds, combo, publicEvents, effects);
  return done();
}

// —— 视角 ——

function basePublicView(state: PlatformState): PlatformPublicView {
  return {
    gameId: 'landlord',
    rulesetId: 'landlord_platform_v1',
    schemaVersion: 1,
    phase: state.phase,
    players: state.players.map((playerId) => ({ playerId, handCount: state.hands[playerId]?.length ?? 0 })),
    bottomCards: state.landlordId ? state.bottomCards.map((c) => ({ ...c })) : [],
    bids: state.bids.map((b) => ({ playerId: b.playerId, score: b.score })),
    currentBidderId: state.currentBidderId,
    landlordId: state.landlordId,
    currentPlayerId: state.currentPlayerId,
    currentTrick: state.currentTrick
      ? { playerId: state.currentTrick.playerId, combo: { ...state.currentTrick.combo, cards: [...state.currentTrick.combo.cards] } }
      : null,
    passCount: state.passCount,
    multiplier: state.multiplier,
    winnerTeam: state.winnerTeam,
    winnerId: state.winnerId,
    deadlineAt: state.deadlineAt,
    aborted: state.aborted,
    ...(state.phase === 'game_over'
      ? {
          revealedHands: Object.fromEntries(
            state.players.map((id) => [id, (state.hands[id] ?? []).map((c) => ({ ...c }))]),
          ),
        }
      : {}),
  };
}

export function buildPlatformPublicView(state: PlatformState): PlatformPublicView {
  return basePublicView(state);
}

export function buildPlatformPlayerView(state: PlatformState, playerId: string): PlatformPlayerView {
  const base = basePublicView(state);
  if (!state.players.includes(playerId)) return { ...base, me: null };
  return {
    ...base,
    me: { playerId, hand: (state.hands[playerId] ?? []).map((c) => ({ ...c })) },
  };
}

// —— 结果与不变量 ——

export function buildPlatformResult(state: PlatformState): PlatformResult | null {
  if (state.winnerTeam && state.winnerId) return { winnerTeam: state.winnerTeam, winnerId: state.winnerId };
  if (state.phase === 'game_over') return { winnerTeam: null, winnerId: null, aborted: true };
  return null;
}

function assertCardUniqueness(state: PlatformState): void {
  const counts = new Map<string, number>();
  for (const id of state.players) {
    for (const card of state.hands[id] ?? []) counts.set(card.id, (counts.get(card.id) ?? 0) + 1);
  }
  for (const card of state.bottomCards) counts.set(card.id, (counts.get(card.id) ?? 0) + 1);
  for (const [cardId, count] of counts) {
    if (count > 2) throw new Error(`牌 ${cardId} 出现 ${count} 次`);
    if (count === 2) {
      const inHand = state.players.some((id) => state.hands[id]!.some((c) => c.id === cardId));
      const inBottom = state.bottomCards.some((c) => c.id === cardId);
      if (!inHand || !inBottom) throw new Error(`牌 ${cardId} 重复但不在「地主手牌 + 底牌」组合`);
    }
  }
}

export function assertPlatformInvariants(state: PlatformState): void {
  platformStateSchema.parse(state);
  if (new Set(state.players).size !== state.players.length) throw new Error('玩家列表存在重复');
  if (state.bottomCards.length !== 3) throw new Error('底牌必须恰好 3 张');
  assertCardUniqueness(state);

  const handTotal = state.players.reduce((sum, id) => sum + (state.hands[id]?.length ?? 0), 0);
  if (state.phase === 'bidding' && handTotal !== 51) throw new Error(`叫分阶段手牌总数应为 51，实际 ${handTotal}`);
  for (const id of state.players) {
    if (state.hands[id] === undefined) throw new Error(`玩家 ${id} 缺少手牌`);
    if (state.hands[id]!.length > 20) throw new Error(`玩家 ${id} 手牌数非法`);
  }
  if (state.landlordId !== null) {
    if (!state.players.includes(state.landlordId)) throw new Error('地主不在参局玩家中');
    if (state.currentBidderId !== null) throw new Error('地主已定不应有当前叫分者');
  }
  if (state.phase === 'bidding') {
    if (state.currentBidderId === null || !state.players.includes(state.currentBidderId)) throw new Error('叫分阶段必须有当前叫分者');
    if (state.currentPlayerId !== null) throw new Error('叫分阶段不应有出牌指针');
  }
  if (state.phase === 'playing') {
    if (state.landlordId === null) throw new Error('出牌阶段必须已有地主');
    if (state.currentPlayerId === null || !state.players.includes(state.currentPlayerId)) throw new Error('出牌阶段必须有当前出牌者');
    if (state.currentTrick && state.currentTrick.playerId === state.currentPlayerId) throw new Error('领出时不应残留上一手牌型');
  }
  if (state.phase === 'game_over') {
    if ((state.winnerTeam === null || state.winnerId === null) && !state.aborted) throw new Error('终局必须有赢家或中止标记');
  } else {
    if (state.winnerTeam !== null || state.winnerId !== null) throw new Error('非终局不得有赢家');
    if (state.aborted) throw new Error('非终局不得标记中止');
  }
  // 计时器一致性：出牌阶段必带；叫分进行中（已有人叫分）必带；终局清空
  if (state.phase === 'game_over') {
    if (state.phaseToken !== null || state.deadlineAt !== null) throw new Error('终局不得残留计时器');
  } else if (state.phase === 'playing') {
    if (state.phaseToken === null || state.deadlineAt === null) throw new Error('出牌阶段必须有计时器');
  } else if (state.bids.length > 0 && (state.phaseToken === null || state.deadlineAt === null)) {
    throw new Error('叫分进行中必须有计时器');
  }
}

export function parsePlatformAction(input: unknown): PlatformAction {
  return platformActionSchema.parse(input);
}
export function parsePlatformState(input: unknown): PlatformState {
  return platformStateSchema.parse(input);
}
