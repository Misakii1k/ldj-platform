import { z } from 'zod';
import { LOVELETTER_ROLES } from './types.ts';
import type { LoveLetterPlayerView, LoveLetterPublicView, LoveLetterState } from './types.ts';

const pid = z.string().min(1).max(64);
const role = z.enum(LOVELETTER_ROLES);

const cardSchema = z.object({
  id: pid,
  role,
  value: z.number().int().min(1).max(8),
}).strict();

const inspectionSchema = z.object({
  viewerId: pid,
  targetPlayerId: pid,
  role,
  round: z.number().int().nonnegative(),
}).strict();

const loveLetterPublicViewSchema = z.object({
  gameId: z.literal('loveletter'),
  rulesetId: z.literal('loveletter_classic16_v1'),
  schemaVersion: z.literal(1),
  phase: z.enum(['playing', 'game_over']),
  players: z.array(z.object({
    playerId: pid,
    handCount: z.number().int().nonnegative(),
    discarded: z.array(cardSchema),
  }).strict()),
  round: z.number().int().min(1),
  deckCount: z.number().int().nonnegative(),
  removedCards: z.array(cardSchema),
  eliminatedPlayers: z.array(pid),
  protectedPlayers: z.array(pid),
  currentPlayerId: pid.nullable(),
  affection: z.record(pid, z.number().int().nonnegative()),
  affectionTarget: z.number().int().min(1),
  roundWinners: z.array(pid),
  winners: z.array(pid),
}).strict();

const loveLetterPlayerViewSchema = loveLetterPublicViewSchema.extend({
  me: z.object({
    playerId: pid,
    hand: z.array(cardSchema),
    inspections: z.array(inspectionSchema),
  }).strict().nullable(),
});

function parseOrThrow<T>(schema: z.ZodType<unknown>, input: unknown, label: string): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0]!;
    throw new Error(issue.code === 'unrecognized_keys' ? `${label} 字段无效` : issue.message);
  }
  return result.data as T;
}

function buildPublicView(state: LoveLetterState): LoveLetterPublicView {
  return {
    gameId: 'loveletter',
    rulesetId: 'loveletter_classic16_v1',
    schemaVersion: 1,
    phase: state.phase,
    players: state.players.map((playerId) => ({
      playerId,
      handCount: state.hands[playerId]?.length ?? 0,
      discarded: structuredClone(state.discardPiles[playerId] ?? []),
    })),
    round: state.round,
    deckCount: state.deck.length,
    removedCards: structuredClone(state.removedCards),
    eliminatedPlayers: [...state.eliminatedPlayers],
    protectedPlayers: [...state.protectedPlayers],
    currentPlayerId: state.currentPlayerId,
    affection: { ...state.affection },
    affectionTarget: state.affectionTarget,
    roundWinners: [...state.roundWinners],
    winners: [...state.winners],
  };
}

export function buildLoveLetterPlayerView(state: LoveLetterState, playerId: string): LoveLetterPlayerView {
  const base = buildPublicView(state);
  if (!state.players.includes(playerId)) return { ...base, me: null };
  return {
    ...base,
    me: {
      playerId,
      hand: structuredClone(state.hands[playerId] ?? []),
      inspections: structuredClone(state.inspections.filter((entry) => entry.viewerId === playerId)),
    },
  };
}

export function buildLoveLetterSpectatorView(state: LoveLetterState): LoveLetterPublicView {
  return buildPublicView(state);
}

export function parseLoveLetterSpectatorView(input: unknown): LoveLetterPublicView {
  return parseOrThrow<LoveLetterPublicView>(loveLetterPublicViewSchema, input, '情书视图');
}

export function parseLoveLetterPlayerView(input: unknown): LoveLetterPlayerView {
  return parseOrThrow<LoveLetterPlayerView>(loveLetterPlayerViewSchema, input, '情书玩家视图');
}
