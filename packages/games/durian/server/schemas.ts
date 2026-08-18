/** durian_orchard_v1 — strict zod schemas（config/action）。状态形状校验由 invariant 承担。 */
import { z } from 'zod';
import type { DurianAction, DurianConfig } from './types.ts';
import { DURIAN_FRUITS } from './types.ts';

const pid = z.string().min(1, { message: '玩家 ID 无效' }).max(64, { message: '玩家 ID 无效' });
const fruit = z.enum(DURIAN_FRUITS, { message: '水果无效' });
const monkeySpecial = z.enum(['flip', 'do_nothing', 'three_void', 'banana_void'], { message: '猴子功能无效' });

const fruitHalfSchema = z.object({
  fruit,
  quantity: z.union([z.literal(1), z.literal(2), z.literal(3)], { message: '水果数量必须为 1、2 或 3' }),
}).strict('水果半区 字段无效');

const fruitCardSchema = z.object({
  id: pid,
  kind: z.literal('fruit'),
  left: fruitHalfSchema,
  right: fruitHalfSchema,
}).strict('水果卡牌 字段无效');

const monkeyCardSchema = z.object({
  id: pid,
  kind: z.literal('monkey'),
  special: monkeySpecial,
}).strict('猴子卡牌 字段无效');

const durianCardSchema = z.discriminatedUnion('kind', [fruitCardSchema, monkeyCardSchema]);

const durianConfigSchema = z.object({
  rulesetId: z.literal('durian_orchard_v1').optional(),
  mode: z.enum(['standard', 'simulator']).optional(),
  maxRounds: z.number().int().min(1).max(20).optional(),
  customDeck: z.array(durianCardSchema)
    .min(1, { message: '自定义牌堆不能为空' })
    .refine((deck) => new Set(deck.map((card) => card.id)).size === deck.length, { message: '卡牌 ID 重复' })
    .optional(),
}).passthrough();

const durianActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('begin') }).strict('动作 字段无效'),
  z.object({
    type: z.literal('draw_card'),
    playerId: pid,
  }).strict('动作 字段无效'),
  z.object({
    type: z.literal('place_fruit'),
    playerId: pid,
    checkHalf: z.enum(['left', 'right'], { message: '放置方向必须为 left 或 right' }),
  }).strict('动作 字段无效'),
  z.object({
    type: z.literal('select_flip_target'),
    playerId: pid,
    targetPlacementId: z.string().min(1, { message: '目标放置 ID 无效' }),
  }).strict('动作 字段无效'),
  z.object({
    type: z.literal('challenge'),
    playerId: pid,
  }).strict('动作 字段无效'),
  z.object({
    type: z.literal('ring_bell_sim'),
    playerId: pid,
  }).strict('动作 字段无效'),
  z.object({
    type: z.literal('next_round'),
    playerId: pid,
  }).strict('动作 字段无效'),
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
