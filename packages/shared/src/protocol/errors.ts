import { z } from 'zod';

import { nonNegativeIntegerSchema } from '../ids.js';

export const protocolErrorCodes = [
  'INVALID_MESSAGE',
  'UNSUPPORTED_PROTOCOL',
  'ROOM_NOT_FOUND',
  'ROOM_CLOSED',
  'ROOM_FULL',
  'INVALID_PASSWORD',
  'NICKNAME_TAKEN',
  'NOT_AUTHORIZED',
  'INVALID_RESUME_TOKEN',
  'RESERVATION_EXPIRED',
  'SESSION_REPLACED',
  'STALE_CLIENT_STATE',
  'ACTION_NOT_ALLOWED',
  'RATE_LIMITED',
  'RECOVERY_IN_PROGRESS',
  'PERSISTENCE_FAILED',
  'INTERNAL_ERROR',
] as const;

export const protocolErrorCodeSchema = z.enum(protocolErrorCodes);
export type ProtocolErrorCode = z.infer<typeof protocolErrorCodeSchema>;

export const protocolErrorPayloadSchema = z
  .object({
    code: protocolErrorCodeSchema,
    message: z.string().trim().min(1).max(200),
    recoverable: z.boolean(),
    retryAfterMs: nonNegativeIntegerSchema.optional(),
    currentSeq: nonNegativeIntegerSchema.optional(),
  })
  .strict()
  .superRefine((payload, ctx) => {
    if (payload.code === 'RATE_LIMITED' && payload.retryAfterMs === undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'RATE_LIMITED requires retryAfterMs',
        path: ['retryAfterMs'],
      });
    }
    if (payload.code === 'STALE_CLIENT_STATE' && payload.currentSeq === undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'STALE_CLIENT_STATE requires currentSeq',
        path: ['currentSeq'],
      });
    }
    if (payload.code !== 'RATE_LIMITED' && payload.retryAfterMs !== undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'retryAfterMs is only valid for RATE_LIMITED',
        path: ['retryAfterMs'],
      });
    }
    if (payload.code !== 'STALE_CLIENT_STATE' && payload.currentSeq !== undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'currentSeq is only valid for STALE_CLIENT_STATE',
        path: ['currentSeq'],
      });
    }
  });

export type ProtocolErrorPayload = z.infer<typeof protocolErrorPayloadSchema>;
