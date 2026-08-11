import { z } from 'zod';
import type {
  EchoJudgePlayerView,
  EchoJudgePublicView,
  EchoJudgeState,
} from './types.ts';

const pid = z.string().min(1).max(64);
const phaseEnum = z.enum(['judge_setup', 'answering', 'judgment', 'game_over']);
const roleEnum = z.enum(['human', 'impostor']);

const echoJudgeRevealSchema = z
  .object({
    round: z.number().int().positive(),
    judgeId: pid,
    question: z.string(),
    roles: z.record(pid, roleEnum),
    triggerWords: z.record(pid, z.string()),
    answers: z.record(pid, z.string()),
    accusation: pid.nullable(),
    caughtImpostor: z.boolean().nullable(),
    scores: z.record(pid, z.number().int()),
  })
  .strict();

const echoJudgePublicViewSchema = z
  .object({
    gameId: z.literal('echo-judge'),
    rulesetId: z.literal('echo_judge_v1'),
    schemaVersion: z.literal(1),
    phase: phaseEnum,
    players: z.array(pid),
    round: z.number().int().positive(),
    judgeId: pid,
    question: z.string(),
    allAnswered: z.boolean(),
    answeredCount: z.number().int().nonnegative(),
    caughtImpostor: z.boolean().nullable(),
    scores: z.record(pid, z.number().int()),
    winners: z.array(pid),
    reveal: echoJudgeRevealSchema.nullable(),
  })
  .strict();

const echoJudgePlayerViewSchema = echoJudgePublicViewSchema.extend({
  me: z
    .object({
      playerId: pid,
      isJudge: z.boolean(),
      role: roleEnum.nullable(),
      triggerWord: z.string().nullable(),
      myTurn: z.boolean(),
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

function buildPublicView(state: EchoJudgeState): EchoJudgePublicView {
  const answeredCount = Object.keys(state.answers).length;
  const allAnswered = state.answerOrder.length > 0 && state.answerOrder.every((id) => state.answers[id] !== undefined);
  return {
    gameId: 'echo-judge',
    rulesetId: 'echo_judge_v1',
    schemaVersion: 1,
    phase: state.phase,
    players: [...state.players],
    round: state.round,
    judgeId: state.judgeId,
    question: state.question,
    allAnswered,
    answeredCount,
    caughtImpostor: state.caughtImpostor,
    scores: { ...state.scores },
    winners: [...state.winners],
    reveal:
      state.phase === 'game_over'
        ? {
            round: state.round,
            judgeId: state.judgeId,
            question: state.question,
            roles: { ...state.roles },
            triggerWords: { ...state.triggerWords },
            answers: { ...state.answers },
            accusation: state.accusation,
            caughtImpostor: state.caughtImpostor,
            scores: { ...state.scores },
          }
        : null,
  };
}

export function buildEchoJudgePlayerView(
  state: EchoJudgeState,
  playerId: string,
): EchoJudgePlayerView {
  const base = buildPublicView(state);
  if (!state.players.includes(playerId)) return { ...base, me: null };
  const isJudge = state.judgeId === playerId;
  const answered = Object.keys(state.answers).length;
  const myTurn =
    state.phase === 'answering' &&
    !isJudge &&
    state.answers[playerId] === undefined &&
    state.answerOrder[answered] === playerId;
  return {
    ...base,
    me: {
      playerId,
      isJudge,
      // 判官不知伪人是谁 → role 为 null；玩家本人知身份
      role: isJudge ? null : (state.roles[playerId] ?? null),
      triggerWord: state.roles[playerId] === 'impostor' ? (state.triggerWords[playerId] ?? null) : null,
      myTurn,
    },
  };
}

export function buildEchoJudgeSpectatorView(state: EchoJudgeState): EchoJudgePublicView {
  return buildPublicView(state);
}

export function parseEchoJudgeSpectatorView(input: unknown): EchoJudgePublicView {
  return parseOrThrow<EchoJudgePublicView>(echoJudgePublicViewSchema, input, '伪人测试 视图');
}

export function parseEchoJudgePlayerView(input: unknown): EchoJudgePlayerView {
  return parseOrThrow<EchoJudgePlayerView>(echoJudgePlayerViewSchema, input, '伪人测试 玩家视图');
}
