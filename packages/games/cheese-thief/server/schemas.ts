/** cheese_thief_classic_v1 — strict zod schemas（config/action）。状态形状校验由 invariant 承担。 */
import { z } from 'zod';
import { DEFAULT_ACCOMPLICE_RULES, type CheeseThiefAction, type ResolvedCheeseThiefConfig } from './types.ts';

const pid = z.string().min(1, { message: '玩家 ID 无效' }).max(64, { message: '玩家 ID 无效' });
const hour = z.number().int().min(1, { message: '时刻无效' }).max(6, { message: '时刻无效' });
const seconds = z.number().int().min(1, { message: '时长无效' }).max(600, { message: '时长无效' });

const accompliceRuleSchema = z
  .object({
    count: z.number().int().min(0, { message: '共犯数量无效' }).max(3, { message: '共犯数量无效' }),
    known: z.boolean(),
  })
  .strict('配置 字段无效');

const cheeseThiefConfigSchema = z
  .object({
    rulesetId: z.literal('cheese_thief_classic_v1').optional(),
    mode: z.enum(['standard', 'simulator']).default('standard'),
    roleRevealSeconds: seconds.default(17),
    nightHourSeconds: seconds.default(20),
    accompliceSelectSeconds: seconds.default(17),
    discussionSeconds: seconds.default(120),
    voteSeconds: seconds.default(30),
    hourChoiceSeconds: seconds.default(30),
    roleCards: z.boolean().default(false),
    accomplicesByPlayers: z
      .record(
        // JSON 键恒为字符串；二次解析（已合并 config 传入）时同样通过。
        z.string().regex(/^[4-8]$/, { message: '人数档无效' }),
        accompliceRuleSchema,
      )
      .default({}),
  })
  .passthrough();

const cheeseThiefActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('begin') }).strict('动作 字段无效'),
  z.object({ type: z.literal('choose_hour'), playerId: pid, hour }).strict('动作 字段无效'),
  z.object({ type: z.literal('resolve_hour_choice') }).strict('动作 字段无效'),
  z.object({ type: z.literal('advance_night'), hour }).strict('动作 字段无效'),
  z.object({ type: z.literal('end_night') }).strict('动作 字段无效'),
  z.object({ type: z.literal('steal_cheese'), playerId: pid }).strict('动作 字段无效'),
  z.object({ type: z.literal('peek_die'), playerId: pid, targetPlayerId: pid }).strict('动作 字段无效'),
  z.object({ type: z.literal('skip_peek'), playerId: pid }).strict('动作 字段无效'),
  z
    .object({
      type: z.literal('select_accomplice'),
      playerId: pid,
      accompliceIds: z.array(pid).max(3, { message: '共犯数量无效' }),
    })
    .strict('动作 字段无效'),
  z.object({ type: z.literal('auto_select_accomplice') }).strict('动作 字段无效'),
  z.object({ type: z.literal('end_discussion') }).strict('动作 字段无效'),
  z.object({ type: z.literal('skip_discussion'), playerId: pid.optional() }).strict('动作 字段无效'),
  z
    .object({ type: z.literal('reveal_cat'), playerId: pid, targetPlayerId: pid })
    .strict('动作 字段无效'),
  z
    .object({ type: z.literal('reveal_dog'), playerId: pid, firstVoterId: pid })
    .strict('动作 字段无效'),
  z
    .object({ type: z.literal('cast_vote'), playerId: pid, targetPlayerId: pid })
    .strict('动作 字段无效'),
  z.object({ type: z.literal('cast_abstention'), playerId: pid }).strict('动作 字段无效'),
  z.object({ type: z.literal('resolve_vote') }).strict('动作 字段无效'),
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
    // 多余字段统一报「字段无效」，与既有测试断言一致。
    throw new Error(issue.code === 'unrecognized_keys' ? `${label} 字段无效` : issue.message);
  }
  return result.data as T;
}

export function parseCheeseThiefConfig(input: unknown): ResolvedCheeseThiefConfig {
  const parsed = parseOrThrow<{
    rulesetId?: 'cheese_thief_classic_v1';
    mode: 'standard' | 'simulator';
    roleRevealSeconds: number;
    nightHourSeconds: number;
    accompliceSelectSeconds: number;
    discussionSeconds: number;
    voteSeconds: number;
    hourChoiceSeconds: number;
    roleCards: boolean;
    accomplicesByPlayers: Record<string, AccompliceRuleRaw>;
  }>(cheeseThiefConfigSchema, input ?? {}, '配置');
  // 将覆盖配置合并到默认共犯规则上（按人数档）。
  const accomplicesByPlayers: ResolvedCheeseThiefConfig['accomplicesByPlayers'] = {};
  for (const count of [4, 5, 6, 7, 8]) {
    const override = parsed.accomplicesByPlayers[String(count)];
    accomplicesByPlayers[count] = override ?? DEFAULT_ACCOMPLICE_RULES[count]!;
  }
  return {
    rulesetId: parsed.rulesetId ?? 'cheese_thief_classic_v1',
    mode: parsed.mode ?? 'standard',
    roleRevealSeconds: parsed.roleRevealSeconds,
    nightHourSeconds: parsed.nightHourSeconds,
    accompliceSelectSeconds: parsed.accompliceSelectSeconds,
    discussionSeconds: parsed.discussionSeconds,
    voteSeconds: parsed.voteSeconds,
    hourChoiceSeconds: parsed.hourChoiceSeconds,
    roleCards: parsed.roleCards,
    accomplicesByPlayers,
  };
}

type AccompliceRuleRaw = { count: number; known: boolean };

export function parseCheeseThiefAction(input: unknown): CheeseThiefAction {
  return parseOrThrow<CheeseThiefAction>(cheeseThiefActionSchema, input, '动作');
}
