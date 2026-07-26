import { playerIdSchema } from '@lan-party/shared';
import { z } from 'zod';

import { UndercoverConfigSchema } from '../shared/config.js';

const forbiddenObjectKeys = new Set(['__proto__', 'constructor', 'prototype']);

export const safePlayerIdSchema = playerIdSchema.refine(
  (value) => !forbiddenObjectKeys.has(value),
  'playerId uses a forbidden object key',
);

const timerIdSchema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9._:-]+$/, 'timerId contains unsupported characters');

const reservationGenerationSchema = z.number().int().nonnegative().safe();
const forfeitureReservationSchema = z
  .object({
    playerId: safePlayerIdSchema,
    reservationGeneration: reservationGenerationSchema,
  })
  .strict();
const forfeitureReservationsSchema = z
  .array(forfeitureReservationSchema)
  .max(12)
  .refine(
    (reservations) => new Set(reservations.map(({ playerId }) => playerId)).size === reservations.length,
    'forfeiture reservations must reference unique players',
  );
const uniquePlayerIdsSchema = z
  .array(safePlayerIdSchema)
  .min(1)
  .max(12)
  .refine((ids) => new Set(ids).size === ids.length, 'playerIds must be unique');

export const UndercoverActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('confirm_word') }).strict(),
  z.object({ type: z.literal('finish_speech') }).strict(),
  z.object({ type: z.literal('lock_vote'), targetPlayerId: safePlayerIdSchema }).strict(),
  z
    .object({
      type: z.literal('player_connection_changed'),
      playerId: safePlayerIdSchema,
      online: z.boolean(),
      reservationGeneration: reservationGenerationSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('player_forfeited'),
      reservations: forfeitureReservationsSchema.min(1),
    })
    .strict(),
  z.object({ type: z.literal('word_reveal_timeout'), timerId: timerIdSchema }).strict(),
  z.object({ type: z.literal('speech_timeout'), timerId: timerIdSchema }).strict(),
  z.object({ type: z.literal('voting_timeout'), timerId: timerIdSchema }).strict(),
  z.object({ type: z.literal('vote_result_timeout'), timerId: timerIdSchema }).strict(),
]);

export const UndercoverRoleSchema = z.enum(['civilian', 'undercover']);
export const UndercoverWinnerSchema = UndercoverRoleSchema;
export const UndercoverPhaseSchema = z.enum([
  'word_reveal',
  'speaking',
  'voting',
  'runoff_voting',
  'vote_result',
  'game_over',
]);

const playerStateSchema = z
  .object({
    seat: z.number().int().min(0).max(11),
    role: UndercoverRoleSchema,
    alive: z.boolean(),
    online: z.boolean(),
    reservationGeneration: reservationGenerationSchema,
    exitReason: z.enum(['voted_out', 'disconnect_timeout']).optional(),
  })
  .strict()
  .superRefine((player, ctx) => {
    if (player.alive && player.exitReason !== undefined) {
      ctx.addIssue({ code: 'custom', message: 'an alive player cannot have an exitReason' });
    }
    if (!player.alive && player.exitReason === undefined) {
      ctx.addIssue({ code: 'custom', message: 'an eliminated player requires an exitReason' });
    }
  });

const playerRecordSchema = z.record(safePlayerIdSchema, playerStateSchema);
const voteRecordSchema = z.record(safePlayerIdSchema, safePlayerIdSchema);
const playerIdListSchema = z
  .array(safePlayerIdSchema)
  .max(12)
  .refine((ids) => new Set(ids).size === ids.length, 'player ids must be unique');

export const VoteResultSummarySchema = z
  .object({
    kind: z.enum(['eliminated', 'runoff', 'no_elimination']),
    eliminatedPlayerId: safePlayerIdSchema.optional(),
    eliminatedRole: UndercoverRoleSchema.optional(),
    runoffCandidates: playerIdListSchema,
  })
  .strict()
  .superRefine((summary, ctx) => {
    if (summary.kind === 'eliminated' && summary.eliminatedPlayerId === undefined) {
      ctx.addIssue({ code: 'custom', message: 'eliminated result requires a player' });
    }
    if (summary.kind !== 'eliminated' && summary.eliminatedPlayerId !== undefined) {
      ctx.addIssue({ code: 'custom', message: 'only eliminated result may expose a player' });
    }
    if (summary.kind === 'runoff' && summary.runoffCandidates.length < 2) {
      ctx.addIssue({ code: 'custom', message: 'runoff requires at least two candidates' });
    }
    if (summary.kind !== 'runoff' && summary.runoffCandidates.length !== 0) {
      ctx.addIssue({ code: 'custom', message: 'only runoff result may expose candidates' });
    }
  });

const nullableTimerIdSchema = timerIdSchema.nullable();
const nullablePlayerIdSchema = safePlayerIdSchema.nullable();

export const UndercoverStateSchema = z
  .object({
    schemaVersion: z.literal(1),
    phase: UndercoverPhaseSchema,
    round: z.number().int().min(1),
    config: UndercoverConfigSchema,
    players: playerRecordSchema,
    speakingOrder: playerIdListSchema,
    roundStarterPlayerId: safePlayerIdSchema,
    currentSpeakerIndex: z.number().int().min(0),
    votes: voteRecordSchema,
    runoffCandidates: playerIdListSchema,
    wordConfirmations: playerIdListSchema,
    pendingForfeits: forfeitureReservationsSchema,
    civilianWord: z.string().trim().min(1).max(64),
    undercoverWord: z.string().trim().min(1).max(64),
    wordBankVersion: z.string().min(1).max(64),
    deadlineAt: z.number().int().nonnegative().safe().nullable(),
    currentTimerId: nullableTimerIdSchema,
    winner: UndercoverWinnerSchema.nullable(),
    endReason: z.enum(['normal', 'aborted']).nullable(),
    lastVoteResult: VoteResultSummarySchema.nullable(),
    nextPhaseAfterVoteResult: z.enum(['runoff_voting', 'speaking', 'game_over']).nullable(),
  })
  .strict()
  .superRefine((state, ctx) => {
    const playerEntries = Object.entries(state.players);
    const seats = playerEntries.map(([, player]) => player.seat);
    if (playerEntries.length < 4 || playerEntries.length > 12) {
      ctx.addIssue({ code: 'custom', message: 'state must contain 4 to 12 players' });
    }
    if (new Set(seats).size !== seats.length) {
      ctx.addIssue({ code: 'custom', message: 'player seats must be unique' });
    }
    const undercoverCount = playerEntries.filter(([, player]) => player.role === 'undercover').length;
    const expectedUndercoverCount = playerEntries.length >= 8 ? 2 : 1;
    if (undercoverCount !== expectedUndercoverCount) {
      ctx.addIssue({ code: 'custom', message: 'state has an invalid undercover count' });
    }
    const known = new Set(Object.keys(state.players));
    for (const id of [
      ...state.speakingOrder,
      ...state.runoffCandidates,
      ...state.wordConfirmations,
      ...state.pendingForfeits.map(({ playerId }) => playerId),
      state.roundStarterPlayerId,
    ]) {
      if (!known.has(id)) ctx.addIssue({ code: 'custom', message: `unknown player reference: ${id}` });
    }
    for (const [voter, target] of Object.entries(state.votes)) {
      if (!known.has(voter) || !known.has(target)) {
        ctx.addIssue({ code: 'custom', message: 'votes must reference known players' });
      }
      if (voter === target) ctx.addIssue({ code: 'custom', message: 'self-votes are invalid' });
      if (
        state.players[voter as keyof typeof state.players]?.alive !== true ||
        state.players[target]?.alive !== true
      ) {
        ctx.addIssue({ code: 'custom', message: 'votes must belong to and target surviving players' });
      }
      if (state.phase === 'runoff_voting' && !state.runoffCandidates.includes(target)) {
        ctx.addIssue({ code: 'custom', message: 'runoff votes must target a runoff candidate' });
      }
    }
    if (state.civilianWord === state.undercoverWord) {
      ctx.addIssue({ code: 'custom', message: 'civilian and undercover words must differ' });
    }
    if (state.phase === 'game_over') {
      if (state.endReason === null) ctx.addIssue({ code: 'custom', message: 'game_over requires an endReason' });
      if (state.endReason === 'normal' && state.winner === null) {
        ctx.addIssue({ code: 'custom', message: 'normal game_over requires a winner' });
      }
      if (state.endReason === 'aborted' && state.winner !== null) {
        ctx.addIssue({ code: 'custom', message: 'aborted game cannot have a winner' });
      }
    }
    if (state.phase !== 'game_over' && state.endReason !== null) {
      ctx.addIssue({ code: 'custom', message: 'only game_over may have an endReason' });
    }
    if (state.phase === 'vote_result') {
      if (state.lastVoteResult === null || state.nextPhaseAfterVoteResult === null) {
        ctx.addIssue({ code: 'custom', message: 'vote_result requires its result and next phase' });
      }
    }
    if (state.phase === 'speaking') {
      const alive = playerEntries.filter(([, player]) => player.alive).map(([id]) => id);
      if (
        state.speakingOrder.length !== alive.length ||
        state.speakingOrder.some((id) => state.players[id]?.alive !== true)
      ) {
        ctx.addIssue({ code: 'custom', message: 'speaking order must contain every surviving player once' });
      }
    }
    if (state.phase !== 'voting' && state.phase !== 'runoff_voting' && state.pendingForfeits.length > 0) {
      ctx.addIssue({ code: 'custom', message: 'forfeits may only be deferred during voting' });
    }
    if (state.phase !== 'vote_result' && state.nextPhaseAfterVoteResult !== null) {
      ctx.addIssue({ code: 'custom', message: 'next vote-result phase must otherwise be null' });
    }
    if (state.currentSpeakerIndex > Math.max(0, state.speakingOrder.length - 1)) {
      ctx.addIssue({ code: 'custom', message: 'currentSpeakerIndex is out of range' });
    }
    if (state.phase === 'game_over') {
      if (state.deadlineAt !== null || state.currentTimerId !== null) {
        ctx.addIssue({ code: 'custom', message: 'game_over must not retain an active timer' });
      }
      return;
    }
    if (state.deadlineAt === null || state.currentTimerId === null) {
      ctx.addIssue({ code: 'custom', message: 'every active phase requires a deadline and timer id' });
      return;
    }
    let timerMatchesPhase = false;
    switch (state.phase) {
      case 'word_reveal':
        timerMatchesPhase = state.round === 1 && state.currentTimerId === 'undercover:word-reveal:1';
        break;
      case 'speaking': {
        const speaker = state.speakingOrder[state.currentSpeakerIndex];
        timerMatchesPhase =
          speaker !== undefined &&
          state.currentTimerId ===
            `undercover:speaking:${state.round}:${state.currentSpeakerIndex}:${speaker}`;
        break;
      }
      case 'voting':
        timerMatchesPhase = state.currentTimerId === `undercover:voting:${state.round}`;
        break;
      case 'runoff_voting':
        timerMatchesPhase = state.currentTimerId === `undercover:runoff-voting:${state.round}`;
        break;
      case 'vote_result':
        timerMatchesPhase =
          state.currentTimerId === `undercover:vote-result:voting:${state.round}` ||
          state.currentTimerId === `undercover:vote-result:runoff:${state.round}`;
        break;
    }
    if (!timerMatchesPhase) {
      ctx.addIssue({ code: 'custom', message: 'timer id does not match the active game phase' });
    }
  });

export const UndercoverEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('word_confirmed'), playerId: safePlayerIdSchema }).strict(),
  z
    .object({ type: z.literal('phase_changed'), phase: UndercoverPhaseSchema, round: z.number().int().min(1) })
    .strict(),
  z
    .object({
      type: z.literal('speech_finished'),
      playerId: safePlayerIdSchema,
      reason: z.enum(['player', 'timeout']),
    })
    .strict(),
  z.object({ type: z.literal('vote_locked'), playerId: safePlayerIdSchema }).strict(),
  z.object({ type: z.literal('vote_settled'), result: VoteResultSummarySchema }).strict(),
  z.object({ type: z.literal('players_forfeited'), playerIds: uniquePlayerIdsSchema }).strict(),
  z
    .object({ type: z.literal('game_finished'), outcome: z.enum(['civilian', 'undercover', 'aborted']) })
    .strict(),
]);

const publicPlayerSchema = z
  .object({
    seat: z.number().int().min(0).max(11),
    alive: z.boolean(),
    online: z.boolean(),
    exitReason: z.enum(['voted_out', 'disconnect_timeout']).optional(),
    revealedRole: UndercoverRoleSchema.optional(),
  })
  .strict();

const commonViewFields = {
  schemaVersion: z.literal(1),
  phase: UndercoverPhaseSchema,
  round: z.number().int().min(1),
  players: z.record(safePlayerIdSchema, publicPlayerSchema),
  speakingOrder: playerIdListSchema,
  currentSpeakerId: nullablePlayerIdSchema,
  runoffCandidates: playerIdListSchema,
  deadlineAt: z.number().int().nonnegative().safe().nullable(),
  voteProgress: z.object({ locked: z.number().int().nonnegative(), eligible: z.number().int().nonnegative() }).strict(),
  voteResult: VoteResultSummarySchema.nullable(),
  result: z
    .object({
      outcome: z.enum(['civilian', 'undercover', 'aborted']),
      civilianWord: z.string().min(1),
      undercoverWord: z.string().min(1),
      roles: z.record(safePlayerIdSchema, UndercoverRoleSchema),
    })
    .strict()
    .nullable(),
} as const;

export const UndercoverPlayerViewSchema = z
  .object({
    ...commonViewFields,
    viewerKind: z.literal('player'),
    self: z
      .object({
        playerId: safePlayerIdSchema,
        word: z.string().min(1),
        revealedRole: UndercoverRoleSchema.optional(),
      })
      .strict(),
  })
  .strict();

export const UndercoverSpectatorViewSchema = z
  .object({ ...commonViewFields, viewerKind: z.literal('spectator') })
  .strict();

export const UndercoverResultSchema = z
  .object({
    outcome: z.enum(['civilian', 'undercover', 'aborted']),
    winner: UndercoverWinnerSchema.nullable(),
    round: z.number().int().min(1),
    civilianWord: z.string().min(1),
    undercoverWord: z.string().min(1),
    wordBankVersion: z.string().min(1),
    players: z.record(
      safePlayerIdSchema,
      z
        .object({
          seat: z.number().int().min(0).max(11),
          role: UndercoverRoleSchema,
          exitReason: z.enum(['voted_out', 'disconnect_timeout']).optional(),
        })
        .strict(),
    ),
  })
  .strict();

export const WordBankSchema = z
  .object({
    version: z.string().min(1).max(64),
    pairs: z
      .array(
        z
          .object({
            civilianWord: z.string().trim().min(1).max(64),
            undercoverWord: z.string().trim().min(1).max(64),
            category: z.string().trim().min(1).max(32).optional(),
            difficulty: z.string().trim().min(1).max(32).optional(),
          })
          .strict()
          .refine((pair) => pair.civilianWord !== pair.undercoverWord, 'word pair entries must differ'),
      )
      .min(1),
  })
  .strict()
  .superRefine((bank, ctx) => {
    const seen = new Set<string>();
    for (const pair of bank.pairs) {
      const key = [pair.civilianWord, pair.undercoverWord].sort().join('\u0000');
      if (seen.has(key)) ctx.addIssue({ code: 'custom', message: 'word bank contains a duplicate or reverse pair' });
      seen.add(key);
    }
  });

export type UndercoverAction = z.infer<typeof UndercoverActionSchema>;
export type UndercoverState = z.infer<typeof UndercoverStateSchema>;
export type UndercoverEvent = z.infer<typeof UndercoverEventSchema>;
export type UndercoverPlayerView = z.infer<typeof UndercoverPlayerViewSchema>;
export type UndercoverSpectatorView = z.infer<typeof UndercoverSpectatorViewSchema>;
export type UndercoverResult = z.infer<typeof UndercoverResultSchema>;
export type VoteResultSummary = z.infer<typeof VoteResultSummarySchema>;
export type WordBank = z.infer<typeof WordBankSchema>;
