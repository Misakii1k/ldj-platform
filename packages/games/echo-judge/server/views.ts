import { z } from 'zod';
import type {
  EchoJudgePlayerView,
  EchoJudgePublicView,
  EchoJudgeState,
} from './types.ts';

const pid = z.string().min(1).max(64);
const phaseEnum = z.enum(['judge_setup', 'answering', 'judgment', 'game_over']);
const roleEnum = z.enum(['human', 'impostor']);

const topicCardViewSchema = z
  .object({
    id: z.string().min(1),
    text: z.string().min(1),
    category: z.enum(['life', 'imagination', 'emotion', 'weird', 'philosophy', 'social']),
    categoryLabel: z.string().min(1),
  })
  .strict();

const echoJudgeRevealSchema = z
  .object({
    round: z.number().int().positive(),
    judgeId: pid,
    question: z.string(),
    roles: z.record(pid, roleEnum),
    triggerWords: z.record(pid, z.string()),
    answers: z.record(pid, z.string()),
    accusations: z.array(pid),
    caughtImpostors: z.array(pid),
    wrongAccusations: z.array(pid),
    escapedImpostors: z.array(pid),
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
    topicCardId: z.string().nullable(),
    currentSpeakerId: pid.nullable(),
    allAnswered: z.boolean(),
    answeredCount: z.number().int().nonnegative(),
    accusations: z.array(pid).nullable(),
    caughtImpostors: z.array(pid).nullable(),
    escapedImpostors: z.array(pid).nullable(),
    scores: z.record(pid, z.number().int()),
    winners: z.array(pid),
    /** 当前阶段截止时刻；出题阶段与终局为 null */
    deadlineAt: z.number().nullable(),
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
      pendingTopicChoices: z.array(topicCardViewSchema).nullable(),
      myTurn: z.boolean(),
      isCurrentSpeaker: z.boolean(),
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
  const answeredCount = Object.keys(state.answers ?? {}).length;
  const allAnswered = (state.answerOrder ?? []).length > 0 && (state.answerOrder ?? []).every((id) => state.answers?.[id] !== undefined);
  const currentSpeaker =
    state.phase === 'answering' && !allAnswered
      ? (state.currentSpeakerId ?? state.answerOrder?.[answeredCount] ?? null)
      : null;

  const showJudgmentResults = state.phase === 'judgment' || state.phase === 'game_over';

  return {
    gameId: 'echo-judge',
    rulesetId: 'echo_judge_v1',
    schemaVersion: 1,
    phase: state.phase,
    players: [...(state.players ?? [])],
    round: state.round ?? 1,
    judgeId: state.judgeId ?? state.players?.[0] ?? '',
    question: state.question ?? '',
    topicCardId: state.topicCardId ?? null,
    currentSpeakerId: currentSpeaker,
    allAnswered,
    answeredCount,
    accusations: showJudgmentResults ? [...(state.accusations ?? [])] : null,
    caughtImpostors: showJudgmentResults ? [...(state.caughtImpostors ?? [])] : null,
    escapedImpostors: showJudgmentResults ? [...(state.escapedImpostors ?? [])] : null,
    scores: { ...(state.scores ?? {}) },
    winners: [...(state.winners ?? [])],
    // 出题阶段与终局不计时；老存档没有这个字段，兜底为 null
    deadlineAt: state.deadlineAt ?? null,
    reveal:
      state.phase === 'game_over'
        ? {
            round: state.round ?? 1,
            judgeId: state.judgeId,
            question: state.question ?? '',
            roles: { ...(state.roles ?? {}) },
            triggerWords: { ...(state.triggerWords ?? {}) },
            answers: { ...(state.answers ?? {}) },
            accusations: [...(state.accusations ?? [])],
            caughtImpostors: [...(state.caughtImpostors ?? [])],
            wrongAccusations: [...(state.wrongAccusations ?? [])],
            escapedImpostors: [...(state.escapedImpostors ?? [])],
            scores: { ...(state.scores ?? {}) },
          }
        : null,
  };
}

export function buildEchoJudgePlayerView(
  state: EchoJudgeState,
  playerId: string,
): EchoJudgePlayerView {
  const base = buildPublicView(state);
  if (!state.players?.includes(playerId)) return { ...base, me: null };
  const isJudge = state.judgeId === playerId;
  const answered = Object.keys(state.answers ?? {}).length;
  const myTurn =
    state.phase === 'answering' &&
    !isJudge &&
    state.answers?.[playerId] === undefined &&
    state.answerOrder?.[answered] === playerId;

  const isCurrentSpeaker = base.currentSpeakerId === playerId;
  const showPendingCards = isJudge && state.phase === 'judge_setup' && state.pendingTopicChoices !== null;

  return {
    ...base,
    me: {
      playerId,
      isJudge,
      role: isJudge ? null : (state.roles?.[playerId] ?? null),
      triggerWord: state.roles?.[playerId] === 'impostor' ? (state.triggerWords?.[playerId] ?? null) : null,
      pendingTopicChoices:
        showPendingCards && state.pendingTopicChoices
          ? state.pendingTopicChoices.map((c) => ({
              id: c.id,
              text: c.text,
              category: c.category,
              categoryLabel: c.categoryLabel,
            }))
          : null,
      myTurn,
      isCurrentSpeaker,
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
