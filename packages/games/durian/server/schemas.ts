/** durian_orchard_v1 — strict zod schemas（config/action）。状态形状校验由 invariant 承担。 */
import { z } from 'zod';
import type { DurianAction, DurianConfig } from './types.ts';
import { DURIAN_FRUITS } from './types.ts';

const pid = z.string().min(1, { message: '玩家 ID 无效' }).max(64, { message: '玩家 ID 无效' });
const fruit = z.enum(DURIAN_FRUITS, { message: '水果无效' });
const staffEvent = z.enum(['double_check', 'extra_basket', 'mixed_crate'], { message: '店员事件无效' });

const orderOptionSchema = z.object({
  fruit,
  quantity: z.union([z.literal(1), z.literal(2)]),
}).strict('订单选项 字段无效');

const orderCardSchema = z.object({
  id: pid,
  options: z.tuple([orderOptionSchema, orderOptionSchema]),
  staffEvent,
}).strict('订单 字段无效');

const durianConfigSchema = z.object({
  rulesetId: z.literal('durian_orchard_v1').optional(),
  orderDeck: z.array(orderCardSchema)
    .min(1, { message: '订单牌堆不能为空' })
    .refine((deck) => new Set(deck.map((card) => card.id)).size === deck.length, { message: '订单 ID 重复' })
    .optional(),
}).strict('配置 字段无效');

const durianActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('submit_order'),
    playerId: pid,
    optionIndex: z.number().int().refine((value) => value === 0 || value === 1, { message: '订单选项无效' }),
  }).strict('动作 字段无效'),
  z.object({ type: z.literal('ring_bell'), playerId: pid }).strict('动作 字段无效'),
  z.object({ type: z.literal('resolve_bell'), playerId: pid }).strict('动作 字段无效'),
  z.object({ type: z.literal('close_bell'), playerId: pid }).strict('动作 字段无效'),
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

export function parseDurianConfig(input: unknown): DurianConfig {
  return parseOrThrow<DurianConfig>(durianConfigSchema, input ?? {}, '配置');
}

export function parseDurianAction(input: unknown): DurianAction {
  return parseOrThrow<DurianAction>(durianActionSchema, input, '动作');
}
