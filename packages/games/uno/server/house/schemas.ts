/**
 * uno_platform_house_v1 — strict zod schemas。
 *
 * 所有对象均 .strict() 拒绝未知键。declaredColor 的"仅限 wild/wild4"语义在
 * reduce 层（模块）基于手牌内容校验；schema 层校验其为合法颜色枚举。
 */
import { z } from 'zod';
import type {
  UnoHouseAction,
  UnoHouseCard,
  UnoHouseConfig,
  UnoHouseEvent,
  UnoHouseMatchRankingEntry,
  UnoHousePendingPenalty,
  UnoHousePlayerView,
  UnoHousePublicView,
  UnoHouseResult,
  UnoHouseRoundResult,
  UnoHouseRoundState,
  UnoHouseState,
  UnoHouseUnoRaceWindow,
} from './types.ts';

export const unoHouseColorSchema = z.enum(['red', 'yellow', 'green', 'blue']);
export const unoHouseModeSchema = z.enum(['individual', 'team']);
export const unoHouseRoundCountSchema = z.union([
  z.literal(1),
  z.literal(3),
  z.literal(5),
  z.literal(7),
]);
const unoHouseActionKindSchema = z.enum(['skip', 'reverse', 'draw2']);
const unoHousePhaseSchema = z.enum(['round_playing', 'round_over', 'match_over']);
const unoHouseDirectionSchema = z.union([z.literal(1), z.literal(-1)]);

export const unoHouseCardSchema: z.ZodType<UnoHouseCard> = z.discriminatedUnion('kind', [
  z.object({
    id: z.string().min(1),
    kind: z.literal('number'),
    color: unoHouseColorSchema,
    value: z.number().int().min(0).max(9),
  }).strict(),
  z.object({
    id: z.string().min(1),
    kind: unoHouseActionKindSchema,
    color: unoHouseColorSchema,
  }).strict(),
  z.object({
    id: z.string().min(1),
    kind: z.enum(['wild', 'wild4']),
  }).strict(),
]);

export const unoHouseConfigSchema: z.ZodType<UnoHouseConfig> = z.object({
  mode: unoHouseModeSchema,
  roundCount: unoHouseRoundCountSchema,
}).strict();

export const unoHouseActionSchema: z.ZodType<UnoHouseAction> = z.discriminatedUnion('type', [
  z.object({ type: z.literal('begin') }).strict(),
  z.object({ type: z.literal('draw_card') }).strict(),
  z.object({ type: z.literal('pass_after_draw') }).strict(),
  z.object({ type: z.literal('call_uno') }).strict(),
  z.object({
    type: z.literal('play_card'),
    cardId: z.string().min(1),
    declaredColor: unoHouseColorSchema.optional(),
    preCallUno: z.boolean().optional(),
  }).strict(),
  z.object({
    type: z.literal('catch_missed_uno'),
    targetPlayerId: z.string().min(1),
    windowToken: z.string().min(1),
  }).strict(),
  z.object({
    type: z.literal('stack_penalty'),
    cardId: z.string().min(1),
    declaredColor: unoHouseColorSchema.optional(),
  }).strict(),
  z.object({ type: z.literal('accept_penalty'), windowToken: z.string().min(1) }).strict(),
  z.object({ type: z.literal('challenge_penalty'), windowToken: z.string().min(1) }).strict(),
  z.object({
    type: z.literal('turn_timeout'),
    round: z.number().int().positive(),
    turnToken: z.string().min(1),
  }).strict(),
  z.object({
    type: z.literal('penalty_timeout'),
    round: z.number().int().positive(),
    windowToken: z.string().min(1),
  }).strict(),
  z.object({
    type: z.literal('challenge_timeout'),
    round: z.number().int().positive(),
    windowToken: z.string().min(1),
  }).strict(),
  z.object({
    type: z.literal('uno_race_timeout'),
    round: z.number().int().positive(),
    windowToken: z.string().min(1),
  }).strict(),
  z.object({ type: z.literal('round_transition') }).strict(),
]);

export const unoHouseMatchRankingEntrySchema: z.ZodType<UnoHouseMatchRankingEntry> = z.object({
  playerId: z.string().min(1),
  total: z.number().int().nonnegative(),
  rank: z.number().int().positive(),
}).strict();

const unoHouseChallengeEvidenceSchema = z.object({
  heldMatchingBeforePlay: z.boolean(),
  colorBeforePlay: unoHouseColorSchema,
}).strict();

const unoHousePendingPenaltySchema: z.ZodType<UnoHousePendingPenalty> = z.object({
  total: z.number().int().positive(),
  kind: z.enum(['draw2', 'draw4']),
  responderId: z.string().min(1),
  sourcePlayerId: z.string().min(1),
  challengeable: z.boolean(),
  challengeEvidence: unoHouseChallengeEvidenceSchema.nullable(),
  windowToken: z.string().min(1),
}).strict();

const unoHouseUnoRaceWindowSchema: z.ZodType<UnoHouseUnoRaceWindow> = z.object({
  targetPlayerId: z.string().min(1),
  windowToken: z.string().min(1),
  openedAtSequence: z.number().int().nonnegative(),
  closesEarlyOnNextEffective: z.literal(true),
}).strict();

export const unoHouseRoundResultSchema: z.ZodType<UnoHouseRoundResult> = z.object({
  roundNumber: z.number().int().positive(),
  finisherPlayerId: z.string().min(1),
  perPlayerTotals: z.array(z.number().int().nonnegative()),
  teamTotals: z.array(z.number().int().nonnegative()).nullable(),
  winnerPlayerIds: z.array(z.string().min(1)),
  teamWinnerIds: z.array(z.string().min(1)).nullable(),
}).strict();

const unoHouseMatchStateSchema = z.object({
  mode: unoHouseModeSchema,
  roundCount: unoHouseRoundCountSchema,
  currentRound: z.number().int().nonnegative(),
  roundLimit: unoHouseRoundCountSchema,
  teamPlayerIds: z.record(z.string().min(1), z.string().min(1)).nullable(),
  roundScores: z.array(z.array(z.number().int().nonnegative())),
  roundResults: z.array(unoHouseRoundResultSchema),
  cumulativeScores: z.array(z.number().int().nonnegative()),
  matchRanking: z.array(unoHouseMatchRankingEntrySchema).nullable(),
  starterPlayerId: z.string().min(1).nullable(),
  lastFinisherPlayerId: z.string().min(1).nullable(),
}).strict();

const unoHouseRoundStateSchema: z.ZodType<UnoHouseRoundState> = z.object({
  roundNumber: z.number().int().positive(),
  phase: unoHousePhaseSchema,
  players: z.array(z.string().min(1)),
  hands: z.record(z.string().min(1), z.array(unoHouseCardSchema)),
  deck: z.array(unoHouseCardSchema),
  discardPile: z.array(unoHouseCardSchema),
  topDiscard: unoHouseCardSchema,
  currentColor: unoHouseColorSchema,
  direction: unoHouseDirectionSchema,
  currentPlayerId: z.string().min(1),
  hasDrawnThisTurn: z.boolean(),
  pendingPenalty: unoHousePendingPenaltySchema.nullable(),
  unoRaceWindow: unoHouseUnoRaceWindowSchema.nullable(),
  preCallPlayerIds: z.record(z.string().min(1), z.boolean()),
  deckGenerationCount: z.number().int().nonnegative(),
  turnToken: z.string().min(1),
  turnIndex: z.number().int().nonnegative(),
  sequence: z.number().int().nonnegative(),
  turnDeadlineAt: z.number().int().nonnegative().nullable(),
  windowDeadlineAt: z.number().int().nonnegative().nullable(),
}).strict();

export const unoHouseStateSchema: z.ZodType<UnoHouseState> = z.object({
  match: unoHouseMatchStateSchema,
  round: unoHouseRoundStateSchema,
}).strict();

const unoHousePlayerSummarySchema = z.object({
  playerId: z.string().min(1),
  handCount: z.number().int().nonnegative(),
  unoCalled: z.boolean(),
  isCurrentPlayer: z.boolean(),
  teamId: z.string().min(1).nullable(),
}).strict();

const unoHousePendingPenaltyPublicSchema = z.object({
  total: z.number().int().positive(),
  kind: z.enum(['draw2', 'draw4']),
  responderId: z.string().min(1),
  challengeable: z.boolean(),
  windowToken: z.string().min(1),
}).strict();

const unoHouseClockInfoSchema = z.object({
  turnDeadlineAt: z.number().int().nonnegative().nullable(),
  windowDeadlineAt: z.number().int().nonnegative().nullable(),
}).strict();

const unoHousePublicViewObjectSchema = z.object({
  gameId: z.literal('uno'),
  rulesetId: z.literal('uno_platform_house_v1'),
  phase: unoHousePhaseSchema,
  round: z.number().int().positive(),
  roundLimit: unoHouseRoundCountSchema,
  mode: unoHouseModeSchema,
  players: z.array(unoHousePlayerSummarySchema),
  topDiscard: unoHouseCardSchema,
  currentColor: unoHouseColorSchema,
  currentPlayerId: z.string().min(1),
  direction: unoHouseDirectionSchema,
  pendingPenalty: unoHousePendingPenaltyPublicSchema.nullable(),
  unoRaceWindow: unoHouseUnoRaceWindowSchema.nullable(),
  deckCount: z.number().int().nonnegative(),
  discardCount: z.number().int().nonnegative(),
  roundScores: z.array(z.array(z.number().int().nonnegative())),
  cumulativeScores: z.array(z.number().int().nonnegative()),
  matchRanking: z.array(unoHouseMatchRankingEntrySchema).nullable(),
  clockInfo: unoHouseClockInfoSchema,
}).strict();
export const unoHousePublicViewSchema: z.ZodType<UnoHousePublicView> = unoHousePublicViewObjectSchema;
export const unoHousePlayerViewSchema: z.ZodType<UnoHousePlayerView> = unoHousePublicViewObjectSchema.extend({
  me: z.object({
    playerId: z.string().min(1),
    hand: z.array(unoHouseCardSchema),
    playableCardIds: z.array(z.string().min(1)),
    capabilities: z.array(z.string().min(1)),
    hasDrawnThisTurn: z.boolean(),
    isCurrentPlayer: z.boolean(),
    activeWindow: z.string().nullable(),
  }).strict().nullable(),
}).strict();

export const unoHouseResultSchema: z.ZodType<UnoHouseResult> = z.object({
  mode: unoHouseModeSchema,
  winnerPlayerIds: z.array(z.string().min(1)),
  teamWinnerIds: z.array(z.string().min(1)).nullable().optional(),
  rounds: z.array(unoHouseRoundResultSchema),
  ranking: z.array(unoHouseMatchRankingEntrySchema),
  aborted: z.boolean().optional(),
}).strict();

export const unoHouseEventSchema: z.ZodType<UnoHouseEvent> = z.discriminatedUnion('type', [
  z.object({ type: z.literal('card_played'), playerId: z.string().min(1), card: unoHouseCardSchema }).strict(),
  z.object({ type: z.literal('card_drawn'), playerId: z.string().min(1), count: z.number().int().nonnegative() }).strict(),
  z.object({ type: z.literal('uno_called'), playerId: z.string().min(1) }).strict(),
  z.object({
    type: z.literal('missed_uno_caught'),
    targetPlayerId: z.string().min(1),
    catcherPlayerId: z.string().min(1),
    windowToken: z.string().min(1),
  }).strict(),
  z.object({
    type: z.literal('penalty_stacked'),
    playerId: z.string().min(1),
    card: unoHouseCardSchema,
    total: z.number().int().positive(),
  }).strict(),
  z.object({
    type: z.literal('penalty_accepted'),
    playerId: z.string().min(1),
    total: z.number().int().positive(),
    windowToken: z.string().min(1),
  }).strict(),
  z.object({
    type: z.literal('challenge_resolved'),
    challengerPlayerId: z.string().min(1),
    targetPlayerId: z.string().min(1),
    success: z.boolean(),
    windowToken: z.string().min(1),
  }).strict(),
  z.object({
    type: z.literal('round_finished'),
    roundNumber: z.number().int().positive(),
    roundResult: unoHouseRoundResultSchema,
  }).strict(),
  z.object({
    type: z.literal('match_finished'),
    roundNumber: z.number().int().positive(),
    result: unoHouseResultSchema,
  }).strict(),
  z.object({
    type: z.literal('phase_changed'),
    phase: unoHousePhaseSchema,
    round: z.number().int().positive(),
  }).strict(),
]);
