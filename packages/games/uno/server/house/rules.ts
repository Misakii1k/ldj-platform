/**
 * uno_platform_house_v1 — 纯规则引擎。
 *
 * 全部转换基于不可变克隆；拒绝路径不消耗 RNG、不改变 state/events/effects。
 * 计时器只以 effect 描述，截止时间来自 ctx.now；系统动作（*_timeout）只接受 system actor。
 * 正式 resultCandidate 只在整场（match）结束时产生一次。
 */
import {
  nextTurnParticipant,
  type Actor,
  type GameContext,
  type GameEffect,
} from '@ldj/shared';
import {
  cardColor,
  cardScore,
  createHouseZones,
  dealInitialHands,
  drawWithExpansion,
  isLegalPlay,
  isPenaltyCard,
  isWild,
  buildUnoHouseDeck,
} from './deck.ts';
import {
  type UnoHouseAction,
  type UnoHouseColor,
  type UnoHouseConfig,
  type UnoHouseDirection,
  type UnoHouseEvent,
  type UnoHouseMatchRankingEntry,
  type UnoHousePendingPenalty,
  type UnoHousePlayerView,
  type UnoHousePublicView,
  type UnoHouseResult,
  type UnoHouseRoundResult,
  type UnoHouseRoundState,
  type UnoHouseState,
  type UnoHouseCard,
  challengeTimerId,
  penaltyTimerId,
  raceTimerId,
  turnTimerId,
} from './types.ts';

const TURN_TIMEOUT_MS = 15_000;
const WINDOW_TIMEOUT_MS = 5_000;
const COLORS = ['red', 'yellow', 'green', 'blue'] as const;

type Result =
  | { ok: false; code: string; message: string }
  | {
      ok: true;
      nextState: UnoHouseState;
      publicEvents: readonly UnoHouseEvent[];
      privateEvents: readonly { recipients: readonly string[]; event: unknown }[];
      effects: readonly GameEffect[];
      resultCandidate: UnoHouseResult | null;
    };

function deny(message: string): Result {
  return { ok: false, code: 'ACTION_NOT_ALLOWED', message };
}

function actorPlayer(actor: Actor): string | null {
  return actor.kind === 'player' ? actor.playerId : null;
}

/** 可变的深拷贝草稿：出牌/叠牌等段落在此修改后以 setRound 提交。 */
type RoundDraft = {
  -readonly [K in keyof UnoHouseRoundState]: UnoHouseRoundState[K] extends readonly (infer T)[]
    ? T[]
    : UnoHouseRoundState[K] extends Readonly<Record<string, infer V>>
      ? Record<string, V>
      : UnoHouseRoundState[K];
};

function cloneRoundDraft(state: UnoHouseState): RoundDraft {
  const r = state.round;
  return {
    ...r,
    players: [...r.players],
    hands: Object.fromEntries(Object.entries(r.hands).map(([id, hand]) => [id, [...hand]])),
    deck: [...r.deck],
    discardPile: [...r.discardPile],
    preCallPlayerIds: { ...r.preCallPlayerIds },
    pendingPenalty: r.pendingPenalty ? { ...r.pendingPenalty, challengeEvidence: r.pendingPenalty.challengeEvidence ? { ...r.pendingPenalty.challengeEvidence } : null } : null,
    unoRaceWindow: r.unoRaceWindow ? { ...r.unoRaceWindow } : null,
  };
}

function setRound(state: UnoHouseState, draft: RoundDraft): UnoHouseState {
  return { ...state, round: draft as unknown as UnoHouseRoundState };
}

function nextPlayer(state: UnoHouseState, fromId: string, steps = 1): string {
  return nextTurnParticipant(state.round.players, fromId, {
    direction: state.round.direction,
    steps,
  });
}

function startTurn(
  ctx: GameContext,
  state: UnoHouseState,
  playerId: string,
  effects: GameEffect[],
): UnoHouseState {
  const turnIndex = state.round.turnIndex + 1;
  const turnToken = `t${state.round.roundNumber}-${turnIndex}`;
  const deadlineAt = ctx.now + TURN_TIMEOUT_MS;
  effects.push({
    type: 'schedule_timer',
    timerId: turnTimerId(state.round.roundNumber, turnToken),
    deadlineAt,
    action: { type: 'turn_timeout', round: state.round.roundNumber, turnToken },
  });
  return {
    ...state,
    round: {
      ...state.round,
      currentPlayerId: playerId,
      hasDrawnThisTurn: false,
      turnToken,
      turnIndex,
      sequence: state.round.sequence + 1,
      turnDeadlineAt: deadlineAt,
      windowDeadlineAt: null,
    },
  };
}

function cancelTurnTimer(state: UnoHouseState, effects: GameEffect[]): void {
  effects.push({
    type: 'cancel_timer',
    timerId: turnTimerId(state.round.roundNumber, state.round.turnToken),
  });
}

function cancelWindowTimer(
  state: UnoHouseState,
  effects: GameEffect[],
): void {
  const r = state.round;
  if (r.pendingPenalty) {
    effects.push({
      type: 'cancel_timer',
      timerId: penaltyTimerId(r.roundNumber, r.pendingPenalty.windowToken),
    });
  }
  if (r.unoRaceWindow) {
    effects.push({
      type: 'cancel_timer',
      timerId: raceTimerId(r.roundNumber, r.unoRaceWindow.windowToken),
    });
  }
  if (r.pendingPenalty?.challengeable) {
    effects.push({
      type: 'cancel_timer',
      timerId: challengeTimerId(r.roundNumber, r.pendingPenalty.windowToken),
    });
  }
}

function openPenaltyWindow(
  ctx: GameContext,
  state: UnoHouseState,
  responderId: string,
  sourcePlayerId: string,
  total: number,
  kind: 'draw2' | 'draw4',
  challengeable: boolean,
  challengeEvidence: { heldMatchingBeforePlay: boolean; colorBeforePlay: UnoHouseColor } | null,
  effects: GameEffect[],
): UnoHouseState {
  const windowToken = `w${state.round.sequence + 1}`;
  const deadlineAt = ctx.now + WINDOW_TIMEOUT_MS;
  const pending: UnoHousePendingPenalty = {
    total,
    kind,
    responderId,
    sourcePlayerId,
    challengeable,
    challengeEvidence,
    windowToken,
  };
  effects.push({
    type: 'schedule_timer',
    timerId: penaltyTimerId(state.round.roundNumber, windowToken),
    deadlineAt,
    action: { type: 'penalty_timeout', round: state.round.roundNumber, windowToken },
  });
  if (challengeable) {
    effects.push({
      type: 'schedule_timer',
      timerId: challengeTimerId(state.round.roundNumber, windowToken),
      deadlineAt,
      action: { type: 'challenge_timeout', round: state.round.roundNumber, windowToken },
    });
  }
  return {
    ...state,
    round: {
      ...state.round,
      pendingPenalty: pending,
      currentPlayerId: responderId,
      hasDrawnThisTurn: false,
      sequence: state.round.sequence + 1,
      turnDeadlineAt: null,
      windowDeadlineAt: deadlineAt,
    },
  };
}

/** 结算：计算每人剩余手牌分与胜负；返回下一状态（下一回合或 match_over）。 */
function settleRound(
  ctx: GameContext,
  state: UnoHouseState,
  finisherId: string,
  effects: GameEffect[],
): { next: UnoHouseState; roundResult: UnoHouseRoundResult } {
  const r = state.round;
  const players = r.players;
  const perPlayerTotals = players.map((id) =>
    (r.hands[id] ?? []).reduce((sum, card) => sum + cardScore(card), 0),
  );
  const match = state.match;
  const teamMode = match.mode === 'team';
  const teamOf = match.teamPlayerIds ?? {};
  const teamIds = teamMode
    ? [...new Set(players.map((id) => teamOf[id]!))]
    : null;
  let teamTotals: number[] | null = null;
  let winnerPlayerIds: string[] = [];
  let teamWinnerIds: string[] | null = null;
  if (teamMode && teamIds) {
    teamTotals = teamIds.map((teamId) =>
      players.reduce((sum, id, index) => (teamOf[id] === teamId ? sum + perPlayerTotals[index]! : sum), 0),
    );
    const low = Math.min(...teamTotals);
    teamWinnerIds = teamIds.filter((_, index) => teamTotals![index] === low);
  } else {
    const low = Math.min(...perPlayerTotals);
    winnerPlayerIds = players.filter((_, index) => perPlayerTotals[index] === low);
  }
  const roundResult: UnoHouseRoundResult = {
    roundNumber: r.roundNumber,
    finisherPlayerId: finisherId,
    perPlayerTotals,
    teamTotals,
    winnerPlayerIds,
    teamWinnerIds,
  };

  const roundScores = [...match.roundScores, perPlayerTotals];
  const roundResults = [...match.roundResults, roundResult];
  const cumulativeScores = players.map((_, index) =>
    roundScores.reduce((sum, row) => sum + (row[index] ?? 0), 0),
  );
  const isLastRound = match.currentRound >= match.roundLimit;

  if (isLastRound) {
    const ranking = teamMode && teamIds && teamTotals
      ? rankTeams(teamIds, teamTotals, players, teamOf)
      : rankIndividuals(players, cumulativeScores);
    return {
      next: {
        ...state,
        match: {
          ...match,
          roundScores,
          roundResults,
          cumulativeScores,
          matchRanking: ranking,
          currentRound: match.roundLimit,
        },
        round: {
          ...r,
          phase: 'match_over',
          turnDeadlineAt: null,
          windowDeadlineAt: null,
        },
      },
      roundResult,
    };
  }

  // 下一回合：新一副 108 张、重置 generation、上一回合出完者先手。
  const nextRoundNumber = r.roundNumber + 1;
  const next = createRound(
    ctx,
    players,
    { ...match, mode: match.mode, roundCount: match.roundCount },
    nextRoundNumber,
    finisherId,
    roundScores,
    cumulativeScores,
    effects,
    roundResults,
  );
  return { next, roundResult };
}

/** 生成下一回合（或按传入结算推进）；与 createInitialRound 共用核心。 */
function createRound(
  ctx: GameContext,
  players: readonly string[],
  config: UnoHouseConfig,
  roundNumber: number,
  starterOverride: string | null,
  priorRoundScores: readonly (readonly number[])[],
  priorCumulative: readonly number[],
  effects: GameEffect[],
  priorRoundResults: readonly UnoHouseRoundResult[] = [],
): UnoHouseState {
  const deck = ctx.random.shuffle(buildUnoHouseDeck(roundNumber, 0));
  const emptyHands: Record<string, readonly UnoHouseCard[]> = Object.fromEntries(players.map((id) => [id, []]));
  const baseRound: UnoHouseRoundState = {
    roundNumber,
    phase: 'round_playing',
    players: [...players],
    hands: emptyHands,
    deck: [],
    discardPile: [],
    topDiscard: deck[0]!,
    currentColor: 'red',
    direction: 1,
    currentPlayerId: players[0]!,
    hasDrawnThisTurn: false,
    pendingPenalty: null,
    unoRaceWindow: null,
    preCallPlayerIds: {},
    deckGenerationCount: 1,
    turnToken: 'r0',
    turnIndex: 0,
    sequence: 0,
    turnDeadlineAt: null,
    windowDeadlineAt: null,
  };
  let zones = createHouseZones({ ...baseRound, deck, discardPile: [] });
  zones = dealInitialHands(zones, players);
  const deckAfterDeal = zones.zones['deck'] as readonly UnoHouseCard[];
  const opening = deckAfterDeal[0]!;
  const initialColor = isWild(opening)
    ? COLORS[ctx.random.nextInt(0, COLORS.length)]!
    : (cardColor(opening) ?? 'red');
  // 开局首张弃牌不触发功能效果：从牌堆顶移一张到弃牌区。
  zones = {
    zones: {
      ...zones.zones,
      deck: deckAfterDeal.slice(1),
      discardPile: [opening],
    },
  };
  const starter = starterOverride ?? players[ctx.random.nextInt(0, players.length)]!;
  const round: UnoHouseRoundState = {
    ...baseRound,
    hands: Object.fromEntries(players.map((id) => [id, [...(zones.zones[`hand:${id}`] as readonly UnoHouseCard[])]])) as Record<string, readonly UnoHouseCard[]>,
    deck: [...(zones.zones['deck'] as readonly UnoHouseCard[])],
    discardPile: [...(zones.zones['discardPile'] as readonly UnoHouseCard[])],
    topDiscard: opening,
    currentColor: initialColor,
    currentPlayerId: starter,
  };
  let state: UnoHouseState = {
    match: {
      mode: config.mode,
      roundCount: config.roundCount,
      currentRound: roundNumber,
      roundLimit: config.roundCount,
      teamPlayerIds: config.mode === 'team'
        ? Object.fromEntries(players.map((id, index) => [id, index % 2 === 0 ? 'team-a' : 'team-b']))
        : null,
      roundScores: [...priorRoundScores],
      roundResults: [...priorRoundResults],
      cumulativeScores: priorCumulative.length === players.length
        ? [...priorCumulative]
        : players.map((_, index) => priorRoundScores.reduce((sum, row) => sum + (row[index] ?? 0), 0)),
      matchRanking: null,
      starterPlayerId: starter,
      lastFinisherPlayerId: priorRoundResults.at(-1)?.finisherPlayerId ?? null,
    },
    round,
  };
  state = startTurn(ctx, state, starter, effects);
  return state;
}

function rankIndividuals(
  players: readonly string[],
  cumulativeScores: readonly number[],
): UnoHouseMatchRankingEntry[] {
  const indexed = players.map((playerId, index) => ({ playerId, total: cumulativeScores[index]! }));
  const sorted = [...indexed].sort((a, b) => a.total - b.total || a.playerId.localeCompare(b.playerId));
  let rank = 1;
  return sorted.map((entry, index) => {
    if (index > 0 && entry.total !== sorted[index - 1]!.total) {
      rank = index + 1;
    }
    return { playerId: entry.playerId, total: entry.total, rank };
  });
}

function rankTeams(
  teamIds: readonly string[],
  teamTotals: readonly number[],
  players: readonly string[],
  teamOf: Readonly<Record<string, string>>,
): UnoHouseMatchRankingEntry[] {
  const indexed = teamIds.map((teamId, index) => ({ teamId, total: teamTotals[index]! }));
  const sorted = [...indexed].sort((a, b) => a.total - b.total || a.teamId.localeCompare(b.teamId));
  let rank = 1;
  const byTeam = new Map<string, { total: number; rank: number }>();
  sorted.forEach((entry, index) => {
    if (index > 0 && entry.total !== sorted[index - 1]!.total) rank = index + 1;
    byTeam.set(entry.teamId, { total: entry.total, rank });
  });
  return players
    .map((playerId) => {
      const teamId = teamOf[playerId]!;
      const info = byTeam.get(teamId)!;
      return { playerId, total: info.total, rank: info.rank };
    })
    .sort((a, b) => a.rank - b.rank || a.playerId.localeCompare(b.playerId));
}

function legalPlayableIds(state: UnoHouseState, playerId: string): string[] {
  const r = state.round;
  const hand = r.hands[playerId] ?? [];
  if (r.pendingPenalty) {
    // 罚牌窗口只允许叠加合法罚牌（规则链约束在 stackPenalty 内校验）。
    return hand.filter((card) => isPenaltyCard(card) !== null).map((card) => card.id);
  }
  return hand
    .filter((card) => isLegalPlay(card, r.topDiscard, r.currentColor))
    .map((card) => card.id);
}

function conservativePick(state: UnoHouseState, playerId: string): UnoHouseCard | null {
  const hand = state.round.hands[playerId] ?? [];
  const legal = hand.filter((card) => isLegalPlay(card, state.round.topDiscard, state.round.currentColor));
  if (legal.length === 0) return null;
  const byColor = legal.filter((card) => cardColor(card) === state.round.currentColor);
  const numbers = (byColor.length > 0 ? byColor : legal).filter((card) => card.kind === 'number');
  const plain = (numbers.length > 0 ? numbers : legal).filter((card) => !isWild(card));
  const pool = plain.length > 0 ? plain : legal;
  return [...pool].sort((a, b) => a.id.localeCompare(b.id))[0]!;
}

function mostCommonColor(hand: readonly UnoHouseCard[]): UnoHouseColor {
  const tally = new Map<string, number>();
  for (const card of hand) {
    const color = cardColor(card);
    if (color) tally.set(color, (tally.get(color) ?? 0) + 1);
  }
  if (tally.size === 0) return COLORS[0]!;
  return [...tally.entries()].sort((a, b) => b[1] - a[1])[0]![0] as UnoHouseColor;
}

function playCardCore(
  ctx: GameContext,
  state: UnoHouseState,
  playerId: string,
  cardId: string,
  declaredColor: UnoHouseColor | undefined,
  preCallUno: boolean | undefined,
): Result {
  const r = state.round;
  if (r.phase !== 'round_playing') return deny('本回合已结束');
  if (playerId !== r.currentPlayerId) return deny('还没轮到你');
  if (r.pendingPenalty) return deny('需要先处理罚牌');
  const hand = r.hands[playerId] ?? [];
  const card = hand.find((c) => c.id === cardId);
  if (!card) return deny('手牌中没有这张牌');
  if (!isLegalPlay(card, r.topDiscard, r.currentColor)) return deny('这张牌现在不能出');
  if (isWild(card) && !declaredColor) return deny('万能牌需要指定颜色');
  if (preCallUno && hand.length !== 2) return deny('只有恰好两张牌时才能提前喊 UNO');

  const events: UnoHouseEvent[] = [];
  const effects: GameEffect[] = [];
  cancelTurnTimer(state, effects);
  cancelWindowTimer(state, effects);

  const next = cloneRoundDraft(state);
  const nextHand = hand.filter((c) => c.id !== cardId);
  next.hands[playerId] = nextHand;
  next.discardPile = [...next.discardPile, card];
  next.topDiscard = card;
  if (isWild(card)) {
    next.currentColor = declaredColor!;
  } else {
    next.currentColor = cardColor(card)!;
  }
  next.hasDrawnThisTurn = false;
  next.unoRaceWindow = null;
  next.sequence += 1;
  if (preCallUno) {
    next.preCallPlayerIds = { ...next.preCallPlayerIds, [playerId]: true };
  }
  events.push({ type: 'card_played', playerId, card });
  const draftState: UnoHouseState = setRound(state, next);

  const finishing = nextHand.length === 0;
  if (finishing) {
    // 终局：出完手牌，结算（末张 +2/+4 由结算前补抽处理）。
    let settleState: UnoHouseState = draftState;
    if (isPenaltyCard(card) === 'draw2') {
      const drawn = drawForPlayer(ctx, settleState, nextPlayer(settleState, playerId), 2, effects);
      settleState = drawn;
    } else if (isPenaltyCard(card) === 'wild4') {
      const drawn = drawForPlayer(ctx, settleState, nextPlayer(settleState, playerId), 4, effects);
      settleState = drawn;
    }
    events.push({ type: 'phase_changed', phase: 'round_over', round: r.roundNumber });
    const { next: settled } = settleRound(ctx, settleState, playerId, effects);
    return {
      ok: true,
      nextState: settled,
      publicEvents: events,
      privateEvents: [],
      effects,
      resultCandidate: settled.match.matchRanking && settled.match.currentRound >= settled.match.roundLimit
        ? buildResult(settled)
        : null,
    };
  }

  // 只剩一张且未预喊 → 开启 5s 竞速窗口。
  if (nextHand.length === 1 && !next.preCallPlayerIds[playerId]) {
    const windowToken = `race${next.sequence}`;
    const deadlineAt = ctx.now + WINDOW_TIMEOUT_MS;
    next.unoRaceWindow = {
      targetPlayerId: playerId,
      windowToken,
      openedAtSequence: next.sequence,
      closesEarlyOnNextEffective: true,
    };
    next.windowDeadlineAt = deadlineAt;
    effects.push({
      type: 'schedule_timer',
      timerId: raceTimerId(r.roundNumber, windowToken),
      deadlineAt,
      action: { type: 'uno_race_timeout', round: r.roundNumber, windowToken },
    });
  }

  // 行动牌效果。
  let nextState: UnoHouseState = draftState;
  const penalty = isPenaltyCard(card);
  if (penalty === 'draw2') {
    const responder = nextPlayer(nextState, playerId);
    nextState = openPenaltyWindow(ctx, nextState, responder, playerId, 2, 'draw2', false, null, effects);
  } else if (penalty === 'wild4') {
    const responder = nextPlayer(draftState, playerId);
    const evidence = {
      heldMatchingBeforePlay: legalPlayableIds(draftState, responder).length > 0,
      colorBeforePlay: r.currentColor,
    };
    nextState = openPenaltyWindow(ctx, draftState, responder, playerId, 4, 'draw4', true, evidence, effects);
  } else if (card.kind === 'reverse') {
    nextState = { ...nextState, round: { ...nextState.round, direction: (nextState.round.direction === 1 ? -1 : 1) as UnoHouseDirection } };
    const steps = nextState.round.players.length === 2 ? 2 : 1;
    nextState = startTurn(ctx, { ...nextState, round: { ...nextState.round, currentPlayerId: nextPlayer(nextState, playerId, steps) } }, nextPlayer(nextState, playerId, steps), effects);
  } else if (card.kind === 'skip') {
    nextState = startTurn(ctx, nextState, nextPlayer(nextState, playerId, 2), effects);
  } else {
    nextState = startTurn(ctx, nextState, nextPlayer(nextState, playerId), effects);
  }

  return {
    ok: true,
    nextState,
    publicEvents: events,
    privateEvents: [],
    effects,
    resultCandidate: null,
  };
}

function drawForPlayer(
  ctx: GameContext,
  state: UnoHouseState,
  playerId: string,
  count: number,
  _effects: GameEffect[],
): UnoHouseState {
  const r = state.round;
  const zones = createHouseZones(r);
  const result = drawWithExpansion(zones, playerId, count, ctx.random, r.roundNumber);
  const drawn = result.drawn;
  const nextHand = [...(r.hands[playerId] ?? []), ...drawn];
  // 手牌回升到 2 张以上即脱离 UNO 状态：必须清除旧的预喊标记，
  // 否则该玩家本回合内再次打到 1 张时永远不会开启竞速窗口（永久免罚）。
  const preCallPlayerIds = nextHand.length > 1 && r.preCallPlayerIds[playerId]
    ? { ...r.preCallPlayerIds, [playerId]: false }
    : r.preCallPlayerIds;
  return {
    ...state,
    round: {
      ...r,
      deck: [...(result.zones.zones['deck'] as readonly UnoHouseCard[])],
      discardPile: [...(result.zones.zones['discardPile'] as readonly UnoHouseCard[])],
      hands: { ...r.hands, [playerId]: nextHand },
      preCallPlayerIds,
      deckGenerationCount: r.deckGenerationCount + result.deckGenerationsUsed,
      sequence: r.sequence + 1,
    },
  };
}

function buildResult(state: UnoHouseState): UnoHouseResult | null {
  const match = state.match;
  if (!match.matchRanking) return null;
  return {
    mode: match.mode,
    winnerPlayerIds: match.matchRanking.filter((entry) => entry.rank === 1).map((entry) => entry.playerId),
    ...(match.mode === 'team' ? { teamWinnerIds: [...new Set(match.roundResults.at(-1)?.teamWinnerIds ?? [])] } : {}),
    rounds: match.roundResults,
    ranking: match.matchRanking,
  };
}

function handleStack(
  ctx: GameContext,
  state: UnoHouseState,
  playerId: string,
  cardId: string,
  declaredColor: UnoHouseColor | undefined,
): Result {
  const r = state.round;
  const pending = r.pendingPenalty;
  if (!pending) return deny('当前没有待处理的罚牌');
  if (pending.responderId !== playerId) return deny('不轮到你响应罚牌');
  const card = (r.hands[playerId] ?? []).find((c) => c.id === cardId);
  if (!card) return deny('手牌中没有这张牌');
  const penalty = isPenaltyCard(card);
  if (penalty === null) return deny('只能叠加罚牌');
  if (penalty === 'draw2' && pending.kind === 'draw4') return deny('+4 链上只能叠加 +4');
  if (isWild(card) && !declaredColor) return deny('万能牌需要指定颜色');

  const events: UnoHouseEvent[] = [];
  const effects: GameEffect[] = [];
  cancelWindowTimer(state, effects);
  cancelTurnTimer(state, effects);

  const next = cloneRoundDraft(state);
  next.hands[playerId] = (next.hands[playerId] ?? []).filter((c) => c.id !== cardId);
  next.discardPile = [...next.discardPile, card];
  next.topDiscard = card;
  next.currentColor = isWild(card) ? declaredColor! : cardColor(card)!;
  next.sequence += 1;

  const upgrade = penalty === 'wild4';
  const newKind: 'draw2' | 'draw4' = upgrade ? 'draw4' : pending.kind;
  const newTotal = pending.total + (penalty === 'draw2' ? 2 : 4);
  events.push({ type: 'penalty_stacked', playerId, card, total: newTotal });

  // 下一响应者。
  const draftState: UnoHouseState = setRound(state, next);
  const responder = nextPlayer(draftState, playerId);
  const nextState = openPenaltyWindow(
    ctx,
    draftState,
    responder,
    playerId,
    newTotal,
    newKind,
    false, // 任何叠加后都关闭质疑
    null,
    effects,
  );
  return { ok: true, nextState, publicEvents: events, privateEvents: [], effects, resultCandidate: null };
}

function handleAccept(
  ctx: GameContext,
  state: UnoHouseState,
  playerId: string,
  windowToken: string,
): Result {
  const r = state.round;
  const pending = r.pendingPenalty;
  if (!pending || pending.windowToken !== windowToken) return deny('罚牌窗口已关闭');
  if (pending.responderId !== playerId) return deny('不轮到你响应罚牌');
  const effects: GameEffect[] = [];
  cancelWindowTimer(state, effects);
  cancelTurnTimer(state, effects);
  const drawn = drawForPlayer(ctx, state, playerId, pending.total, effects);
  const nextState = startTurn(ctx, { ...drawn, round: { ...drawn.round, pendingPenalty: null } }, nextPlayer(drawn, playerId), effects);
  return {
    ok: true,
    nextState,
    publicEvents: [{ type: 'penalty_accepted', playerId, total: pending.total, windowToken }],
    privateEvents: [],
    effects,
    resultCandidate: null,
  };
}

function handleChallenge(
  ctx: GameContext,
  state: UnoHouseState,
  playerId: string,
  windowToken: string,
): Result {
  const r = state.round;
  const pending = r.pendingPenalty;
  if (!pending || pending.windowToken !== windowToken) return deny('挑战窗口已关闭');
  if (!pending.challengeable) return deny('当前罚牌不允许质疑');
  if (pending.responderId !== playerId) return deny('只有响应者可以质疑');
  const effects: GameEffect[] = [];
  cancelWindowTimer(state, effects);
  cancelTurnTimer(state, effects);

  const success = pending.challengeEvidence?.heldMatchingBeforePlay === false;
  const targetPlayerId = pending.responderId;
  let nextState: UnoHouseState;
  if (success) {
    // 质疑成功：出 +4 的源玩家摸 4，所选颜色作废（还原到 +4 出牌前颜色），质疑者正常行动。
    const beforeColor = pending.challengeEvidence!.colorBeforePlay;
    const sourcePlayerId = pending.sourcePlayerId;
    const cleared = { ...state, round: { ...state.round, pendingPenalty: null } };
    nextState = drawForPlayer(ctx, cleared, sourcePlayerId, 4, effects);
    nextState = {
      ...nextState,
      round: { ...nextState.round, currentColor: beforeColor },
    };
    nextState = startTurn(ctx, nextState, playerId, effects);
  } else {
    // 质疑失败：质疑者摸 6 并跳过。
    const cleared = { ...state, round: { ...state.round, pendingPenalty: null } };
    nextState = drawForPlayer(ctx, cleared, playerId, 6, effects);
    nextState = startTurn(ctx, { ...nextState, round: { ...nextState.round, pendingPenalty: null } }, nextPlayer(nextState, playerId, 2), effects);
  }
  return {
    ok: true,
    nextState,
    publicEvents: [{ type: 'challenge_resolved', challengerPlayerId: playerId, targetPlayerId, success, windowToken }],
    privateEvents: [],
    effects,
    resultCandidate: null,
  };
}

function handleTurnTimeout(ctx: GameContext, state: UnoHouseState, action: Extract<UnoHouseAction, { type: 'turn_timeout' }>): Result {
  const r = state.round;
  if (r.roundNumber !== action.round || r.turnToken !== action.turnToken) {
    return { ok: true, nextState: state, publicEvents: [], privateEvents: [], effects: [], resultCandidate: null };
  }
  if (r.pendingPenalty || r.unoRaceWindow) return { ok: true, nextState: state, publicEvents: [], privateEvents: [], effects: [], resultCandidate: null };
  const playerId = r.currentPlayerId;
  const pick = conservativePick(state, playerId);
  if (pick) {
    return playCardCore(ctx, state, playerId, pick.id, isWild(pick) ? mostCommonColor(r.hands[playerId] ?? []) : undefined, r.hands[playerId]!.length === 2);
  }
  // 无合法牌：摸一张，摸后不继续出。
  const effects: GameEffect[] = [];
  cancelTurnTimer(state, effects);
  const drawn = drawForPlayer(ctx, state, playerId, 1, effects);
  const nextState = startTurn(ctx, { ...drawn, round: { ...drawn.round, hasDrawnThisTurn: true } }, nextPlayer(drawn, playerId), effects);
  return {
    ok: true,
    nextState,
    publicEvents: [{ type: 'card_drawn', playerId, count: 1 }],
    privateEvents: [],
    effects,
    resultCandidate: null,
  };
}

function handlePenaltyTimeout(ctx: GameContext, state: UnoHouseState, action: Extract<UnoHouseAction, { type: 'penalty_timeout' }>): Result {
  const r = state.round;
  if (!r.pendingPenalty || r.pendingPenalty.windowToken !== action.windowToken || r.roundNumber !== action.round) {
    return { ok: true, nextState: state, publicEvents: [], privateEvents: [], effects: [], resultCandidate: null };
  }
  return handleAccept(ctx, state, r.pendingPenalty.responderId, action.windowToken);
}

function handleChallengeTimeout(ctx: GameContext, state: UnoHouseState, action: Extract<UnoHouseAction, { type: 'challenge_timeout' }>): Result {
  const r = state.round;
  if (!r.pendingPenalty || r.pendingPenalty.windowToken !== action.windowToken || r.roundNumber !== action.round) {
    return { ok: true, nextState: state, publicEvents: [], privateEvents: [], effects: [], resultCandidate: null };
  }
  // 质疑窗口超时：视为不质疑，按接受罚牌处理。
  return handleAccept(ctx, state, r.pendingPenalty.responderId, action.windowToken);
}

function handleRaceTimeout(ctx: GameContext, state: UnoHouseState, action: Extract<UnoHouseAction, { type: 'uno_race_timeout' }>): Result {
  const r = state.round;
  if (!r.unoRaceWindow || r.unoRaceWindow.windowToken !== action.windowToken || r.roundNumber !== action.round) {
    return { ok: true, nextState: state, publicEvents: [], privateEvents: [], effects: [], resultCandidate: null };
  }
  const next = { ...state, round: { ...r, unoRaceWindow: null, windowDeadlineAt: null } };
  return { ok: true, nextState: next, publicEvents: [], privateEvents: [], effects: [], resultCandidate: null };
}

function handleCallUno(state: UnoHouseState, playerId: string): Result {
  const r = state.round;
  const hand = r.hands[playerId] ?? [];
  if (hand.length !== 1) return deny('只剩 1 张牌时才能喊 UNO');
  if (r.unoRaceWindow) {
    if (r.unoRaceWindow.targetPlayerId !== playerId) return deny('补喊只限目标玩家');
    // 补喊成功即关闭窗口：同时撤掉已排程的窗口超时，避免留下野定时器。
    const effects: GameEffect[] = [];
    cancelWindowTimer(state, effects);
    const next = { ...state, round: { ...r, unoRaceWindow: null, windowDeadlineAt: null } };
    return { ok: true, nextState: next, publicEvents: [{ type: 'uno_called', playerId }], privateEvents: [], effects, resultCandidate: null };
  }
  // 无竞速窗口时允许普通补喊（不影响状态）。
  return { ok: true, nextState: state, publicEvents: [{ type: 'uno_called', playerId }], privateEvents: [], effects: [], resultCandidate: null };
}

function handleCatchMissed(state: UnoHouseState, actorId: string, targetPlayerId: string, windowToken: string, ctx: GameContext): Result {
  const r = state.round;
  if (!r.unoRaceWindow || r.unoRaceWindow.windowToken !== windowToken) return deny('竞速窗口已关闭');
  if (r.unoRaceWindow.targetPlayerId !== targetPlayerId) return deny('抓漏报目标不匹配');
  if (actorId === targetPlayerId) return deny('不能抓自己的漏报');
  const effects: GameEffect[] = [];
  cancelWindowTimer(state, effects);
  cancelTurnTimer(state, effects);
  const drawn = drawForPlayer(ctx, state, targetPlayerId, 2, effects);
  const cleared: UnoHouseState = { ...drawn, round: { ...drawn.round, unoRaceWindow: null, windowDeadlineAt: null } };
  // 抓捕是插入式动作，不改变轮到谁。上面取消了当前回合计时器，必须为同一玩家重建，
  // 否则该玩家掉线时回合永不超时，整局卡死。
  const next = startTurn(ctx, cleared, cleared.round.currentPlayerId, effects);
  return {
    ok: true,
    nextState: next,
    publicEvents: [{ type: 'missed_uno_caught', targetPlayerId, catcherPlayerId: actorId, windowToken }],
    privateEvents: [],
    effects,
    resultCandidate: null,
  };
}

export function reduceUnoHouse(
  ctx: GameContext,
  state: UnoHouseState,
  actor: Actor,
  action: UnoHouseAction,
): Result {
  if (action.type === 'begin') {
    return { ok: true, nextState: state, publicEvents: [], privateEvents: [], effects: [], resultCandidate: null };
  }
  if (state.round.phase === 'match_over') {
    return actor.kind === 'player' ? deny('整场对局已结束') : { ok: true, nextState: state, publicEvents: [], privateEvents: [], effects: [], resultCandidate: null };
  }
  if (state.round.phase === 'round_over') {
    return { ok: true, nextState: state, publicEvents: [], privateEvents: [], effects: [], resultCandidate: null };
  }

  const systemOnly = new Set<UnoHouseAction['type']>([
    'turn_timeout',
    'penalty_timeout',
    'challenge_timeout',
    'uno_race_timeout',
    'round_transition',
  ]);
  if (systemOnly.has(action.type)) {
    if (actor.kind !== 'system') return deny('该动作只允许系统发起');
    switch (action.type) {
      case 'turn_timeout':
        return handleTurnTimeout(ctx, state, action);
      case 'penalty_timeout':
        return handlePenaltyTimeout(ctx, state, action);
      case 'challenge_timeout':
        return handleChallengeTimeout(ctx, state, action);
      case 'uno_race_timeout':
        return handleRaceTimeout(ctx, state, action);
      case 'round_transition':
        return { ok: true, nextState: state, publicEvents: [], privateEvents: [], effects: [], resultCandidate: null };
    }
  }

  const playerId = actorPlayer(actor);
  if (!playerId || !state.round.players.includes(playerId)) return deny('只有参局玩家可以操作');

  switch (action.type) {
    case 'play_card':
      return playCardCore(ctx, state, playerId, action.cardId, action.declaredColor, action.preCallUno);
    case 'draw_card': {
      const r = state.round;
      if (playerId !== r.currentPlayerId) return deny('还没轮到你');
      if (r.pendingPenalty) return deny('需要先处理罚牌');
      if (r.hasDrawnThisTurn) return deny('本回合已经摸过牌');
      const effects: GameEffect[] = [];
      cancelTurnTimer(state, effects);
      cancelWindowTimer(state, effects);
      const drawn = drawForPlayer(ctx, state, playerId, 1, effects);
      const nextWithFlag = { ...drawn, round: { ...drawn.round, hasDrawnThisTurn: true } };
      // 摸牌是"有效动作"：提前关闭 UNO 竞速窗口。
      if (nextWithFlag.round.unoRaceWindow) {
        nextWithFlag.round = { ...nextWithFlag.round, unoRaceWindow: null, windowDeadlineAt: null };
      }
      // 摸牌后若无可出牌 -> 自动推进到下家；有牌可出时保留当前玩家回合（摸后可出牌），重新起 15s 回合计时器。
      const canPlayAfterDraw = legalPlayableIds(nextWithFlag, playerId).length > 0;
      let nextState: UnoHouseState;
      if (canPlayAfterDraw) {
        const started = startTurn(ctx, nextWithFlag, playerId, effects);
        nextState = { ...started, round: { ...started.round, hasDrawnThisTurn: true } };
      } else {
        nextState = startTurn(ctx, nextWithFlag, nextPlayer(nextWithFlag, playerId), effects);
      }
      return {
        ok: true,
        nextState,
        publicEvents: [{ type: 'card_drawn', playerId, count: 1 }],
        privateEvents: [],
        effects,
        resultCandidate: null,
      };
    }
    case 'pass_after_draw': {
      const r = state.round;
      if (playerId !== r.currentPlayerId) return deny('还没轮到你');
      if (!r.hasDrawnThisTurn) return deny('摸牌后才能跳过');
      const effects: GameEffect[] = [];
      cancelTurnTimer(state, effects);
      const nextState = startTurn(ctx, state, nextPlayer(state, playerId), effects);
      return { ok: true, nextState, publicEvents: [], privateEvents: [], effects, resultCandidate: null };
    }
    case 'call_uno':
      return handleCallUno(state, playerId);
    case 'catch_missed_uno':
      return handleCatchMissed(state, playerId, action.targetPlayerId, action.windowToken, ctx);
    case 'stack_penalty':
      return handleStack(ctx, state, playerId, action.cardId, action.declaredColor);
    case 'accept_penalty':
      return handleAccept(ctx, state, playerId, action.windowToken);
    case 'challenge_penalty':
      return handleChallenge(ctx, state, playerId, action.windowToken);
    default:
      return deny('未知动作');
  }
}

export function createUnoHouseInitialState(
  ctx: GameContext,
  players: readonly string[],
  config: UnoHouseConfig,
): UnoHouseState {
  if (config.mode === 'team' && players.length !== 4) {
    throw new Error('团队模式必须恰好 4 人');
  }
  if (players.length < 2 || players.length > 10) {
    throw new Error('个人模式支持 2–10 人');
  }
  if (new Set(players).size !== players.length) throw new Error('玩家不能重复');
  const effects: GameEffect[] = [];
  return createRound(ctx, players, config, 1, null, [], [], effects);
}

export function buildUnoHousePublicView(state: UnoHouseState): UnoHousePublicView {
  const r = state.round;
  const m = state.match;
  return {
    gameId: 'uno',
    rulesetId: 'uno_platform_house_v1',
    phase: r.phase,
    round: r.roundNumber,
    roundLimit: m.roundLimit,
    mode: m.mode,
    players: r.players.map((id) => ({
      playerId: id,
      handCount: (r.hands[id] ?? []).length,
      // 只有真正喊过才算已喊：预喊过，或剩 1 张且没有挂在自己头上的漏报窗口
      // （窗口一旦因补喊/超时关闭即视为安全）。不能用 handCount<=1 兜底，
      // 否则漏报窗口期的玩家会被显示成已喊，UI 无法提示「可以抓他」。
      unoCalled: (r.preCallPlayerIds[id] ?? false)
        || ((r.hands[id]?.length ?? 0) === 1 && r.unoRaceWindow?.targetPlayerId !== id),
      isCurrentPlayer: id === r.currentPlayerId,
      teamId: m.teamPlayerIds?.[id] ?? null,
    })),
    topDiscard: r.topDiscard,
    currentColor: r.currentColor,
    currentPlayerId: r.currentPlayerId,
    direction: r.direction,
    pendingPenalty: r.pendingPenalty
      ? {
          total: r.pendingPenalty.total,
          kind: r.pendingPenalty.kind,
          responderId: r.pendingPenalty.responderId,
          challengeable: r.pendingPenalty.challengeable,
          windowToken: r.pendingPenalty.windowToken,
        }
      : null,
    unoRaceWindow: r.unoRaceWindow,
    deckCount: r.deck.length,
    discardCount: r.discardPile.length,
    roundScores: m.roundScores,
    cumulativeScores: m.cumulativeScores,
    matchRanking: m.matchRanking,
    clockInfo: { turnDeadlineAt: r.turnDeadlineAt, windowDeadlineAt: r.windowDeadlineAt },
  };
}

export function buildUnoHousePlayerView(state: UnoHouseState, playerId: string): UnoHousePlayerView {
  const publicView = buildUnoHousePublicView(state);
  const r = state.round;
  const isParticipant = r.players.includes(playerId);
  if (!isParticipant) return { ...publicView, me: null };
  const capabilities: string[] = [];
  const isCurrent = r.currentPlayerId === playerId;
  const hand = r.hands[playerId] ?? [];
  const playableCardIds = legalPlayableIds(state, playerId);
  let activeWindow: string | null = null;
  if (r.pendingPenalty) {
    if (r.pendingPenalty.responderId === playerId) {
      activeWindow = r.pendingPenalty.challengeable ? 'challenge' : 'penalty';
      if (playableCardIds.length > 0) capabilities.push('canStackPenalty');
      capabilities.push('canAcceptPenalty');
      if (r.pendingPenalty.challengeable) capabilities.push('canChallenge');
    }
  } else if (r.unoRaceWindow) {
    if (r.unoRaceWindow.targetPlayerId === playerId) {
      activeWindow = 'race';
      capabilities.push('canCallUno');
    } else {
      capabilities.push('canCatchMissedUno');
    }
  } else if (isCurrent) {
    capabilities.push('canPlayCard');
    if (!r.hasDrawnThisTurn) capabilities.push('canDraw');
    if (r.hasDrawnThisTurn) capabilities.push('canPassAfterDraw');
    // 剩 1 张才能用独立的 call_uno 补喊（与 handleCallUno 的校验一致）。
    // 剩 2 张时的「喊 UNO」不是独立动作，而是出牌时附带 preCallUno，
    // 由 canPreCallUno 告知客户端应在出牌交互中给出预喊入口。
    if (hand.length === 1) capabilities.push('canCallUno');
    if (hand.length === 2) capabilities.push('canPreCallUno');
  }
  return {
    ...publicView,
    me: {
      playerId,
      hand,
      playableCardIds,
      capabilities,
      hasDrawnThisTurn: r.hasDrawnThisTurn,
      isCurrentPlayer: isCurrent,
      activeWindow,
    },
  };
}

export function assertUnoHouseInvariants(state: UnoHouseState): void {
  const r = state.round;
  const m = state.match;
  if (new Set(r.players).size !== r.players.length) throw new Error('玩家必须唯一');
  if (r.players.length === 0) throw new Error('至少一名玩家');
  if (!r.players.includes(r.currentPlayerId)) throw new Error('当前玩家无效');
  if (r.discardPile.length === 0) throw new Error('弃牌顶必须存在');
  const allCards = [...r.deck, ...r.discardPile, ...Object.values(r.hands).flat()];
  if (allCards.length !== 108 * r.deckGenerationCount) {
    throw new Error(`卡牌总数必须为 108×generation，实际 ${allCards.length}`);
  }
  if (new Set(allCards.map((card) => card.id)).size !== allCards.length) {
    throw new Error('卡牌实例 ID 必须唯一');
  }
  if (!['red', 'yellow', 'green', 'blue'].includes(r.currentColor)) throw new Error('当前颜色无效');
  if (r.pendingPenalty) {
    if (r.pendingPenalty.total <= 0) throw new Error('罚牌总数必须为正');
    if (!r.players.includes(r.pendingPenalty.responderId)) throw new Error('罚牌响应者无效');
    if (r.pendingPenalty.challengeable && !r.pendingPenalty.challengeEvidence) {
      throw new Error('可质疑罚牌必须携带质疑证据');
    }
  }
  if (r.unoRaceWindow && r.unoRaceWindow.closesEarlyOnNextEffective !== true) {
    throw new Error('竞速窗口标记非法');
  }
  if (m.cumulativeScores.length !== r.players.length) throw new Error('累计分与玩家数不一致');
  for (let index = 0; index < r.players.length; index += 1) {
    const sum = m.roundScores.reduce((acc, row) => acc + (row[index] ?? 0), 0);
    if (sum !== m.cumulativeScores[index]) throw new Error('累计分不等于各回合之和');
  }
  if (m.mode === 'team') {
    if (r.players.length !== 4) throw new Error('团队模式必须 4 人');
    if (!m.teamPlayerIds) throw new Error('团队模式缺少队伍映射');
    const teams = r.players.map((id) => m.teamPlayerIds![id]);
    if (teams[0] === teams[1] || teams[0] !== teams[2] || teams[1] !== teams[3]) {
      throw new Error('队友必须交错入座');
    }
  } else if (m.teamPlayerIds !== null) {
    throw new Error('个人模式不得携带队伍映射');
  }
  if (m.matchRanking === null && r.phase === 'match_over') throw new Error('整场结束必须已有排名');
  if (m.matchRanking !== null && r.phase !== 'match_over') throw new Error('排名只应在整场结束时存在');
}
