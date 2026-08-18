/** echo_judge_v1 — strict zod schemas（config/action）。状态形状校验由 invariant 承担。 */
import { z } from 'zod';
import type { EchoJudgeAction, ResolvedEchoJudgeConfig } from './types.ts';

const pid = z.string().min(1, { message: '玩家 ID 无效' }).max(64, { message: '玩家 ID 无效' });
const seconds = z.number().int().min(1, { message: '时长无效' }).max(600, { message: '时长无效' });

const echoJudgeConfigSchema = z
  .object({
    rulesetId: z.literal('echo_judge_v1').optional(),
    answerSeconds: seconds.default(30),
    judgmentSeconds: seconds.default(30),
    judgeWrongPenalty: z.number().int().min(-10).max(0).default(-1),
  })
  .passthrough();

const echoJudgeActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('begin') }).strict('动作 字段无效'),
  z
    .object({
      type: z.literal('start_round'),
      playerId: pid,
      question: z.string().min(1, { message: '题目不能为空' }).max(200, { message: '题目过长' }),
    })
    .strict('动作 字段无效'),
  z
    .object({
      type: z.literal('submit_answer'),
      playerId: pid,
      text: z.string().min(1, { message: '回答不能为空' }).max(200, { message: '回答过长' }),
    })
    .strict('动作 字段无效'),
  z
    .object({ type: z.literal('accuse'), playerId: pid, targetPlayerId: pid })
    .strict('动作 字段无效'),
  z.object({ type: z.literal('resolve_round'), playerId: pid }).strict('动作 字段无效'),
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

export function parseEchoJudgeConfig(input: unknown): ResolvedEchoJudgeConfig {
  return parseOrThrow<ResolvedEchoJudgeConfig>(echoJudgeConfigSchema, input ?? {}, '配置');
}

export function parseEchoJudgeAction(input: unknown): EchoJudgeAction {
  return parseOrThrow<EchoJudgeAction>(echoJudgeActionSchema, input, '动作');
}
