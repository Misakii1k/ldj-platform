import { z } from 'zod';
import { CRIMES } from './types.ts';
import type {
  NightTestimonyPlayerView,
  NightTestimonyPublicView,
  NightTestimonyState,
} from './types.ts';

const pid = z.string().min(1).max(64);
const crime = z.enum(CRIMES);
const phaseEnum = z.enum(['question', 'deduction', 'vote', 'game_over']);

const nightTestimonyRevealSchema = z
  .object({
    wardenId: pid,
    crimes: z.record(pid, crime),
    answers: z.array(
      z
        .object({ questionerId: pid, responderId: pid, question: z.string().min(1), answer: z.enum(['yes', 'no']) })
        .strict(),
    ),
    extraCrime: crime.nullable(),
    accusedId: pid.nullable(),
    wardenRevealed: z.boolean(),
    wardenGuesses: z.record(pid, crime).nullable(),
    crimesAllGuessed: z.boolean(),
  })
  .strict();

const nightTestimonyPublicViewSchema = z
  .object({
    gameId: z.literal('night-testimony'),
    rulesetId: z.literal('night_testimony_v1'),
    schemaVersion: z.literal(1),
    phase: phaseEnum,
    players: z.array(pid),
    yesTrack: z.array(
      z
        .object({ questionerId: pid, responderId: pid, question: z.string().min(1), answer: z.enum(['yes', 'no']) })
        .strict(),
    ),
    askedCount: z.number().int().nonnegative(),
    questionLimit: z.number().int().positive(),
    extraCrime: crime.nullable(),
    hasPendingQuestion: z.boolean(),
    accusedId: pid.nullable(),
    wardenRevealed: z.boolean().nullable(),
    guessingInProgress: z.boolean(),
    winners: z.array(pid),
    reveal: nightTestimonyRevealSchema.nullable(),
  })
  .strict();

const nightTestimonyPlayerViewSchema = nightTestimonyPublicViewSchema.extend({
  me: z
    .object({
      playerId: pid,
      isWarden: z.boolean(),
      crime: crime.nullable(),
      yesLeft: z.number().int().nonnegative(),
      noLeft: z.number().int().nonnegative(),
      pendingQuestion: z
        .object({ questionerId: pid, text: z.string().min(1) })
        .strict()
        .nullable(),
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

/** 罪行卡展示文案（原创表达） */
const CRIME_LABELS: Record<(typeof CRIMES)[number], string> = {
  arson: '纵火犯',
  theft: '盗窃犯',
  forgery: '伪造犯',
  smuggling: '走私犯',
  fraud: '诈骗犯',
  kidnap: '绑架犯',
};

export function crimeLabel(crimeId: (typeof CRIMES)[number]): string {
  return CRIME_LABELS[crimeId];
}

function buildPublicView(state: NightTestimonyState): NightTestimonyPublicView {
  return {
    gameId: 'night-testimony',
    rulesetId: 'night_testimony_v1',
    schemaVersion: 1,
    phase: state.phase,
    players: [...state.players],
    yesTrack: state.answers.map((a) => ({ ...a })),
    askedCount: state.answers.length,
    questionLimit: state.config.questionLimit,
    extraCrime: state.extraCrime,
    hasPendingQuestion: state.pendingQuestion !== null,
    accusedId: state.accusedId,
    wardenRevealed: state.wardenRevealed,
    guessingInProgress: state.phase === 'game_over' && state.wardenRevealed === true && state.wardenGuesses === null,
    winners: [...state.winners],
    reveal:
      state.phase === 'game_over'
        ? {
            wardenId: state.wardenId,
            crimes: { ...state.crimes },
            answers: state.answers.map((a) => ({ ...a })),
            extraCrime: state.extraCrime,
            accusedId: state.accusedId,
            wardenRevealed: state.wardenRevealed ?? false,
            wardenGuesses: state.wardenGuesses ? { ...state.wardenGuesses } : null,
            crimesAllGuessed: state.crimesAllGuessed ?? false,
          }
        : null,
  };
}

export function buildNightTestimonyPlayerView(
  state: NightTestimonyState,
  playerId: string,
): NightTestimonyPlayerView {
  const base = buildPublicView(state);
  if (!state.players.includes(playerId)) return { ...base, me: null };
  const isWarden = state.wardenId === playerId;
  return {
    ...base,
    me: {
      playerId,
      isWarden,
      crime: isWarden ? null : (state.crimes[playerId] ?? null),
      yesLeft: state.yesLeft[playerId] ?? 0,
      noLeft: state.noLeft[playerId] ?? 0,
      pendingQuestion:
        state.pendingQuestion !== null && state.pendingQuestion.responderId === playerId
          ? { questionerId: state.pendingQuestion.questionerId, text: state.pendingQuestion.text }
          : null,
    },
  };
}

export function buildNightTestimonySpectatorView(state: NightTestimonyState): NightTestimonyPublicView {
  return buildPublicView(state);
}

export function parseNightTestimonySpectatorView(input: unknown): NightTestimonyPublicView {
  return parseOrThrow<NightTestimonyPublicView>(nightTestimonyPublicViewSchema, input, '囚徒之夜 视图');
}

export function parseNightTestimonyPlayerView(input: unknown): NightTestimonyPlayerView {
  return parseOrThrow<NightTestimonyPlayerView>(nightTestimonyPlayerViewSchema, input, '囚徒之夜 玩家视图');
}
