import { z } from 'zod';

/** Public presentation role whitelist. Never contains a player id, seat, or target. */
export const WEREWOLF_TIMELINE_ROLES = [
  'wolf',
  'witch',
  'seer',
  'guard',
  'hunter',
  'idiot',
  'hunter_idiot',
] as const;
export type WerewolfTimelineRole = (typeof WEREWOLF_TIMELINE_ROLES)[number];

/** Public presentation segment whitelist. */
export const WEREWOLF_TIMELINE_SEGMENTS = [
  'intro',
  'open',
  'action',
  'close',
  'dawn',
  'day',
  'confirm',
] as const;
export type WerewolfTimelineSegment = (typeof WEREWOLF_TIMELINE_SEGMENTS)[number];

/** Public audio cue whitelist keys (cue audio asset manifest measured in T03). */
export const WEREWOLF_TIMELINE_CUES = [
  'night_start',
  'wolf_action',
  'witch_action',
  'seer_action',
  'guard_action',
  'hunter_idiot_confirm',
  'dawn',
] as const;
export type WerewolfTimelineCue = (typeof WEREWOLF_TIMELINE_CUES)[number];

/**
 * Public presentation clock (Contract B).
 * Never contains a player id, seat, target, or private result.
 */
export const werewolfTimelineSchema = z
  .object({
    version: z.literal(1),
    id: z.string().min(1),
    day: z.number().int().nonnegative(),
    period: z.enum(['day', 'night']),
    role: z.enum(WEREWOLF_TIMELINE_ROLES).nullable(),
    segment: z.enum(WEREWOLF_TIMELINE_SEGMENTS),
    cue: z.string().nullable(),
    label: z.string(),
    startedAt: z.number().int().nonnegative(),
    endsAt: z.number().int().nonnegative().nullable(),
    actionDeadlineAt: z.number().int().nonnegative().nullable(),
    mode: z.enum(['manual', 'auto']),
    paused: z.boolean(),
    pauseRemainingMs: z.number().int().nonnegative().nullable(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.endsAt !== null && data.endsAt < data.startedAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'endsAt must be greater than or equal to startedAt',
        path: ['endsAt'],
      });
    }
    if (data.actionDeadlineAt !== null) {
      if (data.actionDeadlineAt < data.startedAt) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'actionDeadlineAt must be greater than or equal to startedAt',
          path: ['actionDeadlineAt'],
        });
      }
      if (data.endsAt === null || data.actionDeadlineAt > data.endsAt) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'actionDeadlineAt must be less than or equal to endsAt',
          path: ['actionDeadlineAt'],
        });
      }
    }
    if (data.mode === 'manual' || data.paused) {
      if (data.endsAt !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'manual mode or paused state must not have active endsAt',
          path: ['endsAt'],
        });
      }
      if (data.actionDeadlineAt !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'manual mode or paused state must not have active actionDeadlineAt',
          path: ['actionDeadlineAt'],
        });
      }
    }
    if (!data.paused && data.pauseRemainingMs !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'pauseRemainingMs must be null when not paused',
        path: ['pauseRemainingMs'],
      });
    }
  });

export type WerewolfTimeline = z.infer<typeof werewolfTimelineSchema>;

/**
 * Internal timeline state (Contract B).
 * Never serialized in whole to client.
 */
export interface WerewolfTimelineState {
  readonly version: 1;
  readonly stepIndex: number;
  readonly revision: number;
  readonly pausedRemainingMs: number | null;
  readonly activeTimerToken: string | null;
  readonly initialRolePlan: readonly WerewolfTimelineRole[];
  readonly current: WerewolfTimeline;
}

/** Timeline timeout action produced only by system actor */
export interface WerewolfTimelineTimeoutAction {
  readonly type: 'timeline_timeout';
  readonly timelineId: string;
  readonly token: string;
}

/** Common extension for night player actions under authoritative timeline */
export interface WerewolfNightActionPayload {
  readonly timelineId?: string;
}
