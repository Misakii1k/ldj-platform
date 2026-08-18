/** bell_clash_v1 — strict zod schemas（config/action）。状态形状校验由 invariant 承担。 */
import { z } from 'zod';
import { COLORS } from './types.ts';
import type { BellClashAction, ResolvedBellClashConfig } from './types.ts';

const pid = z.string().min(1, { message: '玩家 ID 无效' }).max(64, { message: '玩家 ID 无效' });
const seconds = z.number().int().min(1, { message: '时长无效' }).max(600, { message: '时长无效' });

const bellClashConfigSchema = z
  .object({
    rulesetId: z.literal('bell_clash_v1').optional(),
    handSize: z.number().int().min(1).max(12).default(8),
    turnSeconds: seconds.default(30),
    bellSeconds: seconds.default(10),
  })
  .passthrough();

const bellClashActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('begin') }).strict('动作 字段无效'),
  z
    .object({ type: z.literal('play_card'), playerId: pid, cardIndex: z.number().int().nonnegative() })
    .strict('动作 字段无效'),
  z.object({ type: z.literal('draw_card'), playerId: pid }).strict('动作 字段无效'),
  z.object({ type: z.literal('ring_bell'), playerId: pid }).strict('动作 字段无效'),
  z
    .object({
      type: z.literal('resolve_bell'),
      // 空字符串表示无人拍铃（哨兵）；非空必须是合法玩家 ID
      claimantId: z.string().max(64),
    })
    .strict('动作 字段无效'),
  z.object({ type: z.literal('turn_timeout'), playerId: pid }).strict('动作 字段无效'),
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

export function parseBellClashConfig(input: unknown): ResolvedBellClashConfig {
  return parseOrThrow<ResolvedBellClashConfig>(bellClashConfigSchema, input ?? {}, '配置');
}

export function parseBellClashAction(input: unknown): BellClashAction {
  return parseOrThrow<BellClashAction>(bellClashActionSchema, input, '动作');
}

export { COLORS };
