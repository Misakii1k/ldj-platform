import { z } from 'zod';
import { caseCardSchema } from './schemas.ts';
import type {
  CaseCard,
  GooseRelayPlayerView,
  GooseRelayPublicView,
  GooseRelayState,
} from './types.ts';

const pid = z.string().min(1).max(64);
const phaseEnum = z.enum(['case_view', 'relay', 'discussion', 'accusation', 'vote', 'game_over']);

const accusationSchema = z
  .object({ playerId: pid, correct: z.boolean() })
  .strict();

const gooseRelayRevealSchema = z
  .object({
    case: caseCardSchema,
    transmissions: z.array(caseCardSchema),
    evilGeese: z.array(pid),
    accusations: z.array(
      z
        .object({ playerId: pid, guess: caseCardSchema, correct: z.boolean() })
        .strict(),
    ),
    voteCounts: z.record(pid, z.number().int().nonnegative()),
    caseMatched: z.boolean(),
    evilIdentified: z.boolean(),
  })
  .strict();

const gooseRelayPublicViewSchema = z
  .object({
    gameId: z.literal('goose-relay'),
    rulesetId: z.literal('goose_relay_classic_v1'),
    schemaVersion: z.literal(1),
    phase: phaseEnum,
    players: z.array(pid),
    lineOrder: z.array(pid),
    currentIndex: z.number().int().nonnegative(),
    currentAccuserIndex: z.number().int().nonnegative(),
    evilCount: z.number().int().nonnegative(),
    transmissions: z.array(caseCardSchema).nullable(),
    accusations: z.array(accusationSchema).nullable(),
    caseMatched: z.boolean().nullable(),
    votesCast: z.number().int().nonnegative(),
    winners: z.array(pid),
    reveal: gooseRelayRevealSchema.nullable(),
  })
  .strict();

const gooseRelayPlayerViewSchema = gooseRelayPublicViewSchema.extend({
  me: z
    .object({
      playerId: pid,
      role: z.enum(['head', 'evil', 'white']).nullable(),
      observed: caseCardSchema.nullable(),
    })
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

function countVotes(state: GooseRelayState): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const target of Object.values(state.votes)) {
    counts[target] = (counts[target] ?? 0) + 1;
  }
  return counts;
}

function buildPublicView(state: GooseRelayState): GooseRelayPublicView {
  const votesCast = Object.keys(state.votes).length;
  return {
    gameId: 'goose-relay',
    rulesetId: 'goose_relay_classic_v1',
    schemaVersion: 1,
    phase: state.phase,
    players: [...state.players],
    lineOrder: [...state.lineOrder],
    currentIndex: state.currentIndex,
    currentAccuserIndex: state.currentAccuserIndex,
    evilCount: state.evilGeese.length,
    transmissions:
      state.phase === 'case_view' || state.phase === 'relay'
        ? null
        : state.transmissions
            .filter((c): c is CaseCard => c !== null)
            .map((card) => ({ ...card })),
    accusations:
      state.phase === 'case_view' || state.phase === 'relay' || state.phase === 'discussion'
        ? null
        : state.accusations.map((a) => ({ playerId: a.playerId, correct: a.correct })),
    caseMatched: state.caseMatched,
    votesCast,
    winners: [...state.winners],
    reveal:
      state.phase === 'game_over'
        ? {
            case: { ...state.case },
            transmissions: state.transmissions
              .filter((c): c is CaseCard => c !== null)
              .map((card) => ({ ...card })),
            evilGeese: [...state.evilGeese],
            accusations: state.accusations.map((a) => ({ ...a, guess: { ...a.guess } })),
            voteCounts: countVotes(state),
            caseMatched: state.caseMatched ?? false,
            evilIdentified: state.evilIdentified ?? false,
          }
        : null,
  };
}

function buildPlayerMe(state: GooseRelayState, playerId: string): GooseRelayPlayerView['me'] {
  const index = state.lineOrder.indexOf(playerId);
  if (index === -1) return null;
  const role = index === 0 ? 'head' : state.evilGeese.includes(playerId) ? 'evil' : 'white';
  let observed: CaseCard | null = null;
  if (state.phase === 'case_view' || state.phase === 'relay') {
    if (index === 0) {
      // 头鹅读卡后始终掌握原始案情
      observed = { ...state.case };
    } else if (state.phase === 'relay' && index === state.currentIndex) {
      const previous = state.transmissions[index - 1];
      if (previous != null) observed = { ...previous };
    }
  }
  return { playerId, role, observed };
}

export function buildGooseRelayPlayerView(
  state: GooseRelayState,
  playerId: string,
): GooseRelayPlayerView {
  return {
    ...buildPublicView(state),
    me: buildPlayerMe(state, playerId),
  };
}

export function buildGooseRelaySpectatorView(state: GooseRelayState): GooseRelayPublicView {
  return buildPublicView(state);
}

export function parseGooseRelaySpectatorView(input: unknown): GooseRelayPublicView {
  return parseOrThrow<GooseRelayPublicView>(gooseRelayPublicViewSchema, input, '以鹅传鹅 视图');
}

export function parseGooseRelayPlayerView(input: unknown): GooseRelayPlayerView {
  return parseOrThrow<GooseRelayPlayerView>(gooseRelayPlayerViewSchema, input, '以鹅传鹅 玩家视图');
}
