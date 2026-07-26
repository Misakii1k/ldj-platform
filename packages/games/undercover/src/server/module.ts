import type {
  Actor,
  GameContext,
  GameEffect,
  InitialStateResult,
  GameModule,
  PlayerId,
  ReduceResult,
} from '@lan-party/shared';

import {
  parseUndercoverConfig,
  type UndercoverConfig,
} from '../shared/config.js';
import { undercoverManifest } from '../shared/manifest.js';
import {
  UndercoverActionSchema,
  UndercoverEventSchema,
  UndercoverPlayerViewSchema,
  UndercoverResultSchema,
  UndercoverSpectatorViewSchema,
  UndercoverStateSchema,
  WordBankSchema,
  type UndercoverAction,
  type UndercoverEvent,
  type UndercoverPlayerView,
  type UndercoverResult,
  type UndercoverSpectatorView,
  type UndercoverState,
  type VoteResultSummary,
  type WordBank,
} from './schemas.js';

const WORD_REVEAL_DURATION_MS = 30_000;
const VOTE_RESULT_DURATION_MS = 5_000;

type SuccessfulReduction = Extract<ReduceResult<UndercoverState, UndercoverEvent>, { ok: true }>;
type ForfeitureReservation = Extract<UndercoverAction, { type: 'player_forfeited' }>['reservations'][number];

export type InitialUndercoverState = InitialStateResult<UndercoverState>;

export type UndercoverServerModule = GameModule<
  UndercoverConfig,
  UndercoverState,
  UndercoverAction,
  UndercoverPlayerView,
  UndercoverSpectatorView,
  UndercoverEvent,
  UndercoverResult
>;

function failure(code: string, message: string): ReduceResult<UndercoverState, UndercoverEvent> {
  return { ok: false, code, message };
}

function success(
  state: UndercoverState,
  events: readonly UndercoverEvent[] = [],
  effects: readonly GameEffect[] = [],
): SuccessfulReduction {
  return {
    ok: true,
    state: UndercoverStateSchema.parse(state),
    events: events.map((event) => UndercoverEventSchema.parse(event)),
    effects: [...effects],
  };
}

function orderedPlayerIds(state: UndercoverState): PlayerId[] {
  return Object.entries(state.players)
    .sort(([, left], [, right]) => left.seat - right.seat)
    .map(([playerId]) => playerId as PlayerId);
}

function alivePlayerIds(state: UndercoverState): PlayerId[] {
  return orderedPlayerIds(state).filter((playerId) => state.players[playerId]?.alive === true);
}

function undercoverCountFor(playerCount: number): number {
  return playerCount >= 8 ? 2 : 1;
}

function timerEffect(timerId: string, deadlineAt: number, action: UndercoverAction): GameEffect {
  return { type: 'schedule_timer', timerId, deadlineAt, action };
}

function cancelCurrentTimer(state: UndercoverState): GameEffect[] {
  return state.currentTimerId === null ? [] : [{ type: 'cancel_timer', timerId: state.currentTimerId }];
}

function speakingTimerId(round: number, speakerIndex: number, playerId: PlayerId): string {
  return `undercover:speaking:${round}:${speakerIndex}:${playerId}`;
}

function votingTimerId(round: number, runoff: boolean): string {
  return `undercover:${runoff ? 'runoff-voting' : 'voting'}:${round}`;
}

function voteResultTimerId(round: number, source: 'voting' | 'runoff'): string {
  return `undercover:vote-result:${source}:${round}`;
}

function currentSpeakerId(state: UndercoverState): PlayerId | null {
  if (state.phase !== 'speaking') return null;
  return state.speakingOrder[state.currentSpeakerIndex] ?? null;
}

function rotateFrom(ids: readonly PlayerId[], starter: PlayerId): PlayerId[] {
  const start = ids.indexOf(starter);
  if (start < 0) throw new Error('starter must be present in player order');
  return [...ids.slice(start), ...ids.slice(0, start)];
}

function nextAliveAfter(state: UndercoverState, playerId: PlayerId): PlayerId {
  const ordered = orderedPlayerIds(state);
  const start = ordered.indexOf(playerId);
  for (let offset = 1; offset <= ordered.length; offset += 1) {
    const candidate = ordered[(start + offset) % ordered.length];
    if (candidate !== undefined && state.players[candidate]?.alive === true) return candidate;
  }
  throw new Error('there must be a surviving player');
}

function checkWinner(state: UndercoverState): 'civilian' | 'undercover' | null {
  let civilians = 0;
  let undercovers = 0;
  for (const player of Object.values(state.players)) {
    if (!player.alive) continue;
    if (player.role === 'undercover') undercovers += 1;
    else civilians += 1;
  }
  if (undercovers === 0) return 'civilian';
  if (undercovers >= civilians) return 'undercover';
  return null;
}

function enterSpeaking(
  ctx: GameContext,
  state: UndercoverState,
  round: number,
  starter: PlayerId,
): SuccessfulReduction {
  const survivingStarter =
    state.players[starter]?.alive === true ? starter : nextAliveAfter(state, starter);
  const order = rotateFrom(alivePlayerIds(state), survivingStarter);
  const deadlineAt = ctx.now + state.config.speakingDurationSeconds * 1_000;
  const firstSpeaker = order[0];
  if (firstSpeaker === undefined) throw new Error('speaking requires a surviving player');
  const timerId = speakingTimerId(round, 0, firstSpeaker);
  const next: UndercoverState = {
    ...state,
    phase: 'speaking',
    round,
    speakingOrder: order,
    roundStarterPlayerId: survivingStarter,
    currentSpeakerIndex: 0,
    votes: {},
    runoffCandidates: [],
    pendingForfeits: [],
    deadlineAt,
    currentTimerId: timerId,
    winner: null,
    endReason: null,
    lastVoteResult: null,
    nextPhaseAfterVoteResult: null,
  };
  return success(
    next,
    [{ type: 'phase_changed', phase: 'speaking', round }],
    [timerEffect(timerId, deadlineAt, { type: 'speech_timeout', timerId })],
  );
}

function enterNextRound(ctx: GameContext, state: UndercoverState): SuccessfulReduction {
  const starter = nextAliveAfter(state, state.roundStarterPlayerId);
  return enterSpeaking(ctx, state, state.round + 1, starter);
}

function enterVoting(ctx: GameContext, state: UndercoverState): SuccessfulReduction {
  const deadlineAt = ctx.now + state.config.votingDurationSeconds * 1_000;
  const timerId = votingTimerId(state.round, false);
  const next: UndercoverState = {
    ...state,
    phase: 'voting',
    votes: {},
    runoffCandidates: [],
    deadlineAt,
    currentTimerId: timerId,
    lastVoteResult: null,
    nextPhaseAfterVoteResult: null,
  };
  return success(
    next,
    [{ type: 'phase_changed', phase: 'voting', round: state.round }],
    [timerEffect(timerId, deadlineAt, { type: 'voting_timeout', timerId })],
  );
}

function enterRunoffVoting(ctx: GameContext, state: UndercoverState): SuccessfulReduction {
  const candidates = state.runoffCandidates.filter((id) => state.players[id]?.alive === true);
  if (candidates.length < 2) return enterNextRound(ctx, state);
  const deadlineAt = ctx.now + state.config.votingDurationSeconds * 1_000;
  const timerId = votingTimerId(state.round, true);
  const next: UndercoverState = {
    ...state,
    phase: 'runoff_voting',
    votes: {},
    runoffCandidates: candidates,
    deadlineAt,
    currentTimerId: timerId,
    lastVoteResult: null,
    nextPhaseAfterVoteResult: null,
  };
  return success(
    next,
    [{ type: 'phase_changed', phase: 'runoff_voting', round: state.round }],
    [timerEffect(timerId, deadlineAt, { type: 'voting_timeout', timerId })],
  );
}

function abortGame(state: UndercoverState): UndercoverState {
  return {
    ...state,
    phase: 'game_over',
    deadlineAt: null,
    currentTimerId: null,
    winner: null,
    endReason: 'aborted',
    nextPhaseAfterVoteResult: null,
  };
}

function finishNormalGame(state: UndercoverState): UndercoverState {
  if (state.winner === null) throw new Error('normal game completion requires a winner');
  return {
    ...state,
    phase: 'game_over',
    deadlineAt: null,
    currentTimerId: null,
    endReason: 'normal',
    nextPhaseAfterVoteResult: null,
  };
}

function allOnlinePlayersConfirmed(state: UndercoverState): boolean {
  const confirmed = new Set(state.wordConfirmations);
  return alivePlayerIds(state).every((id) => state.players[id]?.online !== true || confirmed.has(id));
}

function allOnlinePlayersVoted(state: UndercoverState): boolean {
  return alivePlayerIds(state).every((id) => state.players[id]?.online !== true || state.votes[id] !== undefined);
}

function applyForfeits(state: UndercoverState, playerIds: readonly PlayerId[]): UndercoverState {
  const forfeited = new Set(playerIds);
  const players = Object.fromEntries(
    Object.entries(state.players).map(([id, player]) => {
      if (!forfeited.has(id as PlayerId) || !player.alive) return [id, player];
      return [id, { ...player, alive: false, online: false, exitReason: 'disconnect_timeout' as const }];
    }),
  );
  return { ...state, players };
}

function nobodyOnline(state: UndercoverState): boolean {
  return Object.values(state.players).every((player) => !player.online);
}

function tallyVotes(state: UndercoverState): { total: number; leaders: PlayerId[] } {
  const counts = new Map<PlayerId, number>();
  for (const target of Object.values(state.votes)) {
    if (state.players[target]?.alive !== true) continue;
    if (state.phase === 'runoff_voting' && !state.runoffCandidates.includes(target)) continue;
    counts.set(target, (counts.get(target) ?? 0) + 1);
  }
  if (counts.size === 0) return { total: 0, leaders: [] };
  const max = Math.max(...counts.values());
  return {
    total: [...counts.values()].reduce((sum, count) => sum + count, 0),
    leaders: [...counts.entries()]
      .filter(([, count]) => count === max)
      .map(([id]) => id)
      .sort((left, right) => (state.players[left]?.seat ?? 0) - (state.players[right]?.seat ?? 0)),
  };
}

function settleVoting(ctx: GameContext, state: UndercoverState): SuccessfulReduction {
  const wasRunoff = state.phase === 'runoff_voting';
  const tally = tallyVotes(state);
  let working = state;
  let result: VoteResultSummary;

  if (tally.total === 0 || (wasRunoff && tally.leaders.length !== 1)) {
    result = { kind: 'no_elimination', runoffCandidates: [] };
  } else if (!wasRunoff && tally.leaders.length > 1) {
    result = { kind: 'runoff', runoffCandidates: tally.leaders };
  } else {
    const eliminatedPlayerId = tally.leaders[0];
    if (eliminatedPlayerId === undefined) throw new Error('a unique vote leader is required');
    const eliminated = working.players[eliminatedPlayerId];
    if (eliminated === undefined) throw new Error('vote leader must exist');
    working = {
      ...working,
      players: {
        ...working.players,
        [eliminatedPlayerId]: { ...eliminated, alive: false, exitReason: 'voted_out' },
      },
    };
    result = {
      kind: 'eliminated',
      eliminatedPlayerId,
      eliminatedRole: eliminated.role,
      runoffCandidates: [],
    };
  }

  const deferred = working.pendingForfeits.filter(({ playerId, reservationGeneration }) => {
    const player = working.players[playerId];
    return (
      player?.alive === true &&
      !player.online &&
      player.reservationGeneration === reservationGeneration
    );
  });
  const deferredPlayerIds = deferred.map(({ playerId }) => playerId);
  if (deferredPlayerIds.length > 0) working = applyForfeits(working, deferredPlayerIds);
  const aborted = deferredPlayerIds.length > 0 && nobodyOnline(working);
  const winner = aborted ? null : checkWinner(working);
  const runoffStillPossible =
    result.kind === 'runoff' && result.runoffCandidates.filter((id) => working.players[id]?.alive === true).length >= 2;
  const nextPhase = aborted || winner !== null ? 'game_over' : runoffStillPossible ? 'runoff_voting' : 'speaking';
  const deadlineAt = ctx.now + VOTE_RESULT_DURATION_MS;
  const timerId = voteResultTimerId(state.round, wasRunoff ? 'runoff' : 'voting');
  const next: UndercoverState = {
    ...working,
    phase: 'vote_result',
    speakingOrder: working.speakingOrder.filter((id) => working.players[id]?.alive === true),
    currentSpeakerIndex: 0,
    votes: {},
    runoffCandidates:
      result.kind === 'runoff'
        ? result.runoffCandidates.filter((id) => working.players[id]?.alive === true)
        : [],
    pendingForfeits: [],
    deadlineAt,
    currentTimerId: timerId,
    winner,
    endReason: null,
    lastVoteResult: result,
    nextPhaseAfterVoteResult: nextPhase,
  };
  const events: UndercoverEvent[] = [{ type: 'vote_settled', result }];
  if (deferredPlayerIds.length > 0) {
    events.push({ type: 'players_forfeited', playerIds: deferredPlayerIds });
  }
  const effects: GameEffect[] = [
    ...cancelCurrentTimer(state),
    timerEffect(timerId, deadlineAt, { type: 'vote_result_timeout', timerId }),
  ];
  if (result.kind === 'no_elimination') {
    effects.push({ type: 'system_message', text: '本轮无人被淘汰。' });
  }
  if (deferredPlayerIds.length > 0) {
    effects.push({ type: 'system_message', text: `${deferredPlayerIds.length} 名玩家因掉线超时退出。` });
  }
  return success(next, events, effects);
}

function requirePlayerActor(actor: Actor): PlayerId | null {
  return actor.kind === 'player' ? actor.playerId : null;
}

function isTrustedTimerActor(actor: Actor): boolean {
  return actor.kind === 'system' && (actor.source === 'timer' || actor.source === 'recovery');
}

function reduceConfirmWord(
  ctx: GameContext,
  state: UndercoverState,
  actor: Actor,
): ReduceResult<UndercoverState, UndercoverEvent> {
  const playerId = requirePlayerActor(actor);
  if (playerId === null) return failure('ACTION_NOT_ALLOWED', 'only a player may confirm their word');
  const player = state.players[playerId];
  if (state.phase !== 'word_reveal' || player?.alive !== true || !player.online) {
    return failure('ACTION_NOT_ALLOWED', 'word confirmation is not allowed now');
  }
  if (state.wordConfirmations.includes(playerId)) return success(state);
  const next = { ...state, wordConfirmations: [...state.wordConfirmations, playerId] };
  const event: UndercoverEvent = { type: 'word_confirmed', playerId };
  if (!allOnlinePlayersConfirmed(next)) return success(next, [event]);
  const entered = enterSpeaking(ctx, next, next.round, next.roundStarterPlayerId);
  return success(entered.state, [event, ...entered.events], [...cancelCurrentTimer(state), ...entered.effects]);
}

function advanceSpeech(
  ctx: GameContext,
  state: UndercoverState,
  playerId: PlayerId,
  reason: 'player' | 'timeout',
): SuccessfulReduction {
  const nextIndex = state.currentSpeakerIndex + 1;
  const speechEvent: UndercoverEvent = { type: 'speech_finished', playerId, reason };
  if (nextIndex >= state.speakingOrder.length) {
    const entered = enterVoting(ctx, { ...state, deadlineAt: null, currentTimerId: null });
    return success(
      entered.state,
      [speechEvent, ...entered.events],
      [...cancelCurrentTimer(state), ...entered.effects],
    );
  }
  const deadlineAt = ctx.now + state.config.speakingDurationSeconds * 1_000;
  const nextSpeaker = state.speakingOrder[nextIndex];
  if (nextSpeaker === undefined) throw new Error('next speaker must exist');
  const timerId = speakingTimerId(state.round, nextIndex, nextSpeaker);
  return success(
    { ...state, currentSpeakerIndex: nextIndex, deadlineAt, currentTimerId: timerId },
    [speechEvent],
    [
      ...cancelCurrentTimer(state),
      timerEffect(timerId, deadlineAt, { type: 'speech_timeout', timerId }),
    ],
  );
}

function reduceFinishSpeech(
  ctx: GameContext,
  state: UndercoverState,
  actor: Actor,
): ReduceResult<UndercoverState, UndercoverEvent> {
  const playerId = requirePlayerActor(actor);
  if (playerId === null) return failure('ACTION_NOT_ALLOWED', 'only a player may finish a speech');
  if (state.phase !== 'speaking') return failure('ACTION_NOT_ALLOWED', 'speech cannot be finished now');
  const index = state.speakingOrder.indexOf(playerId);
  if (index >= 0 && index < state.currentSpeakerIndex) return success(state);
  if (currentSpeakerId(state) !== playerId || state.players[playerId]?.alive !== true) {
    return failure('ACTION_NOT_ALLOWED', 'only the current surviving speaker may finish');
  }
  return advanceSpeech(ctx, state, playerId, 'player');
}

function reduceLockVote(
  ctx: GameContext,
  state: UndercoverState,
  actor: Actor,
  targetPlayerId: PlayerId,
): ReduceResult<UndercoverState, UndercoverEvent> {
  const playerId = requirePlayerActor(actor);
  if (playerId === null) return failure('ACTION_NOT_ALLOWED', 'only a player may vote');
  if (state.phase !== 'voting' && state.phase !== 'runoff_voting') {
    return failure('ACTION_NOT_ALLOWED', 'voting is not open');
  }
  const voter = state.players[playerId];
  const target = state.players[targetPlayerId];
  if (voter?.alive !== true || !voter.online) return failure('ACTION_NOT_ALLOWED', 'voter is not eligible');
  if (state.votes[playerId] !== undefined) return failure('VOTE_ALREADY_LOCKED', 'the vote is already locked');
  if (playerId === targetPlayerId || target?.alive !== true) {
    return failure('INVALID_VOTE_TARGET', 'vote target must be another surviving player');
  }
  if (state.phase === 'runoff_voting' && !state.runoffCandidates.includes(targetPlayerId)) {
    return failure('INVALID_VOTE_TARGET', 'vote target is not a runoff candidate');
  }
  const next: UndercoverState = { ...state, votes: { ...state.votes, [playerId]: targetPlayerId } };
  const event: UndercoverEvent = { type: 'vote_locked', playerId };
  if (!allOnlinePlayersVoted(next)) return success(next, [event]);
  const settled = settleVoting(ctx, next);
  return success(settled.state, [event, ...settled.events], settled.effects);
}

function reduceConnectionChanged(
  ctx: GameContext,
  state: UndercoverState,
  actor: Actor,
  playerId: PlayerId,
  online: boolean,
  reservationGeneration: number,
): ReduceResult<UndercoverState, UndercoverEvent> {
  if (actor.kind !== 'system') return failure('ACTION_NOT_ALLOWED', 'connection state is system managed');
  const player = state.players[playerId];
  if (player === undefined) return failure('PLAYER_NOT_FOUND', 'player does not belong to this game');
  if (reservationGeneration <= player.reservationGeneration) return success(state);
  const next: UndercoverState = {
    ...state,
    players: {
      ...state.players,
      [playerId]: { ...player, online, reservationGeneration },
    },
  };
  if (state.phase === 'word_reveal' && allOnlinePlayersConfirmed(next)) {
    const entered = enterSpeaking(ctx, next, next.round, next.roundStarterPlayerId);
    return success(entered.state, entered.events, [...cancelCurrentTimer(state), ...entered.effects]);
  }
  if ((state.phase === 'voting' || state.phase === 'runoff_voting') && allOnlinePlayersVoted(next)) {
    return settleVoting(ctx, next);
  }
  return success(next);
}

function reduceForfeited(
  ctx: GameContext,
  state: UndercoverState,
  actor: Actor,
  reservations: readonly ForfeitureReservation[],
): ReduceResult<UndercoverState, UndercoverEvent> {
  if (actor.kind !== 'system') return failure('ACTION_NOT_ALLOWED', 'forfeiture is system managed');
  const eligible = reservations.filter(({ playerId, reservationGeneration }) => {
    const player = state.players[playerId];
    return (
      player?.alive === true &&
      !player.online &&
      player.reservationGeneration === reservationGeneration
    );
  });
  if (eligible.length === 0) return success(state);
  const eligiblePlayerIds = eligible.map(({ playerId }) => playerId);
  if (state.phase === 'voting' || state.phase === 'runoff_voting') {
    const pendingByPlayer = new Map(
      state.pendingForfeits.map((reservation) => [reservation.playerId, reservation] as const),
    );
    for (const reservation of eligible) pendingByPlayer.set(reservation.playerId, reservation);
    const pending = [...pendingByPlayer.values()];
    const players = { ...state.players };
    for (const id of eligiblePlayerIds) {
      const player = players[id];
      if (player !== undefined) players[id] = { ...player, online: false };
    }
    const next: UndercoverState = { ...state, players, pendingForfeits: pending };
    if (allOnlinePlayersVoted(next)) return settleVoting(ctx, next);
    return success(next);
  }

  let next = applyForfeits(state, eligiblePlayerIds);
  const events: UndercoverEvent[] = [{ type: 'players_forfeited', playerIds: eligiblePlayerIds }];
  const effects: GameEffect[] = [
    { type: 'system_message', text: `${eligiblePlayerIds.length} 名玩家因掉线超时退出。` },
  ];
  if (nobodyOnline(next)) {
    if (state.phase === 'vote_result') {
      return success(
        { ...next, winner: null, nextPhaseAfterVoteResult: 'game_over' },
        events,
        effects,
      );
    }
    effects.unshift(...cancelCurrentTimer(state));
    next = abortGame(next);
    events.push({ type: 'game_finished', outcome: 'aborted' });
    return success(next, events, effects);
  }
  const winner = checkWinner(next);
  if (winner !== null) {
    if (state.phase === 'vote_result') {
      return success(
        { ...next, winner, nextPhaseAfterVoteResult: 'game_over' },
        events,
        effects,
      );
    }
    effects.unshift(...cancelCurrentTimer(state));
    next = finishNormalGame({ ...next, winner });
    events.push({ type: 'game_finished', outcome: winner });
    return success(next, events, effects);
  }

  if (state.phase === 'vote_result') {
    const runoffStillPossible =
      state.lastVoteResult?.kind === 'runoff' &&
      state.runoffCandidates.filter((id) => next.players[id]?.alive === true).length >= 2;
    return success(
      {
        ...next,
        winner: null,
        nextPhaseAfterVoteResult: runoffStillPossible ? 'runoff_voting' : 'speaking',
      },
      events,
      effects,
    );
  }

  if (state.phase === 'word_reveal' && allOnlinePlayersConfirmed(next)) {
    const entered = enterSpeaking(ctx, { ...next, deadlineAt: null, currentTimerId: null }, next.round, next.roundStarterPlayerId);
    return success(
      entered.state,
      [...events, ...entered.events],
      [...cancelCurrentTimer(state), ...effects, ...entered.effects],
    );
  }

  if (state.phase === 'speaking') {
    const removed = new Set(eligiblePlayerIds);
    const oldIndex = state.currentSpeakerIndex;
    const removedBefore = state.speakingOrder.slice(0, oldIndex).filter((id) => removed.has(id)).length;
    const currentWasRemoved = removed.has(state.speakingOrder[oldIndex] as PlayerId);
    const speakingOrder = state.speakingOrder.filter((id) => !removed.has(id));
    const newIndex = Math.max(0, oldIndex - removedBefore);
    next = { ...next, speakingOrder, currentSpeakerIndex: Math.min(newIndex, speakingOrder.length - 1) };
    if (currentWasRemoved) {
      if (newIndex >= speakingOrder.length) {
        const entered = enterVoting(ctx, { ...next, deadlineAt: null, currentTimerId: null });
        return success(
          entered.state,
          [...events, ...entered.events],
          [...cancelCurrentTimer(state), ...effects, ...entered.effects],
        );
      }
      const deadlineAt = ctx.now + state.config.speakingDurationSeconds * 1_000;
      const nextSpeaker = speakingOrder[newIndex];
      if (nextSpeaker === undefined) throw new Error('next speaker must exist');
      const timerId = speakingTimerId(state.round, newIndex, nextSpeaker);
      return success(
        { ...next, deadlineAt, currentTimerId: timerId },
        events,
        [
          ...cancelCurrentTimer(state),
          ...effects,
          timerEffect(timerId, deadlineAt, { type: 'speech_timeout', timerId }),
        ],
      );
    }
  }
  return success(next, events, effects);
}

function reduceTimer(
  ctx: GameContext,
  state: UndercoverState,
  actor: Actor,
  action: Extract<
    UndercoverAction,
    { type: 'word_reveal_timeout' | 'speech_timeout' | 'voting_timeout' | 'vote_result_timeout' }
  >,
): ReduceResult<UndercoverState, UndercoverEvent> {
  if (!isTrustedTimerActor(actor)) return failure('ACTION_NOT_ALLOWED', 'timer action requires a trusted actor');
  if (action.timerId !== state.currentTimerId) return success(state);
  if (state.deadlineAt !== null && ctx.now < state.deadlineAt) {
    return failure('TIMER_NOT_DUE', 'timer deadline has not been reached');
  }
  if (action.type === 'word_reveal_timeout') {
    if (state.phase !== 'word_reveal') return success(state);
    return enterSpeaking(ctx, { ...state, deadlineAt: null, currentTimerId: null }, state.round, state.roundStarterPlayerId);
  }
  if (action.type === 'speech_timeout') {
    const speaker = currentSpeakerId(state);
    if (speaker === null) return success(state);
    return advanceSpeech(ctx, state, speaker, 'timeout');
  }
  if (action.type === 'voting_timeout') {
    if (state.phase !== 'voting' && state.phase !== 'runoff_voting') return success(state);
    return settleVoting(ctx, state);
  }
  if (state.phase !== 'vote_result') return success(state);
  if (state.nextPhaseAfterVoteResult === 'game_over') {
    if (state.winner === null) {
      const gameOver = abortGame(state);
      return success(gameOver, [{ type: 'game_finished', outcome: 'aborted' }]);
    }
    const gameOver = finishNormalGame(state);
    return success(gameOver, [{ type: 'game_finished', outcome: state.winner }]);
  }
  if (state.nextPhaseAfterVoteResult === 'runoff_voting') {
    return enterRunoffVoting(ctx, { ...state, deadlineAt: null, currentTimerId: null });
  }
  return enterNextRound(ctx, { ...state, deadlineAt: null, currentTimerId: null });
}

function reduceState(
  ctx: GameContext,
  stateInput: UndercoverState,
  actor: Actor,
  action: UndercoverAction,
): ReduceResult<UndercoverState, UndercoverEvent> {
  const state = UndercoverStateSchema.parse(stateInput);
  if (state.phase === 'game_over') return failure('ACTION_NOT_ALLOWED', 'the game is already over');
  switch (action.type) {
    case 'confirm_word':
      return reduceConfirmWord(ctx, state, actor);
    case 'finish_speech':
      return reduceFinishSpeech(ctx, state, actor);
    case 'lock_vote':
      return reduceLockVote(ctx, state, actor, action.targetPlayerId);
    case 'player_connection_changed':
      return reduceConnectionChanged(
        ctx,
        state,
        actor,
        action.playerId,
        action.online,
        action.reservationGeneration,
      );
    case 'player_forfeited':
      return reduceForfeited(ctx, state, actor, action.reservations);
    case 'word_reveal_timeout':
    case 'speech_timeout':
    case 'voting_timeout':
    case 'vote_result_timeout':
      return reduceTimer(ctx, state, actor, action);
  }
}

function resultFor(state: UndercoverState): UndercoverResult | null {
  if (state.phase !== 'game_over' || state.endReason === null) return null;
  const players = Object.fromEntries(
    Object.entries(state.players).map(([id, player]) => [
      id,
      {
        seat: player.seat,
        role: player.role,
        ...(player.exitReason === undefined ? {} : { exitReason: player.exitReason }),
      },
    ]),
  );
  return UndercoverResultSchema.parse({
    outcome: state.endReason === 'aborted' ? 'aborted' : state.winner,
    winner: state.winner,
    round: state.round,
    civilianWord: state.civilianWord,
    undercoverWord: state.undercoverWord,
    wordBankVersion: state.wordBankVersion,
    players,
  });
}

function commonView(state: UndercoverState) {
  const gameResult = resultFor(state);
  const players = Object.fromEntries(
    Object.entries(state.players).map(([id, player]) => [
      id,
      {
        seat: player.seat,
        alive: player.alive,
        online: player.online,
        ...(player.exitReason === undefined ? {} : { exitReason: player.exitReason }),
        ...(!player.alive || state.phase === 'game_over' ? { revealedRole: player.role } : {}),
      },
    ]),
  );
  return {
    schemaVersion: 1 as const,
    phase: state.phase,
    round: state.round,
    players,
    speakingOrder: [...state.speakingOrder],
    currentSpeakerId: currentSpeakerId(state),
    runoffCandidates: [...state.runoffCandidates],
    deadlineAt: state.deadlineAt,
    voteProgress: {
      locked: Object.keys(state.votes).length,
      eligible: alivePlayerIds(state).filter((id) => state.players[id]?.online === true).length,
    },
    voteResult: state.phase === 'vote_result' ? state.lastVoteResult : null,
    result:
      gameResult === null
        ? null
        : {
            outcome: gameResult.outcome,
            civilianWord: gameResult.civilianWord,
            undercoverWord: gameResult.undercoverWord,
            roles: Object.fromEntries(
              Object.entries(gameResult.players).map(([id, player]) => [id, player.role]),
            ),
          },
  };
}

function createInitial(
  ctx: GameContext,
  playerIds: PlayerId[],
  configInput: UndercoverConfig,
  wordBank: WordBank,
): InitialUndercoverState {
  const config = parseUndercoverConfig(configInput);
  const parsedIds = playerIds.map((id) => UndercoverActionSchema.options[2].shape.targetPlayerId.parse(id));
  if (parsedIds.length < undercoverManifest.minPlayers || parsedIds.length > undercoverManifest.maxPlayers) {
    throw new Error('undercover requires 4 to 12 players');
  }
  if (new Set(parsedIds).size !== parsedIds.length) throw new Error('player ids must be unique');
  const selectedPair = wordBank.pairs[ctx.random.nextInt(0, wordBank.pairs.length)];
  if (selectedPair === undefined) throw new Error('random source selected an invalid word pair');
  const shuffled = ctx.random.shuffle(parsedIds);
  if (shuffled.length !== parsedIds.length || new Set(shuffled).size !== parsedIds.length) {
    throw new Error('random source returned an invalid shuffle');
  }
  if (shuffled.some((id) => !parsedIds.includes(id))) {
    throw new Error('random source returned values outside the player set');
  }
  const undercovers = new Set(shuffled.slice(0, undercoverCountFor(parsedIds.length)));
  const starterIndex = ctx.random.nextInt(0, parsedIds.length);
  const starter = parsedIds[starterIndex];
  if (starter === undefined) throw new Error('random source selected an invalid first speaker');
  const players = Object.fromEntries(
    parsedIds.map((id, seat) => [
      id,
      {
        seat,
        role: undercovers.has(id) ? ('undercover' as const) : ('civilian' as const),
        alive: true,
        online: true,
        reservationGeneration: 0,
      },
    ]),
  );
  const speakingOrder = rotateFrom(parsedIds, starter);
  const deadlineAt = ctx.now + WORD_REVEAL_DURATION_MS;
  const timerId = 'undercover:word-reveal:1';
  const state = UndercoverStateSchema.parse({
    schemaVersion: 1,
    phase: 'word_reveal',
    round: 1,
    config,
    players,
    speakingOrder,
    roundStarterPlayerId: starter,
    currentSpeakerIndex: 0,
    votes: {},
    runoffCandidates: [],
    wordConfirmations: [],
    pendingForfeits: [],
    civilianWord: selectedPair.civilianWord,
    undercoverWord: selectedPair.undercoverWord,
    wordBankVersion: wordBank.version,
    deadlineAt,
    currentTimerId: timerId,
    winner: null,
    endReason: null,
    lastVoteResult: null,
    nextPhaseAfterVoteResult: null,
  });
  return {
    state,
    effects: [timerEffect(timerId, deadlineAt, { type: 'word_reveal_timeout', timerId })],
  };
}

export function createUndercoverModule(wordBankInput: unknown): UndercoverServerModule {
  const wordBank = WordBankSchema.parse(wordBankInput);
  return {
    manifest: undercoverManifest,
    parseConfig: parseUndercoverConfig,
    parseAction(input: unknown): UndercoverAction {
      return UndercoverActionSchema.parse(input);
    },
    createInitialState(ctx, players, config) {
      return createInitial(ctx, players, config, wordBank);
    },
    reduce: reduceState,
    getPlayerView(stateInput, playerId) {
      const state = UndercoverStateSchema.parse(stateInput);
      const self = state.players[playerId];
      if (self === undefined) throw new Error('player does not belong to this game');
      return UndercoverPlayerViewSchema.parse({
        ...commonView(state),
        viewerKind: 'player',
        self: {
          playerId,
          word: self.role === 'civilian' ? state.civilianWord : state.undercoverWord,
          ...(!self.alive || state.phase === 'game_over' ? { revealedRole: self.role } : {}),
        },
      });
    },
    getSpectatorView(stateInput) {
      const state = UndercoverStateSchema.parse(stateInput);
      return UndercoverSpectatorViewSchema.parse({ ...commonView(state), viewerKind: 'spectator' });
    },
    getResult(stateInput) {
      return resultFor(UndercoverStateSchema.parse(stateInput));
    },
    migrateSnapshot(fromVersion, snapshot) {
      if (fromVersion !== undercoverManifest.stateSchemaVersion) {
        throw new Error(`unsupported undercover snapshot schema version: ${fromVersion}`);
      }
      return UndercoverStateSchema.parse(snapshot);
    },
  };
}

export { checkWinner as checkUndercoverWinner, undercoverCountFor as getUndercoverCount };
