import { z } from 'zod';
import type { WerewolfModeratorAction, WerewolfModeratorConfig } from './types.ts';

const pid = z.string().min(1).max(64);

export const werewolfModeratorActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('moderator_voice_play'), cues: z.array(z.string().min(1).max(80)).min(1).max(16), output: z.enum(['local','room']), timelineId: z.string().nullable(), confirmed: z.boolean() }).strict(),
  z.object({ type: z.literal('moderator_voice_stop'), announcementId: z.string().min(1) }).strict(),
  z.object({ type: z.literal('begin') }).strict(),
  z.object({ type: z.literal('eliminate_player'), targetPlayerId: pid }).strict(),
  z.object({ type: z.literal('revive_player'), targetPlayerId: pid }).strict(),
  z.object({ type: z.literal('end_game') }).strict(),
  z.object({
    type: z.literal('moderator_set_mode'),
    mode: z.enum(['manual', 'auto']),
    timelineId: z.string().min(1),
  }).strict(),
  z.object({
    type: z.literal('moderator_next'),
    timelineId: z.string().min(1),
  }).strict(),
  z.object({
    type: z.literal('moderator_pause'),
    timelineId: z.string().min(1),
  }).strict(),
  z.object({
    type: z.literal('moderator_resume'),
    timelineId: z.string().min(1),
  }).strict(),
  z.object({
    type: z.literal('moderator_skip'),
    timelineId: z.string().min(1),
  }).strict(),
  z.object({
    type: z.literal('moderator_disconnected'),
    moderatorPlayerId: pid,
  }).strict(),
  z.object({
    type: z.literal('timeline_timeout'),
    timelineId: z.string().min(1),
    token: z.string().min(1),
  }).strict(),
]);

export const werewolfModeratorConfigSchema = z
  .object({
    rulesetId: z.literal('werewolf_moderator_v1').optional(),
    moderatorPlayerId: pid.optional(),
    hostPlayerId: pid.optional(),
    seatNumbers: z.record(z.string(), z.number().int().min(1).max(64)).optional(),
    guard: z.boolean().optional(),
    hunter: z.boolean().optional(),
    idiot: z.boolean().optional(),
    wolfDelta: z.number().int().optional(),
    pace: z.enum(['fast', 'standard', 'relaxed']).optional(),
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
  const parsed = werewolfModeratorConfigSchema.parse(input ?? {}) as WerewolfModeratorConfig;
  return {
    ...parsed,
    pace: parsed.pace ?? 'standard',
  };
}
