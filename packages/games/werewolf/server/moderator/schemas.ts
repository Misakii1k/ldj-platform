import { z } from 'zod';
import type { WerewolfModeratorAction, WerewolfModeratorConfig } from './types.ts';

const pid = z.string().min(1).max(64);

export const werewolfModeratorActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('begin') }).strict(),
  z.object({ type: z.literal('eliminate_player'), targetPlayerId: pid }).strict(),
  z.object({ type: z.literal('revive_player'), targetPlayerId: pid }).strict(),
  z.object({ type: z.literal('end_game') }).strict(),
]);

export const werewolfModeratorConfigSchema = z
  .object({
    rulesetId: z.literal('werewolf_moderator_v1').optional(),
    moderatorPlayerId: pid.optional(),
    hostPlayerId: pid.optional(),
    guard: z.boolean().optional(),
    hunter: z.boolean().optional(),
    idiot: z.boolean().optional(),
    wolfDelta: z.number().int().optional(),
    roles: z
      .object({
        guard: z.boolean().optional(),
        hunter: z.boolean().optional(),
        idiot: z.boolean().optional(),
      })
      .optional(),
  })
  .passthrough();

export function parseModeratorAction(input: unknown): WerewolfModeratorAction {
  return werewolfModeratorActionSchema.parse(input) as WerewolfModeratorAction;
}

export function parseModeratorConfig(input: unknown): WerewolfModeratorConfig {
  return werewolfModeratorConfigSchema.parse(input ?? {}) as WerewolfModeratorConfig;
}
