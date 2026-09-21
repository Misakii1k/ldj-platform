import { z } from 'zod';
import type { TargetId } from './board.ts';
import type { WitsWagersConfig, WitsWagersAction } from './types.ts';

export const MIN_GUESS = 1;
export const MAX_GUESS = 999_999_999_999;

const targetIdRegex = /^(smaller|g:[1-9]\d*)$/;

const targetIdSchema = z.custom<TargetId>(
  (val) => typeof val === 'string' && targetIdRegex.test(val),
  { message: 'targetId 必须为 smaller 或 g:<正整数> 格式' },
);

const chipBetASchema = z
  .object({
    chipId: z.literal('A'),
    targetId: targetIdSchema.nullable(),
    extraStake: z
      .number()
      .int({ message: 'extraStake 必须为整数' })
      .min(0, { message: 'extraStake 不能为负数' })
      .refine(Number.isSafeInteger, { message: 'extraStake 必须为安全整数' }),
  })
  .strict('ChipBet A 包含非法字段')
  .refine(
    (b) => b.targetId !== null || b.extraStake === 0,
    { message: '未放置筹码的 extraStake 必须为 0' },
  );

const chipBetBSchema = z
  .object({
    chipId: z.literal('B'),
    targetId: targetIdSchema.nullable(),
    extraStake: z
      .number()
      .int({ message: 'extraStake 必须为整数' })
      .min(0, { message: 'extraStake 不能为负数' })
      .refine(Number.isSafeInteger, { message: 'extraStake 必须为安全整数' }),
  })
  .strict('ChipBet B 包含非法字段')
  .refine(
    (b) => b.targetId !== null || b.extraStake === 0,
    { message: '未放置筹码的 extraStake 必须为 0' },
  );

export const betPairSchema = z.tuple([chipBetASchema, chipBetBSchema]);

export const witsWagersConfigSchema = z
  .object({
    rulesetId: z.literal('wits_wagers_platform_v1').optional(),
    answerSeconds: z
      .number()
      .int()
      .refine((s) => s === 30 || s === 60 || s === 90, {
        message: 'answerSeconds 仅支持 30、60 或 90 秒',
      })
      .optional(),
    betSeconds: z
      .number()
      .int()
      .refine((s) => s === 30 || s === 60 || s === 90, {
        message: 'betSeconds 仅支持 30、60 或 90 秒',
      })
      .optional(),
    arrangingSeconds: z
      .number()
      .int()
      .refine((s) => s === 3 || s === 6 || s === 10, {
        message: 'arrangingSeconds 仅支持 3、6 或 10 秒',
      })
      .optional(),
    settlementSeconds: z
      .number()
      .int()
      .refine((s) => s === 8 || s === 11 || s === 15, {
        message: 'settlementSeconds 仅支持 8、11 或 15 秒',
      })
      .optional(),
  })
  .strict('配置包含未登记字段');

export const witsWagersActionSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('submit_guess'),
      roundToken: z.string().min(1, { message: 'roundToken 不能为空' }),
      expectedRevision: z
        .number()
        .int({ message: 'expectedRevision 必须为整数' })
        .min(0, { message: 'expectedRevision 不能为负' }),
      value: z
        .number()
        .int({ message: '猜测值必须为正整数' })
        .min(MIN_GUESS, { message: `猜测值不能小于 ${MIN_GUESS}` })
        .max(MAX_GUESS, { message: `猜测值不能大于 ${MAX_GUESS}` })
        .refine(Number.isSafeInteger, { message: '猜测值必须为安全整数' }),
    })
    .strict('submit_guess 动作包含非法字段'),

  z
    .object({
      type: z.literal('set_bets'),
      roundToken: z.string().min(1, { message: 'roundToken 不能为空' }),
      expectedRevision: z
        .number()
        .int({ message: 'expectedRevision 必须为整数' })
        .min(0, { message: 'expectedRevision 不能为负' }),
      chips: betPairSchema,
    })
    .strict('set_bets 动作包含非法字段'),

  z
    .object({
      type: z.literal('begin'),
    })
    .strict('begin 动作包含非法字段'),

  z
    .object({
      type: z.literal('phase_timeout'),
      roundToken: z.string().min(1, { message: 'roundToken 不能为空' }),
      phaseEpoch: z
        .number()
        .int({ message: 'phaseEpoch 必须为整数' })
        .min(1, { message: 'phaseEpoch 必须 >= 1' }),
      phase: z.enum([
        'created',
        'answering',
        'arranging',
        'betting',
        'settlement',
        'game_over',
      ]),
    })
    .strict('phase_timeout 动作包含非法字段'),

  z
    .object({
      type: z.literal('player_forfeited'),
      playerIds: z
        .array(z.string().min(1))
        .min(1, { message: 'playerIds 不能为空' }),
    })
    .strict('player_forfeited 动作包含非法字段'),
]);

export function parseConfig(input: unknown): WitsWagersConfig {
  return witsWagersConfigSchema.parse(input);
}

export function parseAction(input: unknown): WitsWagersAction {
  return witsWagersActionSchema.parse(input) as WitsWagersAction;
}
