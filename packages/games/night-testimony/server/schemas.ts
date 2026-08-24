import { z } from 'zod';
import { CRIMES } from './types.ts';
import type { NightTestimonyAction, ResolvedNightTestimonyConfig } from './types.ts';

const pid = z.string().min(1, { message: '玩家 ID 无效' }).max(64, { message: '玩家 ID 无效' });
const crimeSchema = z.enum(CRIMES, { message: '罪行无效' });

const nightTestimonyConfigSchema = z
  .object({
    rulesetId: z.literal('night_testimony_v1').optional(),
    maxYesPerPlayer: z.number().int().min(1).max(10).default(3),
    questionLimit: z.number().int().min(1).max(20).default(5),
    questionSeconds: z.number().int().min(1).max(600).default(90),
    voteSeconds: z.number().int().min(1).max(600).default(90),
  })
  .passthrough();

const nightTestimonyActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('begin') }).strict('动作 字段无效'),
  z
    .object({
      type: z.literal('pick_question_card'),
      playerId: pid,
      cardId: z.string().min(1, { message: '问题卡 ID 不能为空' }),
    })
    .strict('动作 字段无效'),
  z
    .object({
      type: z.literal('answer_question'),
      playerId: pid,
      answer: z.enum(['yes', 'no'], { message: '回答必须是 yes 或 no' }),
    })
    .strict('动作 字段无效'),
  z
    .object({
      type: z.literal('self_expose'),
      playerId: pid,
    })
    .strict('动作 字段无效'),
  z
    .object({
      type: z.literal('cast_vote'),
      playerId: pid,
      targetPlayerId: pid,
    })
    .strict('动作 字段无效'),
  z
    .object({
      type: z.literal('submit_guesses'),
      playerId: pid,
      guesses: z.record(pid, crimeSchema),
    })
    .strict('动作 字段无效'),
  z
    .object({
      type: z.literal('player_forfeited'),
      playerIds: z.array(pid).min(1).max(6),
    })
    .strict('动作 字段无效'),
  z.object({ type: z.literal('question_timeout') }).strict('动作 字段无效'),
  z.object({ type: z.literal('vote_timeout') }).strict('动作 字段无效'),
]);

function parseOrThrow<T>(schema: z.ZodType<unknown>, input: unknown, label: string): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0]!;
    throw new Error(issue.code === 'unrecognized_keys' ? `${label} 字段无效` : issue.message);
  }
  return result.data as T;
}

export function parseNightTestimonyConfig(input: unknown): ResolvedNightTestimonyConfig {
  return parseOrThrow<ResolvedNightTestimonyConfig>(nightTestimonyConfigSchema, input ?? {}, '配置');
}

export function parseNightTestimonyAction(input: unknown): NightTestimonyAction {
  return parseOrThrow<NightTestimonyAction>(nightTestimonyActionSchema, input, '动作');
}
