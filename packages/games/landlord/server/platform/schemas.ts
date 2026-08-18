/** landlord_platform_v1 — strict zod schemas（config/action/state/views）。 */
import { z } from 'zod';

export const PLATFORM_STATE_SCHEMA_VERSION = 1;

const pid = z.string().min(1).max(64);
export const platformRankSchema = z.enum(['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2', 'SJ', 'BJ']);
const suit = z.enum(['spades', 'hearts', 'clubs', 'diamonds']);
export const platformCardSchema = z
  .object({
    id: z.string().min(1).max(64),
    rank: platformRankSchema,
    suit: suit.optional(),
  })
  .strict();
export const platformComboTypeSchema = z.enum([
  'single',
  'pair',
  'triple',
  'triple_single',
  'triple_pair',
  'straight',
  'pair_sequence',
  'bomb',
  'rocket',
]);
export const platformComboSchema = z
  .object({
    type: platformComboTypeSchema,
    mainRank: z.number().int().nonnegative(),
    length: z.number().int().positive(),
    cards: z.array(platformCardSchema).min(1).max(20),
  })
  .strict();
const bidScore = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);
const bid = z
  .object({
    playerId: pid,
    score: bidScore,
  })
  .strict();
const trick = z
  .object({
    playerId: pid,
    combo: platformComboSchema,
  })
  .strict();
const phase = z.enum(['bidding', 'playing', 'game_over']);
const team = z.enum(['landlord', 'farmers']);

export const platformConfigSchema = z
  .object({
    rulesetId: z.literal('landlord_platform_v1').optional(),
    variant: z.literal('standard').default('standard'),
  })
  .passthrough();

export const platformStateSchema = z
  .object({
    schemaVersion: z.literal(PLATFORM_STATE_SCHEMA_VERSION),
    phase,
    players: z.array(pid).length(3),
    hands: z.record(pid, z.array(platformCardSchema)),
    bottomCards: z.array(platformCardSchema).length(3),
    bids: z.array(bid),
    currentBidderId: pid.nullable(),
    landlordId: pid.nullable(),
    currentPlayerId: pid.nullable(),
    currentTrick: trick.nullable(),
    passCount: z.number().int().nonnegative(),
    multiplier: z.number().int().min(1),
    winnerTeam: team.nullable(),
    winnerId: pid.nullable(),
    deadlineAt: z.number().int().nullable(),
    phaseToken: z.string().max(128).nullable(),
    aborted: z.boolean(),
  })
  .strict();

export const platformActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('begin') }).strict(),
  z.object({ type: z.literal('bid_score'), score: bidScore }).strict(),
  z.object({ type: z.literal('play_combo'), cardIds: z.array(pid).min(1).max(20) }).strict(),
  z.object({ type: z.literal('pass_turn') }).strict(),
  z
    .object({
      type: z.literal('phase_timeout'),
      phase: z.enum(['bidding', 'playing']),
      token: z.string().min(1).max(128),
    })
    .strict(),
  z.object({ type: z.literal('player_forfeited'), playerIds: z.array(pid).min(1).max(3) }).strict(),
]);

// —— 视图 schema（键序与 rules.buildPlatformPublicView 完全一致，保证 round-trip 稳定） ——

const pubBase = z
  .object({
    gameId: z.literal('landlord'),
    rulesetId: z.literal('landlord_platform_v1'),
    schemaVersion: z.literal(PLATFORM_STATE_SCHEMA_VERSION),
    phase,
    players: z.array(z.object({ playerId: pid, handCount: z.number().int().nonnegative() }).strict()),
    bottomCards: z.array(platformCardSchema),
    bids: z.array(bid),
    currentBidderId: pid.nullable(),
    landlordId: pid.nullable(),
    currentPlayerId: pid.nullable(),
    currentTrick: trick.nullable(),
    passCount: z.number().int().nonnegative(),
    multiplier: z.number().int().min(1),
    winnerTeam: team.nullable(),
    winnerId: pid.nullable(),
    deadlineAt: z.number().int().nullable(),
    aborted: z.boolean(),
  })
  .strict();

const me = z
  .object({
    playerId: pid,
    hand: z.array(platformCardSchema),
  })
  .strict();

export const platformPublicViewSchema = pubBase;
export const platformPlayerViewSchema = pubBase.extend({ me: me.nullable() });
export const platformSpectatorViewSchema = pubBase;
