import { z } from 'zod';
import { CHARACTERS } from './types.ts';
import { caseCardSchema } from './schemas.ts';
import type {
  CaseCard,
  GooseRelayPlayerView,
  GooseRelayPublicView,
  GooseRelayState,
} from './types.ts';

const pid = z.string().min(1).max(64);
const phaseEnum = z.enum([
  'claim_head',
  'pick_cards',
  'relay',
  'discussion',
  'accusation',
  'vote',
  'game_over',
]);

const accusationSchema = z
  .object({ playerId: pid, correct: z.boolean() })
  .strict();

const gooseRelayRevealSchema = z
  .object({
    case: caseCardSchema,
    candidateCards: z.array(z.enum(CHARACTERS)),
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
    schemaVersion: z.literal(2),
    phase: phaseEnum,
    players: z.array(pid),
    lineOrder: z.array(pid),
    headPlayerId: pid.nullable(),
    candidateCards: z.array(z.enum(CHARACTERS)),
    currentIndex: z.number().int().nonnegative(),
    currentAccuserIndex: z.number().int().nonnegative(),
    evilCount: z.number().int().nonnegative(),
    accusations: z.array(accusationSchema),
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

function getPublicCandidateCards(state: GooseRelayState): CharacterId[] {
  if (
    state.phase === 'discussion' ||
    state.phase === 'accusation' ||
    state.phase === 'vote' ||
    state.phase === 'game_over'
  ) {
    return [...state.candidateCards];
  }
  return [];
}

function buildPublicView(state: GooseRelayState): GooseRelayPublicView {
  const votesCast = Object.keys(state.votes).length;
  return {
    gameId: 'goose-relay',
    rulesetId: 'goose_relay_classic_v1',
    schemaVersion: 2,
    phase: state.phase,
    players: [...state.players],
    lineOrder: [...state.lineOrder],
    headPlayerId: state.headPlayerId,
    candidateCards: getPublicCandidateCards(state),
    currentIndex: state.currentIndex,
    currentAccuserIndex: state.currentAccuserIndex,
    evilCount: state.evilGeese.length,
    accusations: state.accusations.map((a) => ({ playerId: a.playerId, correct: a.correct })),
    caseMatched: state.caseMatched,
    votesCast,
    winners: [...state.winners],
    reveal:
      state.phase === 'game_over'
        ? {
            case: { ...state.case },
            candidateCards: [...state.candidateCards],
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
  if (!state.players.includes(playerId)) return null;

  // 抢头鹅阶段：身份尚未分配
  if (state.phase === 'claim_head') {
    return { playerId, role: null, observed: null };
  }

  const isHead = playerId === state.headPlayerId;
  const role = isHead ? 'head' : state.evilGeese.includes(playerId) ? 'evil' : 'white';

  let observed: CaseCard | null = null;
  // 选卡之后，头鹅始终掌握案情真相卡
  if (isHead && state.phase !== 'claim_head' && state.phase !== 'pick_cards') {
    observed = { ...state.case };
  }

  return { playerId, role, observed };
}

export function buildGooseRelayPlayerView(
  state: GooseRelayState,
  playerId: string,
): GooseRelayPlayerView {
  const publicView = buildPublicView(state);
  const isHead = playerId === state.headPlayerId;

  // 选卡定案阶段：仅头鹅（首位玩家）能看到 9 张候选卡进行抽选；
  // 其他阶段在 discussion 及之后对全员公开 9 张卡，接力期间全员保密。
  let candidateCards = publicView.candidateCards;
  if (state.phase === 'pick_cards' && isHead) {
    candidateCards = [...state.candidateCards];
  }

  return {
    ...publicView,
    candidateCards,
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
