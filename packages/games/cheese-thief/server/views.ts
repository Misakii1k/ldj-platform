import { z } from 'zod';
import type {
  CheeseThiefPlayerView,
  CheeseThiefPublicView,
  CheeseThiefState,
  RoleCard,
} from './types.ts';

const pid = z.string().min(1).max(64);
const hour = z.number().int().min(1).max(6);
const phaseEnum = z.enum(['hour_choice', 'night', 'accomplice_select', 'dawn', 'vote', 'game_over']);
const roleEnum = z.enum(['cat', 'dog', 'whiteMouse', 'none']);

const cheeseThiefRevealSchema = z
  .object({
    thiefId: pid.nullable(),
    stealHour: z.number().int().min(1).max(6).nullable(),
    wakeHours: z.record(pid, hour),
    accomplices: z.array(pid),
    peeks: z.array(z.object({ viewer: pid, target: pid }).strict()),
  })
  .strict();

const cheeseThiefPublicViewSchema = z
  .object({
    gameId: z.literal('cheese-thief'),
    rulesetId: z.literal('cheese_thief_classic_v1'),
    schemaVersion: z.literal(1),
    phase: phaseEnum,
    players: z.array(pid),
    mode: z.enum(['standard', 'simulator']),
    currentHour: z.number().int().min(0).max(6),
    roleCardsEnabled: z.boolean(),
    revealedCat: pid.nullable(),
    revealedDog: pid.nullable(),
    dogFirstVoter: pid.nullable(),
    thiefCaught: z.boolean().nullable(),
    winners: z.array(pid),
    reveal: cheeseThiefRevealSchema.nullable(),
  })
  .strict();

const cheeseThiefPlayerViewSchema = cheeseThiefPublicViewSchema.extend({
  me: z
    .object({
      playerId: pid,
      wakeHour: z.number().int().min(0).max(6),
      hourChoices: z.tuple([hour, hour]).nullable(),
      coWakers: z.array(pid),
      cheeseWasMissing: z.boolean(),
      isThief: z.boolean(),
      isAccomplice: z.boolean(),
      knownAccomplices: z.array(pid),
      roleCard: roleEnum,
      canPeek: z.boolean(),
      peekedHour: z
        .object({ target: pid, hour })
        .strict()
        .nullable(),
      catPeekedHour: z
        .object({ target: pid, hour })
        .strict()
        .nullable(),
      hasVoted: z.boolean(),
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

function buildPublicView(state: CheeseThiefState): CheeseThiefPublicView {
  const revealedCat =
    state.catPeekTarget !== null
      ? Object.entries(state.roleCards).find(([, r]) => r === 'cat')?.[0] ?? null
      : null;
  const revealedDog =
    state.dogFirstVoter !== null
      ? Object.entries(state.roleCards).find(([, r]) => r === 'dog')?.[0] ?? null
      : null;
  return {
    gameId: 'cheese-thief',
    rulesetId: 'cheese_thief_classic_v1',
    schemaVersion: 1,
    phase: state.phase,
    players: [...state.players],
    mode: state.config.mode ?? 'standard',
    currentHour: state.phase === 'night' ? state.currentHour : 0,
    roleCardsEnabled: state.config.roleCards,
    revealedCat,
    revealedDog,
    dogFirstVoter: state.dogFirstVoter,
    thiefCaught: state.thiefCaught,
    winners: [...state.winners],
    reveal:
      state.phase === 'game_over'
        ? {
            thiefId: state.thiefId,
            stealHour: state.stealHour,
            wakeHours: { ...state.wakeHours },
            accomplices: [...state.accomplices],
            peeks: state.peeks.map((p) => ({ ...p })),
          }
        : null,
  };
}

export function buildCheeseThiefPlayerView(
  state: CheeseThiefState,
  playerId: string,
): CheeseThiefPlayerView {
  const base = buildPublicView(state);
  if (!state.players.includes(playerId)) {
    return { ...base, me: null };
  }
  const wakeHour = state.wakeHours[playerId] ?? 0;
  const isThief = state.thiefId === playerId;
  const isAccomplice = state.accomplices.includes(playerId);
  // 相识模式下：大盗看到全部共犯；共犯看到大盗与其他共犯；否则不公开任何名单。
  const knownAccomplices =
    state.accomplicesKnown && (isThief || isAccomplice)
      ? isThief
        ? [...state.accomplices]
        : [state.thiefId!, ...state.accomplices.filter((id) => id !== playerId)]
      : [];
  const peeked = state.peeks.find((p) => p.viewer === playerId);
  const catPeeked =
    state.roleCards[playerId] === 'cat' && state.catPeekTarget !== null
      ? { target: state.catPeekTarget, hour: state.wakeHours[state.catPeekTarget]! }
      : null;
  return {
    ...base,
    me: {
      playerId,
      wakeHour,
      hourChoices: state.hourChoices?.[playerId] ?? null,
      coWakers: state.players.filter(
        (id) => id !== playerId && state.wakeHours[id] === wakeHour && wakeHour !== 0,
      ),
      cheeseWasMissing:
        state.cheeseStolen && (state.stealHour ?? 0) < wakeHour,
      isThief,
      isAccomplice,
      knownAccomplices,
      roleCard: state.roleCards[playerId] as RoleCard | 'none',
      canPeek: canPeekFor(state, playerId),
      peekedHour: peeked && peeked.target !== playerId ? { target: peeked.target, hour: state.wakeHours[peeked.target]! } : null,
      catPeekedHour: catPeeked,
      hasVoted: state.votes[playerId] !== undefined,
    },
  };
}

/** 与 rules.canPeek 同口径：轮到自己的时刻，若独醒即可查看场上任意一位玩家的骰子点数；若2人或以上同醒则无法查看 */
function canPeekFor(state: CheeseThiefState, playerId: string): boolean {
  if (state.phase !== 'night') return false;
  if (state.wakeHours[playerId] !== state.currentHour) return false;
  const solo = state.players.filter((id) => state.wakeHours[id] === state.currentHour).length === 1;
  if (!solo) return false;
  return !state.peeks.some((p) => p.viewer === playerId);
}

export function buildCheeseThiefSpectatorView(state: CheeseThiefState): CheeseThiefPublicView {
  return buildPublicView(state);
}

export function parseCheeseThiefSpectatorView(input: unknown): CheeseThiefPublicView {
  return parseOrThrow<CheeseThiefPublicView>(cheeseThiefPublicViewSchema, input, '奶酪大盗 视图');
}

export function parseCheeseThiefPlayerView(input: unknown): CheeseThiefPlayerView {
  return parseOrThrow<CheeseThiefPlayerView>(cheeseThiefPlayerViewSchema, input, '奶酪大盗 玩家视图');
}
