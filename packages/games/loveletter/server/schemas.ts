/** loveletter_classic16_v1 — strict zod schemas（config/action）。状态形状校验由 invariant 承担。 */
import { z } from 'zod';
import { LOVELETTER_ROLES, type LoveLetterAction, type LoveLetterConfig } from './types.ts';

const ROLE_VALUES = { guard: 1, priest: 2, baron: 3, handmaid: 4, prince: 5, king: 6, countess: 7, princess: 8 } as const;
const pid = z.string().min(1, { message: '玩家 ID 无效' }).max(64, { message: '玩家 ID 无效' });
const role = z.enum(LOVELETTER_ROLES, { message: '角色无效' });

const cardSchema = z.object({
  id: pid,
  role,
  value: z.number().int().min(1).max(8),
}).strict('角色牌 字段无效').refine((card) => card.value === ROLE_VALUES[card.role], { message: '角色牌点数无效' });

const deckSchema = z.array(cardSchema)
  .length(16, { message: '牌序必须包含 16 张牌' })
  .refine((cards) => new Set(cards.map((card) => card.id)).size === cards.length, { message: '角色牌 ID 重复' });

const loveLetterConfigSchema = z.object({
  rulesetId: z.literal('loveletter_classic16_v1').optional(),
  affectionTarget: z.number().int().min(1).max(10).optional(),
  turnSeconds: z.number().int().min(1).max(600).optional(),
  deckOrder: deckSchema.optional(),
  futureDeckOrders: z.array(deckSchema).optional(),
}).passthrough();

const loveLetterActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('play_card', { message: '动作类型无效' }),
    playerId: pid,
    cardId: pid,
    targetPlayerId: pid.optional(),
    guessedRole: role.optional(),
  }).strict('动作 字段无效'),
  z.object({ type: z.literal('begin') }).strict('动作 字段无效'),
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

export function parseLoveLetterConfig(input: unknown): LoveLetterConfig {
  return parseOrThrow<LoveLetterConfig>(loveLetterConfigSchema, input ?? {}, '配置');
}

export function parseLoveLetterAction(input: unknown): LoveLetterAction {
  return parseOrThrow<LoveLetterAction>(loveLetterActionSchema, input, '动作');
}
