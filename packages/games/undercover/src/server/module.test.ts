import type { Actor, GameContext, PlayerId, RandomSource } from '@lan-party/shared';
import { playerIdSchema } from '@lan-party/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  UndercoverActionSchema,
  UndercoverStateSchema,
  WordBankSchema,
  createUndercoverModule,
  getUndercoverCount,
  type UndercoverAction,
  type UndercoverServerModule,
  type UndercoverState,
} from './index.js';

const wordBank = {
  version: 'test-1',
  pairs: [
    { civilianWord: '豆浆', undercoverWord: '牛奶' },
    { civilianWord: '地铁', undercoverWord: '公交车' },
  ],
};

class SeededRandom implements RandomSource {
  private cursor: number;

  constructor(seed: number) {
    this.cursor = seed >>> 0;
  }

  nextInt(minInclusive: number, maxExclusive: number): number {
    this.cursor = (Math.imul(this.cursor, 1_664_525) + 1_013_904_223) >>> 0;
    return minInclusive + (this.cursor % (maxExclusive - minInclusive));
  }

  shuffle<T>(items: readonly T[]): T[] {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swapIndex = this.nextInt(0, index + 1);
      [result[index], result[swapIndex]] = [result[swapIndex] as T, result[index] as T];
    }
    return result;
  }
}

class IdentityRandom implements RandomSource {
  nextInt(minInclusive: number): number {
    return minInclusive;
  }

  shuffle<T>(items: readonly T[]): T[] {
    return [...items];
  }
}

const player = (index: number): PlayerId => playerIdSchema.parse(`p${index}`);
const players = (count: number): PlayerId[] =>
  Array.from({ length: count }, (_, index) => player(index + 1));
const playerActor = (id: PlayerId): Actor => ({ kind: 'player', playerId: id });
const timerActor: Actor = { kind: 'system', source: 'timer' };
const recoveryActor: Actor = { kind: 'system', source: 'recovery' };
const adminActor: Actor = { kind: 'system', source: 'admin' };

function connectionChanged(
  playerId: PlayerId,
  online: boolean,
  reservationGeneration: number,
): UndercoverAction {
  return { type: 'player_connection_changed', playerId, online, reservationGeneration };
}

function playersForfeited(
  playerIds: readonly PlayerId[],
  reservationGeneration = 1,
): UndercoverAction {
  return {
    type: 'player_forfeited',
    reservations: playerIds.map((playerId) => ({ playerId, reservationGeneration })),
  };
}

function context(now: number, random: RandomSource = new IdentityRandom()): GameContext {
  return { now, random };
}

function newGame(
  count = 4,
  random: RandomSource = new IdentityRandom(),
): { module: UndercoverServerModule; state: UndercoverState } {
  const module = createUndercoverModule(wordBank);
  const { state } = module.createInitialState(context(1_000, random), players(count), {
    speakingDurationSeconds: 60,
    votingDurationSeconds: 45,
  });
  return { module, state };
}

function reduceOk(
  module: UndercoverServerModule,
  state: UndercoverState,
  actor: Actor,
  action: UndercoverAction,
  now = 2_000,
): UndercoverState {
  const result = module.reduce(context(now), state, actor, action);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`${result.code}: ${result.message}`);
  return result.state;
}

function confirmEveryone(module: UndercoverServerModule, state: UndercoverState): UndercoverState {
  let current = state;
  for (const id of players(Object.keys(state.players).length)) {
    current = reduceOk(module, current, playerActor(id), { type: 'confirm_word' });
  }
  expect(current.phase).toBe('speaking');
  return current;
}

function finishSpeakingRound(module: UndercoverServerModule, state: UndercoverState): UndercoverState {
  let current = state;
  while (current.phase === 'speaking') {
    const speaker = current.speakingOrder[current.currentSpeakerIndex];
    if (speaker === undefined) throw new Error('missing speaker');
    current = reduceOk(module, current, playerActor(speaker), { type: 'finish_speech' });
  }
  expect(current.phase).toBe('voting');
  return current;
}

function fireCurrentTimer(module: UndercoverServerModule, state: UndercoverState, now: number): UndercoverState {
  const timerId = state.currentTimerId;
  if (timerId === null) throw new Error('missing timer');
  const type =
    state.phase === 'word_reveal'
      ? 'word_reveal_timeout'
      : state.phase === 'speaking'
        ? 'speech_timeout'
        : state.phase === 'voting' || state.phase === 'runoff_voting'
          ? 'voting_timeout'
          : 'vote_result_timeout';
  return reduceOk(module, state, timerActor, { type, timerId } as UndercoverAction, now);
}

describe('undercover schemas and initialization', () => {
  it('strictly validates client and system actions', () => {
    expect(UndercoverActionSchema.parse({ type: 'confirm_word' })).toEqual({ type: 'confirm_word' });
    expect(() => UndercoverActionSchema.parse({ type: 'confirm_word', word: '秘密' })).toThrow();
    expect(() => UndercoverActionSchema.parse({ type: 'lock_vote', targetPlayerId: '__proto__' })).toThrow();
    expect(() =>
      UndercoverActionSchema.parse({
        type: 'player_forfeited',
        reservations: [
          { playerId: 'p1', reservationGeneration: 1 },
          { playerId: 'p1', reservationGeneration: 2 },
        ],
      }),
    ).toThrow();
  });

  it('validates injected word banks without embedding a production word list', () => {
    expect(WordBankSchema.parse(wordBank)).toEqual(wordBank);
    expect(() =>
      WordBankSchema.parse({
        version: 'bad',
        pairs: [
          { civilianWord: '甲', undercoverWord: '乙' },
          { civilianWord: '乙', undercoverWord: '甲' },
        ],
      }),
    ).toThrow();
    expect(() =>
      WordBankSchema.parse({ version: 'bad', pairs: [{ civilianWord: '相同', undercoverWord: '相同' }] }),
    ).toThrow();
  });

  it('returns the initial reveal timer through the generic module contract', () => {
    const module = createUndercoverModule(wordBank);
    const initial = module.createInitialState(context(10_000), players(4), {
      speakingDurationSeconds: 30,
      votingDurationSeconds: 60,
    });
    expect(initial.state.phase).toBe('word_reveal');
    expect(initial.state.deadlineAt).toBe(40_000);
    expect(initial.effects).toEqual([
      {
        type: 'schedule_timer',
        timerId: 'undercover:word-reveal:1',
        deadlineAt: 40_000,
        action: { type: 'word_reveal_timeout', timerId: 'undercover:word-reveal:1' },
      },
    ]);
  });

  it('assigns exactly the required roles for every supported player count', () => {
    fc.assert(
      fc.property(fc.integer({ min: 4, max: 12 }), fc.integer(), (count, seed) => {
        const { state } = newGame(count, new SeededRandom(seed));
        const assigned = Object.values(state.players);
        expect(assigned).toHaveLength(count);
        expect(assigned.filter(({ role }) => role === 'undercover')).toHaveLength(getUndercoverCount(count));
        expect(new Set(state.speakingOrder).size).toBe(count);
        expect(UndercoverStateSchema.safeParse(state).success).toBe(true);
      }),
    );
  });

  it('rejects invalid player counts and duplicate seats', () => {
    const module = createUndercoverModule(wordBank);
    expect(() =>
      module.createInitialState(context(0), players(3), {
        speakingDurationSeconds: 60,
        votingDurationSeconds: 45,
      }),
    ).toThrow();
    expect(() =>
      module.createInitialState(context(0), [player(1), player(1), player(2), player(3)], {
        speakingDurationSeconds: 60,
        votingDurationSeconds: 45,
      }),
    ).toThrow();
  });

  it('rejects snapshots whose active phase timer is missing or belongs to another phase', () => {
    const { module, state } = newGame();
    expect(module.migrateSnapshot?.(1, state)).toEqual(state);
    expect(() =>
      module.migrateSnapshot?.(1, {
        ...state,
        phase: 'vote_result',
        deadlineAt: null,
        currentTimerId: null,
        lastVoteResult: { kind: 'no_elimination', runoffCandidates: [] },
        nextPhaseAfterVoteResult: 'speaking',
      }),
    ).toThrow();
    expect(() =>
      module.migrateSnapshot?.(1, {
        ...state,
        phase: 'voting',
        currentTimerId: 'undercover:speaking:1:0:p1',
      }),
    ).toThrow();
    expect(() =>
      module.migrateSnapshot?.(1, {
        ...state,
        phase: 'game_over',
        winner: 'civilian',
        endReason: 'normal',
      }),
    ).toThrow();
  });
});

describe('word reveal and speaking', () => {
  it('moves immediately after all online players confirm and keeps confirmation idempotent', () => {
    const { module, state } = newGame();
    const once = reduceOk(module, state, playerActor(player(1)), { type: 'confirm_word' });
    const twice = reduceOk(module, once, playerActor(player(1)), { type: 'confirm_word' });
    expect(twice).toEqual(once);
    const final = [player(2), player(3), player(4)].reduce(
      (current, id) => reduceOk(module, current, playerActor(id), { type: 'confirm_word' }),
      twice,
    );
    expect(final.phase).toBe('speaking');
    expect(final.deadlineAt).toBe(62_000);
  });

  it('does not let an offline player block reveal and ignores stale timers', () => {
    const { module, state } = newGame();
    let current = reduceOk(
      module,
      state,
      adminActor,
      connectionChanged(player(4), false, 1),
    );
    for (const id of [player(1), player(2), player(3)]) {
      current = reduceOk(module, current, playerActor(id), { type: 'confirm_word' });
    }
    expect(current.phase).toBe('speaking');
    const stale = reduceOk(
      module,
      current,
      recoveryActor,
      { type: 'word_reveal_timeout', timerId: 'undercover:word-reveal:1' },
    );
    expect(stale).toEqual(current);
  });

  it('rejects a matching timer before its persisted deadline', () => {
    const { module, state } = newGame();
    const result = module.reduce(context(30_999), state, timerActor, {
      type: 'word_reveal_timeout',
      timerId: state.currentTimerId as string,
    });
    expect(result).toMatchObject({ ok: false, code: 'TIMER_NOT_DUE' });
  });

  it('chooses the next surviving seat when the random first speaker forfeits before reveal ends', () => {
    const { module, state } = newGame(8);
    let current = reduceOk(module, state, adminActor, connectionChanged(player(1), false, 1));
    current = reduceOk(module, current, adminActor, playersForfeited([player(1)]));
    expect(current.phase).toBe('word_reveal');
    current = fireCurrentTimer(module, current, 31_000);
    expect(current.phase).toBe('speaking');
    expect(current.roundStarterPlayerId).toBe(player(2));
    expect(current.speakingOrder).not.toContain(player(1));
  });

  it('allows only the current speaker, treats completed repeats as idempotent, and times out in order', () => {
    const { module, state } = newGame();
    let current = confirmEveryone(module, state);
    const wrong = module.reduce(context(3_000), current, playerActor(player(2)), { type: 'finish_speech' });
    expect(wrong).toMatchObject({ ok: false, code: 'ACTION_NOT_ALLOWED' });
    const first = current.speakingOrder[0] as PlayerId;
    current = reduceOk(module, current, playerActor(first), { type: 'finish_speech' });
    const repeated = reduceOk(module, current, playerActor(first), { type: 'finish_speech' });
    expect(repeated).toEqual(current);
    let timerNow = 100_000;
    while (current.phase === 'speaking') {
      current = fireCurrentTimer(module, current, timerNow);
      timerNow += 60_000;
    }
    expect(current.phase).toBe('voting');
  });

  it('rotates the next round starter clockwise from the prior starter', () => {
    const { module, state } = newGame();
    let current = finishSpeakingRound(module, confirmEveryone(module, state));
    current = fireCurrentTimer(module, current, 100_000);
    expect(current.phase).toBe('vote_result');
    current = fireCurrentTimer(module, current, 106_000);
    expect(current.phase).toBe('speaking');
    expect(current.round).toBe(2);
    expect(current.roundStarterPlayerId).toBe(player(2));
  });
});

describe('voting, runoff, and outcomes', () => {
  it('property-checks vote target legality for every player pairing', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 4 }),
        fc.integer({ min: 1, max: 4 }),
        (voterIndex, targetIndex) => {
          const { module, state } = newGame();
          const voting = finishSpeakingRound(module, confirmEveryone(module, state));
          const result = module.reduce(context(10_000), voting, playerActor(player(voterIndex)), {
            type: 'lock_vote',
            targetPlayerId: player(targetIndex),
          });
          if (voterIndex === targetIndex) {
            expect(result).toMatchObject({ ok: false, code: 'INVALID_VOTE_TARGET' });
          } else {
            expect(result.ok).toBe(true);
            if (result.ok) expect(result.state.votes[player(voterIndex)]).toBe(player(targetIndex));
          }
        },
      ),
      { numRuns: 32 },
    );
  });

  it('locks a valid vote and rejects self-votes, dead targets, and vote changes', () => {
    const { module, state } = newGame();
    let current = finishSpeakingRound(module, confirmEveryone(module, state));
    expect(
      module.reduce(context(0), current, playerActor(player(1)), {
        type: 'lock_vote',
        targetPlayerId: player(1),
      }),
    ).toMatchObject({ ok: false, code: 'INVALID_VOTE_TARGET' });
    current = reduceOk(module, current, playerActor(player(1)), {
      type: 'lock_vote',
      targetPlayerId: player(2),
    });
    expect(current.votes).toEqual({ p1: 'p2' });
    expect(
      module.reduce(context(0), current, playerActor(player(1)), {
        type: 'lock_vote',
        targetPlayerId: player(3),
      }),
    ).toMatchObject({ ok: false, code: 'VOTE_ALREADY_LOCKED' });
  });

  it('rejects a previously eliminated target in a later voting round', () => {
    const { module, state } = newGame();
    let current = finishSpeakingRound(module, confirmEveryone(module, state));
    const eliminateCivilian: Array<[PlayerId, PlayerId]> = [
      [player(1), player(2)],
      [player(2), player(1)],
      [player(3), player(2)],
      [player(4), player(2)],
    ];
    for (const [voter, target] of eliminateCivilian) {
      current = reduceOk(module, current, playerActor(voter), { type: 'lock_vote', targetPlayerId: target });
    }
    current = fireCurrentTimer(module, current, current.deadlineAt as number);
    current = finishSpeakingRound(module, current);
    expect(
      module.reduce(context(200_000), current, playerActor(player(1)), {
        type: 'lock_vote',
        targetPlayerId: player(2),
      }),
    ).toMatchObject({ ok: false, code: 'INVALID_VOTE_TARGET' });
  });

  it('settles early, displays the result for exactly five seconds, and ends with civilians winning', () => {
    const { module, state } = newGame();
    let current = finishSpeakingRound(module, confirmEveryone(module, state));
    const ballot: Array<[PlayerId, PlayerId]> = [
      [player(1), player(2)],
      [player(2), player(1)],
      [player(3), player(1)],
      [player(4), player(1)],
    ];
    for (const [voter, target] of ballot) {
      current = reduceOk(module, current, playerActor(voter), { type: 'lock_vote', targetPlayerId: target }, 50_000);
    }
    expect(current.phase).toBe('vote_result');
    expect(current.deadlineAt).toBe(55_000);
    expect(current.lastVoteResult).toMatchObject({
      kind: 'eliminated',
      eliminatedPlayerId: player(1),
      eliminatedRole: 'undercover',
    });
    const eliminatedView = module.getPlayerView(current, player(1));
    const survivingView = module.getPlayerView(current, player(2));
    const spectatorView = module.getSpectatorView(current);
    expect(eliminatedView.self.revealedRole).toBe('undercover');
    expect(survivingView.players[player(1)]?.revealedRole).toBe('undercover');
    expect(spectatorView.players[player(1)]?.revealedRole).toBe('undercover');
    expect(JSON.stringify(spectatorView)).not.toContain(current.undercoverWord);
    expect(module.getResult(current)).toBeNull();
    current = fireCurrentTimer(module, current, 55_000);
    expect(current.phase).toBe('game_over');
    expect(module.getResult(current)).toMatchObject({ outcome: 'civilian', winner: 'civilian' });
  });

  it('treats zero valid votes as no elimination without a runoff', () => {
    const { module, state } = newGame();
    let current = finishSpeakingRound(module, confirmEveryone(module, state));
    current = fireCurrentTimer(module, current, 100_000);
    expect(current.phase).toBe('vote_result');
    expect(current.lastVoteResult).toEqual({ kind: 'no_elimination', runoffCandidates: [] });
    expect(current.nextPhaseAfterVoteResult).toBe('speaking');
    current = fireCurrentTimer(module, current, 105_000);
    expect(current).toMatchObject({ phase: 'speaking', round: 2 });
  });

  it('runs at most one runoff and treats a second tie as no elimination', () => {
    const { module, state } = newGame();
    let current = finishSpeakingRound(module, confirmEveryone(module, state));
    const tie: Array<[PlayerId, PlayerId]> = [
      [player(1), player(2)],
      [player(2), player(1)],
      [player(3), player(2)],
      [player(4), player(1)],
    ];
    for (const [voter, target] of tie) {
      current = reduceOk(module, current, playerActor(voter), { type: 'lock_vote', targetPlayerId: target });
    }
    expect(current.lastVoteResult).toEqual({
      kind: 'runoff',
      runoffCandidates: [player(1), player(2)],
    });
    current = fireCurrentTimer(module, current, 20_000);
    expect(current.phase).toBe('runoff_voting');
    for (const [voter, target] of tie) {
      current = reduceOk(module, current, playerActor(voter), { type: 'lock_vote', targetPlayerId: target });
    }
    expect(current.phase).toBe('vote_result');
    expect(current.lastVoteResult).toEqual({ kind: 'no_elimination', runoffCandidates: [] });
    expect(current.nextPhaseAfterVoteResult).toBe('speaking');
  });

  it('treats a runoff with zero valid votes as no elimination', () => {
    const { module, state } = newGame();
    let current = finishSpeakingRound(module, confirmEveryone(module, state));
    const tie: Array<[PlayerId, PlayerId]> = [
      [player(1), player(2)],
      [player(2), player(1)],
      [player(3), player(2)],
      [player(4), player(1)],
    ];
    for (const [voter, target] of tie) {
      current = reduceOk(module, current, playerActor(voter), { type: 'lock_vote', targetPlayerId: target });
    }
    current = fireCurrentTimer(module, current, current.deadlineAt as number);
    expect(current.phase).toBe('runoff_voting');
    current = fireCurrentTimer(module, current, current.deadlineAt as number);
    expect(current).toMatchObject({
      phase: 'vote_result',
      lastVoteResult: { kind: 'no_elimination', runoffCandidates: [] },
      nextPhaseAfterVoteResult: 'speaking',
    });
  });

  it('declares undercover victory at parity for both one- and two-undercover games', () => {
    for (const [count, forfeited] of [
      [4, [player(2), player(3)]],
      [8, [player(3), player(4), player(5), player(6)]],
    ] as const) {
      const { module, state } = newGame(count);
      let current = state;
      for (const id of forfeited) {
        current = reduceOk(module, current, adminActor, connectionChanged(id, false, 1));
      }
      current = reduceOk(module, current, adminActor, playersForfeited(forfeited));
      expect(current).toMatchObject({ phase: 'game_over', winner: 'undercover', endReason: 'normal' });
      expect(module.getResult(current)).toMatchObject({ outcome: 'undercover', winner: 'undercover' });
    }
  });

  it('ignores stale forfeitures after reconnect and rechecks deferred generations at settlement', () => {
    const { module, state } = newGame();
    let current = finishSpeakingRound(module, confirmEveryone(module, state));
    current = reduceOk(module, current, adminActor, connectionChanged(player(1), false, 1));
    current = reduceOk(module, current, adminActor, playersForfeited([player(1)], 1));
    expect(current.pendingForfeits).toEqual([
      { playerId: player(1), reservationGeneration: 1 },
    ]);
    current = reduceOk(module, current, adminActor, connectionChanged(player(1), true, 2));
    const beforeStaleReplay = structuredClone(current);
    current = reduceOk(module, current, recoveryActor, playersForfeited([player(1)], 1));
    expect(current).toEqual(beforeStaleReplay);
    current = fireCurrentTimer(module, current, current.deadlineAt as number);
    expect(current.players[player(1)]).toMatchObject({
      alive: true,
      online: true,
      reservationGeneration: 2,
    });
    expect(current.pendingForfeits).toEqual([]);
  });

  it('keeps locked votes valid, then applies deferred forfeits as one safe-point batch', () => {
    const { module, state } = newGame();
    let current = finishSpeakingRound(module, confirmEveryone(module, state));
    current = reduceOk(module, current, playerActor(player(1)), {
      type: 'lock_vote',
      targetPlayerId: player(2),
    });
    current = reduceOk(module, current, adminActor, connectionChanged(player(1), false, 1));
    current = reduceOk(module, current, adminActor, playersForfeited([player(1)]));
    expect(current.pendingForfeits).toEqual([
      { playerId: player(1), reservationGeneration: 1 },
    ]);
    expect(current.players[player(1)]?.alive).toBe(true);
    current = fireCurrentTimer(module, current, 100_000);
    expect(current.lastVoteResult).toMatchObject({ kind: 'eliminated', eliminatedPlayerId: player(2) });
    expect(current.players[player(1)]).toMatchObject({ alive: false, exitReason: 'disconnect_timeout' });
    expect(current.players[player(2)]).toMatchObject({ alive: false, exitReason: 'voted_out' });
  });

  it('batch-forfeits before checking outcomes and aborts when nobody is online', () => {
    const { module, state } = newGame();
    let current = state;
    for (const id of players(4)) {
      current = reduceOk(module, current, adminActor, connectionChanged(id, false, 1));
    }
    current = reduceOk(module, current, adminActor, playersForfeited(players(4)));
    expect(current).toMatchObject({ phase: 'game_over', endReason: 'aborted', winner: null });
    expect(module.getResult(current)).toMatchObject({ outcome: 'aborted', winner: null });
  });

  it('keeps the fixed vote-result display when an immediate forfeiture decides the winner', () => {
    const { module, state } = newGame();
    let current = finishSpeakingRound(module, confirmEveryone(module, state));
    current = fireCurrentTimer(module, current, 100_000);
    expect(current).toMatchObject({ phase: 'vote_result', deadlineAt: 105_000 });
    current = reduceOk(module, current, adminActor, connectionChanged(player(1), false, 1), 101_000);
    current = reduceOk(module, current, adminActor, playersForfeited([player(1)]), 101_000);
    expect(current).toMatchObject({
      phase: 'vote_result',
      deadlineAt: 105_000,
      winner: 'civilian',
      nextPhaseAfterVoteResult: 'game_over',
    });
    current = fireCurrentTimer(module, current, 105_000);
    expect(current).toMatchObject({ phase: 'game_over', winner: 'civilian', endReason: 'normal' });
  });
});

describe('views, determinism, and terminal immutability', () => {
  it('property-checks that every pre-result player view isolates all live roles', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 4, max: 12 }),
        fc.integer(),
        fc.integer({ min: 0, max: 11 }),
        (count, seed, rawViewerIndex) => {
          const { module, state } = newGame(count, new SeededRandom(seed));
          const viewer = players(count)[rawViewerIndex % count] as PlayerId;
          const view = module.getPlayerView(state, viewer);
          expect(view.self).not.toHaveProperty('revealedRole');
          for (const publicPlayer of Object.values(view.players)) {
            expect(publicPlayer).not.toHaveProperty('revealedRole');
          }
          const spectator = module.getSpectatorView(state);
          expect(Object.values(spectator.players).every((entry) => !('revealedRole' in entry))).toBe(true);
          expect(spectator.result).toBeNull();
        },
      ),
      { numRuns: 40 },
    );
  });

  it('constructs player and spectator allowlist views without pre-result secret leakage', () => {
    const { module, state } = newGame();
    const spectator = module.getSpectatorView(state);
    expect(JSON.stringify(spectator)).not.toContain(state.civilianWord);
    expect(JSON.stringify(spectator)).not.toContain(state.undercoverWord);
    expect(JSON.stringify(spectator)).not.toContain('undercover');

    for (const id of players(4)) {
      const view = module.getPlayerView(state, id);
      const self = state.players[id];
      expect(view.self.word).toBe(self?.role === 'undercover' ? state.undercoverWord : state.civilianWord);
      expect(view.self).not.toHaveProperty('revealedRole');
      for (const [otherId, publicPlayer] of Object.entries(view.players)) {
        if (otherId !== id) expect(publicPlayer).not.toHaveProperty('revealedRole');
      }
      expect(JSON.stringify(view)).not.toContain('wordBankVersion');
      expect(JSON.stringify(view)).not.toContain('seed');
    }
  });

  it('reveals both words and every role to all view classes only after game over', () => {
    const { module, state } = newGame();
    let current = finishSpeakingRound(module, confirmEveryone(module, state));
    const ballot: Array<[PlayerId, PlayerId]> = [
      [player(1), player(2)],
      [player(2), player(1)],
      [player(3), player(1)],
      [player(4), player(1)],
    ];
    for (const [voter, target] of ballot) {
      current = reduceOk(module, current, playerActor(voter), { type: 'lock_vote', targetPlayerId: target });
    }
    current = fireCurrentTimer(module, current, current.deadlineAt as number);
    expect(current.phase).toBe('game_over');
    const views = [
      ...players(4).map((id) => module.getPlayerView(current, id)),
      module.getSpectatorView(current),
    ];
    for (const view of views) {
      expect(view.result).toEqual({
        outcome: 'civilian',
        civilianWord: current.civilianWord,
        undercoverWord: current.undercoverWord,
        roles: Object.fromEntries(Object.entries(current.players).map(([id, value]) => [id, value.role])),
      });
      expect(Object.values(view.players).every(({ revealedRole }) => revealedRole !== undefined)).toBe(true);
      expect(JSON.stringify(view)).not.toContain('"votes"');
    }
  });

  it('never exposes individual ballots in any client view', () => {
    const { module, state } = newGame();
    let current = finishSpeakingRound(module, confirmEveryone(module, state));
    current = reduceOk(module, current, playerActor(player(1)), {
      type: 'lock_vote',
      targetPlayerId: player(2),
    });
    const playerJson = JSON.stringify(module.getPlayerView(current, player(3)));
    const spectatorJson = JSON.stringify(module.getSpectatorView(current));
    expect(playerJson).not.toContain('votes');
    expect(playerJson).not.toContain('targetPlayerId');
    expect(spectatorJson).not.toContain('votes');
    expect(module.getPlayerView(current, player(3)).voteProgress).toEqual({ locked: 1, eligible: 4 });
  });

  it('replays deterministically for equal seed, clock, and action sequence', () => {
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        const left = newGame(8, new SeededRandom(seed));
        const right = newGame(8, new SeededRandom(seed));
        let leftState = confirmEveryone(left.module, left.state);
        let rightState = confirmEveryone(right.module, right.state);
        leftState = finishSpeakingRound(left.module, leftState);
        rightState = finishSpeakingRound(right.module, rightState);
        leftState = fireCurrentTimer(left.module, leftState, 200_000);
        rightState = fireCurrentTimer(right.module, rightState, 200_000);
        leftState = fireCurrentTimer(left.module, leftState, 205_000);
        rightState = fireCurrentTimer(right.module, rightState, 205_000);
        expect(rightState).toEqual(leftState);
        expect(right.module.getResult(rightState)).toEqual(left.module.getResult(leftState));
      }),
      { numRuns: 40 },
    );
  });

  it('does not mutate input states while reducing', () => {
    const { module, state } = newGame();
    const before = structuredClone(state);
    module.reduce(context(2_000), state, playerActor(player(1)), { type: 'confirm_word' });
    expect(state).toEqual(before);
  });

  it('does not mutate inputs across speech, voting, timeout, connection, and forfeiture transitions', () => {
    const { module, state } = newGame();
    let current = confirmEveryone(module, state);
    const speakingInput = current;
    const speakingBefore = structuredClone(current);
    const speaker = current.speakingOrder[current.currentSpeakerIndex] as PlayerId;
    current = reduceOk(module, current, playerActor(speaker), { type: 'finish_speech' });
    expect(speakingInput).toEqual(speakingBefore);

    current = finishSpeakingRound(module, current);
    const votingBefore = structuredClone(current);
    const voted = reduceOk(module, current, playerActor(player(1)), {
      type: 'lock_vote',
      targetPlayerId: player(2),
    });
    expect(current).toEqual(votingBefore);

    const disconnectBefore = structuredClone(voted);
    const disconnected = reduceOk(module, voted, adminActor, connectionChanged(player(1), false, 1));
    expect(voted).toEqual(disconnectBefore);

    const forfeitBefore = structuredClone(disconnected);
    reduceOk(module, disconnected, adminActor, playersForfeited([player(1)]));
    expect(disconnected).toEqual(forfeitBefore);

    const timeoutBefore = structuredClone(current);
    fireCurrentTimer(module, current, current.deadlineAt as number);
    expect(current).toEqual(timeoutBefore);
  });

  it('keeps game-over results immutable under every parsed action family', () => {
    const { module, state } = newGame();
    let terminal = finishSpeakingRound(module, confirmEveryone(module, state));
    const ballot: Array<[PlayerId, PlayerId]> = [
      [player(1), player(2)],
      [player(2), player(1)],
      [player(3), player(1)],
      [player(4), player(1)],
    ];
    for (const [voter, target] of ballot) {
      terminal = reduceOk(module, terminal, playerActor(voter), { type: 'lock_vote', targetPlayerId: target });
    }
    terminal = fireCurrentTimer(module, terminal, 100_000);
    const result = module.getResult(terminal);
    const snapshot = structuredClone(terminal);
    const actions: UndercoverAction[] = [
      { type: 'confirm_word' },
      { type: 'finish_speech' },
      { type: 'lock_vote', targetPlayerId: player(2) },
      connectionChanged(player(1), false, 1),
      playersForfeited([player(1)]),
      { type: 'speech_timeout', timerId: 'stale' },
    ];
    for (const action of actions) {
      const actor = action.type.startsWith('player_') ? adminActor : playerActor(player(1));
      expect(module.reduce(context(200_000), terminal, actor, action).ok).toBe(false);
      expect(terminal).toEqual(snapshot);
      expect(module.getResult(terminal)).toEqual(result);
    }
  });

  it('property-checks terminal immutability for arbitrary valid action shapes', () => {
    const { module, state } = newGame();
    let terminal = finishSpeakingRound(module, confirmEveryone(module, state));
    const ballot: Array<[PlayerId, PlayerId]> = [
      [player(1), player(2)],
      [player(2), player(1)],
      [player(3), player(1)],
      [player(4), player(1)],
    ];
    for (const [voter, target] of ballot) {
      terminal = reduceOk(module, terminal, playerActor(voter), { type: 'lock_vote', targetPlayerId: target });
    }
    terminal = fireCurrentTimer(module, terminal, 100_000);
    const snapshot = structuredClone(terminal);
    const expectedResult = module.getResult(terminal);
    const actionArbitrary = fc.oneof(
      fc.constant<UndercoverAction>({ type: 'confirm_word' }),
      fc.constant<UndercoverAction>({ type: 'finish_speech' }),
      fc.integer({ min: 1, max: 4 }).map(
        (target): UndercoverAction => ({ type: 'lock_vote', targetPlayerId: player(target) }),
      ),
      fc.record({
        playerIndex: fc.integer({ min: 1, max: 4 }),
        online: fc.boolean(),
      }).map(
        ({ playerIndex, online }): UndercoverAction => ({
          type: 'player_connection_changed',
          playerId: player(playerIndex),
          online,
          reservationGeneration: 1,
        }),
      ),
      fc
        .uniqueArray(fc.integer({ min: 1, max: 4 }), { minLength: 1, maxLength: 4 })
        .map((ids): UndercoverAction => playersForfeited(ids.map(player))),
      fc.constantFrom<UndercoverAction>(
        { type: 'word_reveal_timeout', timerId: 'stale' },
        { type: 'speech_timeout', timerId: 'stale' },
        { type: 'voting_timeout', timerId: 'stale' },
        { type: 'vote_result_timeout', timerId: 'stale' },
      ),
    );
    fc.assert(
      fc.property(actionArbitrary, (action) => {
        const actor: Actor =
          action.type === 'confirm_word' || action.type === 'finish_speech' || action.type === 'lock_vote'
            ? playerActor(player(1))
            : adminActor;
        expect(module.reduce(context(200_000), terminal, actor, action).ok).toBe(false);
        expect(terminal).toEqual(snapshot);
        expect(module.getResult(terminal)).toEqual(expectedResult);
      }),
      { numRuns: 50 },
    );
  });
});
