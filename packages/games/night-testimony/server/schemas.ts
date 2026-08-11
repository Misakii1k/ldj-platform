/** night_testimony_v1 — strict zod schemas（config/action）。状态形状校验由 invariant 承担。 */
import { z } from 'zod';
import { CRIMES } from './types.ts';
import type { NightTestimonyAction, ResolvedNightTestimonyConfig } from './types.ts';

const pid = z.string().min(1, { message: '玩家 ID 无效' }).max(64, { message: '玩家 ID 无效' });
const seconds = z.number().int().min(1, { message: '时长无效' }).max(600, { message: '时长无效' });
const crime = z.enum(CRIMES, { message: '罪行无效' });

const nightTestimonyConfigSchema = z
  .object({
    rulesetId: z.literal('night_testimony_v1').optional(),
    questionSeconds: seconds.default(120),
    deductionSeconds: seconds.default(60),
    voteSeconds: seconds.default(30),
    questionLimit: z.number().int().min(1).max(12).default(5),
  })
  .strict('配置 字段无效');

const nightTestimonyActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('begin') }).strict('动作 字段无效'),
  z
    .object({
      type: z.literal('ask'),
      playerId: pid,
      targetPlayerId: pid,
      text: z.string().min(1, { message: '问题不能为空' }).max(200, { message: '问题过长' }),
    })
    .strict('动作 字段无效'),
  z
    .object({ type: z.literal('answer'), playerId: pid, answer: z.enum(['yes', 'no']) })
    .strict('动作 字段无效'),
  z.object({ type: z.literal('resolve_question') }).strict('动作 字段无效'),
  z.object({ type: z.literal('end_deduction') }).strict('动作 字段无效'),
  z
    .object({ type: z.literal('cast_vote'), playerId: pid, targetPlayerId: pid })
    .strict('动作 字段无效'),
  z.object({ type: z.literal('resolve_vote') }).strict('动作 字段无效'),
  z
    .object({
      type: z.literal('submit_guesses'),
      playerId: pid,
      guesses: z.record(pid, crime),
    })
    .strict('动作 字段无效'),
  z
    .object({
      type: z.literal('player_forfeited'),
      playerIds: z.array(pid).min(1).max(12),
    })
    .strict('动作 字段无效'),
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
