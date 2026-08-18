/**
 * undercover_blank_v1 — zod schemas（config/action/state/views）。
 * 严格模式：未知键一律拒绝；返回状态必须通过 state schema 校验。
 */
import { z } from 'zod';

export const BLANK_STATE_SCHEMA_VERSION = 1;

const playerIdSchema = z.string().min(1).max(64);

import type { BlankAction, BlankConfig, BlankEvent, BlankPlayerView, BlankResult, BlankSpectatorView, BlankState } from './types.ts';

export const blankConfigSchema: z.ZodType<BlankConfig, z.ZodTypeDef, unknown> = z
  .object({
    rulesetId: z.literal('undercover_blank_v1').optional(),
    speechSeconds: z.union([z.literal(30), z.literal(45), z.literal(60), z.literal(90)]).default(60),
    voteSeconds: z.union([z.literal(30), z.literal(45), z.literal(60)]).default(45),
    revealMode: z.enum(['immediate', 'delayed']).default('immediate'),
  })
  .strict();
export type BlankConfigInput = z.infer<typeof blankConfigSchema>;

// —— 动作 ——

export const blankActionSchema = z.discriminatedUnion('type', [
  // 玩家动作
  z.object({ type: z.literal('confirm_word') }).strict(),
  z.object({ type: z.literal('finish_speech') }).strict(),
  z.object({ type: z.literal('cast_vote'), targetPlayerId: playerIdSchema }).strict(),
  z
    .object({
      type: z.literal('submit_guess'),
      guess: z.string().min(1).max(128),
      sessionId: z.string().min(1).max(64).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('submit_final_guess'),
      guess: z.string().min(1).max(128),
      sessionId: z.string().min(1).max(64).optional(),
    })
    .strict(),
  z.object({ type: z.literal('skip_final_guess') }).strict(),
  // 系统动作
  z.object({ type: z.literal('begin') }).strict(),
  z.object({ type: z.literal('reveal_timeout') }).strict(),
  z
    .object({
      type: z.literal('speech_timeout'),
      round: z.number().int().positive(),
      speakerIndex: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      type: z.literal('vote_timeout'),
      round: z.number().int().positive(),
      kind: z.enum(['normal', 'runoff']),
    })
    .strict(),
  z.object({ type: z.literal('vote_result_elapsed'), round: z.number().int().positive() }).strict(),
  z.object({ type: z.literal('final_guess_timeout'), round: z.number().int().positive() }).strict(),
  z
    .object({ type: z.literal('player_forfeited'), playerIds: z.array(playerIdSchema).min(1).max(12) })
    .strict(),
  z.object({ type: z.literal('abort_game') }).strict(),
  z
    .object({
      type: z.literal('external_task_result'),
      taskId: z.string().min(1),
      expectedSequence: z.number().int().positive(),
      result: z.unknown(),
    })
    .strict(),
]);

// —— 状态 ——

export const blankRoleSchema = z.enum(['blank', 'civilian']);
export const blankWinnerSchema = z.enum(['blank', 'civilian']);
export const blankPhaseSchema = z.enum([
  'word_reveal',
  'speaking',
  'voting',
  'runoff_voting',
  'vote_result',
  'final_guess',
  'game_over',
]);

const blankPlayerEntrySchema = z
  .object({
    seat: z.number().int().nonnegative(),
    role: blankRoleSchema,
    alive: z.boolean(),
    exitReason: z.enum(['voted_out', 'disconnect_timeout', 'guess_wrong']).nullable(),
  })
  .strict();

const blankVoteSummarySchema = z
  .object({
    round: z.number().int().positive(),
    kind: z.enum(['normal', 'runoff']),
    outcome: z.enum(['eliminated', 'tie', 'no_votes', 'runoff_tie']),
    eliminatedPlayerId: playerIdSchema.nullable(),
    eliminatedRole: blankRoleSchema.nullable(),
    tally: z.record(playerIdSchema, z.number().int().positive()),
  })
  .strict();

const blankPendingOutcomeSchema = z
  .object({
    next: z.enum(['runoff', 'next_round', 'game_over']),
    candidates: z.array(playerIdSchema),
    winner: blankWinnerSchema.nullable(),
  })
  .strict();

const blankDeferredOutcomeSchema = z
  .object({
    winner: blankWinnerSchema,
    taskId: z.string().min(1),
  })
  .strict();

const blankGuessRecordSchema = z
  .object({
    taskId: z.string().min(1),
    playerId: playerIdSchema,
    submittedAtSeq: z.number().int().positive(),
    phase: z.enum(['active', 'final']),
    status: z.enum(['pending', 'resolved_equivalent', 'resolved_not_equivalent']),
    normalizedGuess: z.string().nullable(),
    normalizedStandardAnswer: z.string().nullable(),
    resolvedClassification: z.string().nullable(),
    resolvedSource: z.string().nullable(),
  })
  .strict();

export const blankStateSchema = z
  .object({
    schemaVersion: z.literal(BLANK_STATE_SCHEMA_VERSION),
    phase: blankPhaseSchema,
    round: z.number().int().nonnegative(),
    players: z.record(playerIdSchema, blankPlayerEntrySchema),
    speakingOrder: z.array(playerIdSchema),
    currentSpeakerIndex: z.number().int().nonnegative(),
    votes: z.record(playerIdSchema, playerIdSchema),
    runoffCandidates: z.array(playerIdSchema),
    civilianWord: z.string().min(1),
    deadlineAt: z.number().int().nullable(),
    winner: blankWinnerSchema.nullable(),
    config: blankConfigSchema,
    confirmedPlayerIds: z.array(playerIdSchema),
    roundFirstSpeaker: playerIdSchema.nullable(),
    lastVoteSummary: blankVoteSummarySchema.nullable(),
    pendingOutcome: blankPendingOutcomeSchema.nullable(),
    deferredOutcome: blankDeferredOutcomeSchema.nullable(),
    blankPlayerId: playerIdSchema.nullable(),
    guess: blankGuessRecordSchema.nullable(),
    taskSeq: z.number().int().nonnegative(),
    sessionId: z.string().min(0).max(64),
    aborted: z.boolean(),
  })
  .strict();

// —— 视角 ——

const blankPublicPlayerInfoSchema = z
  .object({
    playerId: playerIdSchema,
    seat: z.number().int().nonnegative(),
    alive: z.boolean(),
    exitReason: blankPlayerEntrySchema.shape.exitReason,
    revealedRole: blankRoleSchema.nullable(),
  })
  .strict();

const blankRevealSchema = z
  .object({
    civilianWord: z.string().min(1),
    roles: z.record(playerIdSchema, blankRoleSchema),
  })
  .strict();

const blankPublicViewBaseSchema = z
  .object({
    gameId: z.literal('undercover'),
    rulesetId: z.literal('undercover_blank_v1'),
    phase: blankPhaseSchema,
    round: z.number().int().nonnegative(),
    players: z.array(blankPublicPlayerInfoSchema),
    speakingOrder: z.array(playerIdSchema),
    currentSpeakerId: playerIdSchema.nullable(),
    deadlineAt: z.number().int().nullable(),
    votesSubmitted: z.number().int().nonnegative(),
    votesExpected: z.number().int().nonnegative(),
    runoffCandidates: z.array(playerIdSchema),
    confirmedPlayerIds: z.array(playerIdSchema),
    lastVoteSummary: blankVoteSummarySchema.nullable(),
    winner: blankWinnerSchema.nullable(),
    aborted: z.boolean(),
    guessPending: z.boolean(),
    revealMode: z.enum(['immediate', 'delayed']),
    reveal: blankRevealSchema.nullable(),
  })
  .strict();

const blankMeViewSchema = z
  .object({
    playerId: playerIdSchema,
    word: z.string().min(1).nullable(),
    role: blankRoleSchema.nullable(),
    alive: z.boolean(),
    confirmed: z.boolean(),
    hasVoted: z.boolean(),
    myVote: playerIdSchema.nullable(),
    isBlank: z.boolean(),
    canGuess: z.boolean(),
    canSubmitFinalGuess: z.boolean(),
    guessUsed: z.boolean(),
    guessPending: z.boolean(),
  })
  .strict();

export const blankPublicViewSchema = blankPublicViewBaseSchema;
export const blankPlayerViewSchema = blankPublicViewBaseSchema.extend({
  me: blankMeViewSchema.nullable(),
}).strict();
export const blankSpectatorViewSchema = blankPublicViewBaseSchema;
