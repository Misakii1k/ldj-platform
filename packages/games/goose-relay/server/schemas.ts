/** goose_relay_classic_v1 — strict zod schemas（config/action）。状态形状校验由 invariant 承担。 */
import { z } from 'zod';
import { CHARACTERS, SCENES, TOOLS } from './types.ts';
import type { GooseRelayAction, ResolvedGooseRelayConfig } from './types.ts';

const pid = z.string().min(1, { message: '玩家 ID 无效' }).max(64, { message: '玩家 ID 无效' });
const seconds = z.number().int().min(0, { message: '时长无效' }).max(600, { message: '时长无效' });
const positiveSeconds = z.number().int().min(1, { message: '时长无效' }).max(600, { message: '时长无效' });

const caseCardSchema = z
  .object({
    murderer: z.enum(CHARACTERS, { message: '凶手无效' }),
    victim: z.enum(CHARACTERS, { message: '被害人无效' }),
    tool: z.enum(TOOLS, { message: '道具无效' }),
    scene: z.enum(SCENES, { message: '场景无效' }),
  })
  .strict('案情卡 字段无效')
  .refine((card) => card.murderer !== card.victim, { message: '凶手与被害人不能相同' });

const gooseRelayConfigSchema = z
  .object({
    rulesetId: z.literal('goose_relay_classic_v1').optional(),
    relaySeconds: positiveSeconds.default(30),
    discussionSeconds: seconds.default(60),
    accuseSeconds: positiveSeconds.default(30),
    voteSeconds: positiveSeconds.default(30),
  })
  .strict('配置 字段无效');

const gooseRelayActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('begin') }).strict('动作 字段无效'),
  z
    .object({ type: z.literal('transmit'), playerId: pid, case: caseCardSchema })
    .strict('动作 字段无效'),
  z.object({ type: z.literal('relay_timeout'), index: z.number().int().nonnegative() }).strict('动作 字段无效'),
  z.object({ type: z.literal('end_discussion') }).strict('动作 字段无效'),
  z
    .object({
      type: z.literal('accuse'),
      playerId: pid,
      murderer: z.enum(CHARACTERS, { message: '凶手无效' }),
      victim: z.enum(CHARACTERS, { message: '被害人无效' }),
    })
    .strict('动作 字段无效'),
  z.object({ type: z.literal('accusation_timeout') }).strict('动作 字段无效'),
  z.object({ type: z.literal('cast_vote'), playerId: pid, targetPlayerId: pid }).strict('动作 字段无效'),
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

export function parseGooseRelayConfig(input: unknown): ResolvedGooseRelayConfig {
  const parsed = parseOrThrow<{
    rulesetId?: 'goose_relay_classic_v1';
    relaySeconds: number;
    discussionSeconds: number;
    accuseSeconds: number;
    voteSeconds: number;
  }>(gooseRelayConfigSchema, input ?? {}, '配置');
  // rulesetId 缺省归一化：避免 undefined 泄漏进状态快照（canonicalJson 拒绝 undefined）
  return {
    rulesetId: parsed.rulesetId ?? 'goose_relay_classic_v1',
    relaySeconds: parsed.relaySeconds,
    discussionSeconds: parsed.discussionSeconds,
    accuseSeconds: parsed.accuseSeconds,
    voteSeconds: parsed.voteSeconds,
  };
}

export function parseGooseRelayAction(input: unknown): GooseRelayAction {
  return parseOrThrow<GooseRelayAction>(gooseRelayActionSchema, input, '动作');
}

export { caseCardSchema };
