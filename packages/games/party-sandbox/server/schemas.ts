import { z } from 'zod';
import type {
  PartySandboxAction,
  PartySandboxConfig,
  ResolvedPartySandboxConfig,
  SandboxCard,
  SandboxProp,
} from './types.ts';

const pid = z.string().min(1).max(64);

export const sandboxCardSchema = z
  .object({
    id: z.string().min(1).max(64),
    title: z.string().min(1).max(128),
    content: z.string().min(1).max(1024),
    category: z.string().max(64).optional(),
    tags: z.array(z.string().max(32)).optional(),
  })
  .strict();

export const revolverPropSchema = z
  .object({
    id: z.string().min(1).max(64),
    kind: z.literal('revolver'),
    title: z.string().min(1).max(64),
    chambers: z.number().int().min(2).max(12),
    currentChamber: z.number().int().min(0).max(11),
    cylinder: z.array(z.enum(['live', 'blank'])),
    lastAction: z
      .object({
        playerId: pid,
        targetPlayerId: pid.optional(),
        result: z.enum(['live', 'blank', 'spin']),
        timestamp: z.number(),
      })
      .nullable(),
  })
  .strict();

export const dicePropSchema = z
  .object({
    id: z.string().min(1).max(64),
    kind: z.literal('dice'),
    title: z.string().min(1).max(64),
    diceCount: z.number().int().min(1).max(10),
    diceType: z.enum(['d6', 'd20']),
    values: z.array(z.number().int().min(1).max(20)),
    isCupCovered: z.boolean(),
    lastRollBy: pid.nullable(),
    lastRollTimestamp: z.number().nullable(),
  })
  .strict();

export const bellPropSchema = z
  .object({
    id: z.string().min(1).max(64),
    kind: z.literal('bell'),
    title: z.string().min(1).max(64),
    rungBy: pid.nullable(),
    rungTimestamp: z.number().nullable(),
    ringCount: z.number().int().min(0),
  })
  .strict();

export const deckPropSchema = z
  .object({
    id: z.string().min(1).max(64),
    kind: z.literal('deck'),
    title: z.string().min(1).max(64),
    drawPile: z.array(sandboxCardSchema),
    discardPile: z.array(sandboxCardSchema),
    tableCards: z.array(
      z
        .object({
          card: sandboxCardSchema,
          playedBy: pid,
          isPublic: z.boolean(),
        })
        .strict(),
    ),
  })
  .strict();

export const timerPropSchema = z
  .object({
    id: z.string().min(1).max(64),
    kind: z.literal('timer'),
    title: z.string().min(1).max(64),
    durationSeconds: z.number().int().min(1).max(3600),
    remainingSeconds: z.number().int().min(0).max(3600),
    isRunning: z.boolean(),
    isExploded: z.boolean(),
    startedBy: pid.nullable(),
    startedAt: z.number().nullable(),
  })
  .strict();

export const coinPropSchema = z
  .object({
    id: z.string().min(1).max(64),
    kind: z.literal('coin'),
    title: z.string().min(1).max(64),
    lastFlipResult: z.enum(['heads', 'tails']).nullable(),
    flippedBy: pid.nullable(),
    flipTimestamp: z.number().nullable(),
  })
  .strict();

export const wheelSegmentSchema = z
  .object({
    label: z.string().min(1).max(64),
    color: z.string().max(32).optional(),
  })
  .strict();

export const wheelPropSchema = z
  .object({
    id: z.string().min(1).max(64),
    kind: z.literal('wheel'),
    title: z.string().min(1).max(64),
    segments: z.array(wheelSegmentSchema).min(2).max(24),
    rotationAngle: z.number(),
    isSpinning: z.boolean(),
    lastResult: z.string().nullable(),
    spunBy: pid.nullable(),
    spinTimestamp: z.number().nullable(),
  })
  .strict();

export const scoreboardPropSchema = z
  .object({
    id: z.string().min(1).max(64),
    kind: z.literal('scoreboard'),
    title: z.string().min(1).max(64),
    currencyName: z.string().min(1).max(16),
    scores: z.record(z.string(), z.number().int()),
  })
  .strict();

export const sandboxPropSchema = z.discriminatedUnion('kind', [
  revolverPropSchema,
  dicePropSchema,
  bellPropSchema,
  deckPropSchema,
  timerPropSchema,
  coinPropSchema,
  wheelPropSchema,
  scoreboardPropSchema,
]);

export const partySandboxConfigSchema = z
  .object({
    rulesetId: z.literal('party_sandbox_v1').optional(),
  })
  .strict();

export function parsePartySandboxConfig(input: unknown): ResolvedPartySandboxConfig {
  const parsed = partySandboxConfigSchema.parse(input ?? {});
  return {
    rulesetId: parsed.rulesetId ?? 'party_sandbox_v1',
  };
}

export const partySandboxActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('begin') }).strict(),
  z
    .object({
      type: z.literal('spawn_prop'),
      playerId: pid,
      prop: sandboxPropSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('remove_prop'),
      playerId: pid,
      propId: z.string().min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal('operate_revolver'),
      playerId: pid,
      propId: z.string().min(1),
      subAction: z.enum(['spin', 'shoot', 'load']),
      targetPlayerId: pid.optional(),
      chambers: z.number().int().min(2).max(12).optional(),
      liveCount: z.number().int().min(0).max(12).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('operate_dice'),
      playerId: pid,
      propId: z.string().min(1),
      subAction: z.enum(['roll', 'toggle_cup', 'set_count', 'set_type']),
      count: z.number().int().min(1).max(10).optional(),
      diceType: z.enum(['d6', 'd20']).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('operate_bell'),
      playerId: pid,
      propId: z.string().min(1),
      subAction: z.enum(['ring', 'reset']),
    })
    .strict(),
  z
    .object({
      type: z.literal('operate_deck'),
      playerId: pid,
      propId: z.string().min(1),
      subAction: z.enum([
        'draw',
        'deal_all',
        'play_hand',
        'discard_table',
        'shuffle',
        'load_cards',
        'add_card',
        'remove_card',
      ]),
      cardId: z.string().min(1).optional(),
      isPublic: z.boolean().optional(),
      cards: z.array(sandboxCardSchema).optional(),
      card: sandboxCardSchema.optional(),
      title: z.string().max(64).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('operate_timer'),
      playerId: pid,
      propId: z.string().min(1),
      subAction: z.enum(['start', 'pause', 'reset', 'set_duration', 'tick']),
      seconds: z.number().int().min(1).max(3600).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('operate_coin'),
      playerId: pid,
      propId: z.string().min(1),
      subAction: z.literal('flip'),
    })
    .strict(),
  z
    .object({
      type: z.literal('operate_wheel'),
      playerId: pid,
      propId: z.string().min(1),
      subAction: z.enum(['spin', 'set_segments']),
      segments: z.array(wheelSegmentSchema).min(2).max(24).optional(),
      targetAngle: z.number().optional(),
      result: z.string().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('operate_scoreboard'),
      playerId: pid,
      propId: z.string().min(1),
      subAction: z.enum(['modify_score', 'reset_scores', 'set_currency']),
      targetPlayerId: pid.optional(),
      delta: z.number().int().optional(),
      initialScore: z.number().int().optional(),
      currencyName: z.string().min(1).max(16).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('ai_setup_table'),
      playerId: pid,
      prompt: z.string().min(1).max(500),
      reply: z.string().min(1).max(2000),
      newProps: z.array(sandboxPropSchema).optional(),
      replaceDeckCards: z
        .object({
          deckId: z.string().optional(),
          title: z.string().min(1).max(64),
          cards: z.array(sandboxCardSchema),
        })
        .strict()
        .optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('reset_table'),
      playerId: pid,
    })
    .strict(),
  z
    .object({
      type: z.literal('player_forfeited'),
      playerIds: z.array(pid),
    })
    .strict(),
]);

export function parsePartySandboxAction(input: unknown): PartySandboxAction {
  return partySandboxActionSchema.parse(input);
}
