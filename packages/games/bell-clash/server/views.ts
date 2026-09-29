import { z } from 'zod';
import { COLORS } from './types.ts';
import type {
  BellClashPlayerView,
  BellClashPublicView,
  BellClashState,
} from './types.ts';

const pid = z.string().min(1).max(64);

const bellClashCardSchema = z
  .object({
    kind: z.enum(['number', 'phrase']),
    color: z.enum(COLORS),
    number: z.number().int().min(1).max(8).optional(),
    phrase: z.string().min(1).optional(),
  })
  .strict();

const challengeSchema = z
  .object({
    claimantId: pid,
    card: z
      .object({
        kind: z.literal('phrase'),
        color: z.enum(COLORS),
        phrase: z.string().min(1),
      })
      .strict(),
    voterIds: z.array(pid),
    doubtIds: z.array(pid),
    confirmIds: z.array(pid),
  })
  .strict()
  .nullable();

const bellClashPublicViewSchema = z
  .object({
    gameId: z.literal('bell-clash'),
    rulesetId: z.literal('bell_clash_v1'),
    schemaVersion: z.literal(1),
    phase: z.enum(['playing', 'game_over']),
    players: z.array(pid),
    handCounts: z.record(pid, z.number().int().nonnegative()),
    currentPlayerId: pid,
    discardTop: bellClashCardSchema.nullable(),
    challenge: challengeSchema,
    drawCount: z.number().int().nonnegative(),
    winners: z.array(pid),
    /** 当前计时截止时刻；终局为 null */
    deadlineAt: z.number().nullable(),
    /** 截止时刻的类别：回合 or 质疑判定 */
    deadlineKind: z.enum(['turn', 'challenge']).nullable(),
  })
  .strict();

const bellClashPlayerViewSchema = bellClashPublicViewSchema.extend({
  me: z
    .object({ playerId: pid, hand: z.array(bellClashCardSchema) })
    .strict()
    .nullable(),
});

function parseOrThrow<T>(schema: z.ZodType<unknown>, input: unknown, label: string): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0]!;
    throw new Error(issue.code === 'unrecognized_keys' ? `${label} 字段无效` : issue.message);
  }
  return result.data as T;
}

function buildPublicView(state: BellClashState): BellClashPublicView {
  const handCounts: Record<string, number> = {};
  for (const id of state.players) handCounts[id] = state.hands[id]!.length;

  const challenge = state.challenge
    ? {
        claimantId: state.challenge.claimantId,
        card: {
          kind: 'phrase' as const,
          color: state.challenge.card.color,
          phrase: state.challenge.card.phrase,
        },
        voterIds: [...state.challenge.voters],
        doubtIds: [...state.challenge.doubts],
        confirmIds: [...state.challenge.confirms],
      }
    : null;

  return {
    gameId: 'bell-clash',
    rulesetId: 'bell_clash_v1',
    schemaVersion: 1,
    phase: state.phase,
    players: [...state.players],
    handCounts,
    currentPlayerId: state.currentPlayerId,
    discardTop: state.discardTop ? { ...state.discardTop } : null,
    challenge,
    drawCount: state.drawPile.length,
    winners: [...state.winners],
    deadlineAt: state.deadlineAt ?? null,
    deadlineKind: state.deadlineKind ?? null,
  };
}

export function buildBellClashPlayerView(
  state: BellClashState,
  playerId: string,
): BellClashPlayerView {
  const base = buildPublicView(state);
  if (!state.players.includes(playerId)) return { ...base, me: null };
  return {
    ...base,
    me: {
      playerId,
      hand: state.hands[playerId]!.map((card) => ({ ...card })),
    },
  };
}

export function buildBellClashSpectatorView(state: BellClashState): BellClashPublicView {
  return buildPublicView(state);
}

export function parseBellClashSpectatorView(input: unknown): BellClashPublicView {
  return parseOrThrow<BellClashPublicView>(bellClashPublicViewSchema, input, 'Ding 视图');
}

export function parseBellClashPlayerView(input: unknown): BellClashPlayerView {
  return parseOrThrow<BellClashPlayerView>(bellClashPlayerViewSchema, input, 'Ding 玩家视图');
}
