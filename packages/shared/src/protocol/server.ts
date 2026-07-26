import { z } from 'zod';

import {
  connectionIdSchema,
  gameIdSchema,
  moduleVersionSchema,
  nonNegativeIntegerSchema,
  playerIdSchema,
  requestIdSchema,
  roomCodeSchema,
  sessionIdSchema,
  timestampSchema,
} from '../ids.js';
import { jsonValueSchema, safeJsonObjectSchema } from '../json.js';
import { protocolErrorPayloadSchema } from './errors.js';

export const roomStatusSchema = z.enum(['LOBBY', 'IN_GAME', 'POST_GAME', 'CLOSED']);
export const memberRoleSchema = z.enum(['player', 'spectator']);
export const connectionStatusSchema = z.enum([
  'CONNECTED',
  'DISCONNECTED_RESERVED',
  'EXPIRED',
  'KICKED',
]);
export const gameSessionStatusSchema = z.enum([
  'PREPARING',
  'ACTIVE',
  'RECOVERING',
  'FINISHED',
  'ABORTED',
]);

export const roomMemberViewSchema = z
  .object({
    playerId: playerIdSchema,
    nickname: z.string().min(1).max(64),
    role: memberRoleSchema,
    connectionStatus: connectionStatusSchema,
    isHost: z.boolean(),
    joinedAt: timestampSchema,
  })
  .strict();

export const roomSnapshotPayloadSchema = z
  .object({
    roomCode: roomCodeSchema,
    status: roomStatusSchema,
    hostPlayerId: playerIdSchema.nullable(),
    members: z.array(roomMemberViewSchema).max(20),
    spectatorsAllowed: z.boolean(),
    game: z
      .object({
        sessionId: sessionIdSchema,
        moduleId: gameIdSchema,
        moduleVersion: moduleVersionSchema,
        status: gameSessionStatusSchema,
      })
      .strict()
      .nullable(),
  })
  .strict();

export const chatMessageSchema = z
  .object({
    id: nonNegativeIntegerSchema,
    fromPlayerId: playerIdSchema.nullable(),
    kind: z.enum(['user', 'system']),
    text: z.string().min(1).max(200),
    createdAt: timestampSchema,
  })
  .strict();

const serverBase = {
  v: z.literal(1),
  serverNow: timestampSchema,
} as const;

const stateBase = {
  ...serverBase,
  roomSeq: nonNegativeIntegerSchema,
} as const;

export const welcomeEnvelopeSchema = z
  .object({
    ...serverBase,
    type: z.literal('welcome'),
    payload: z
      .object({
        protocolVersion: z.literal(1),
        connectionId: connectionIdSchema,
        serverVersion: z.string().min(1).max(64),
      })
      .strict(),
  })
  .strict();

export const ackEnvelopeSchema = z
  .object({
    ...stateBase,
    type: z.literal('ack'),
    requestId: requestIdSchema,
    payload: z.object({ accepted: z.literal(true), result: jsonValueSchema.optional() }).strict(),
  })
  .strict();

export const errorEnvelopeSchema = z
  .object({
    ...serverBase,
    type: z.literal('error'),
    requestId: requestIdSchema,
    roomSeq: nonNegativeIntegerSchema.optional(),
    payload: protocolErrorPayloadSchema,
  })
  .strict();

export const roomSnapshotEnvelopeSchema = z
  .object({ ...stateBase, type: z.literal('room_snapshot'), payload: roomSnapshotPayloadSchema })
  .strict();
export const gameStateEnvelopeSchema = z
  .object({
    ...stateBase,
    type: z.literal('game_state'),
    payload: z
      .object({ sessionId: sessionIdSchema, moduleId: gameIdSchema, view: safeJsonObjectSchema })
      .strict(),
  })
  .strict();
export const gameEventEnvelopeSchema = z
  .object({
    ...stateBase,
    type: z.literal('game_event'),
    payload: z
      .object({ sessionId: sessionIdSchema, moduleId: gameIdSchema, event: safeJsonObjectSchema })
      .strict(),
  })
  .strict();
export const chatBatchEnvelopeSchema = z
  .object({
    ...serverBase,
    type: z.literal('chat_batch'),
    payload: z
      .object({
        messages: z.array(chatMessageSchema).max(100),
        nextCursor: nonNegativeIntegerSchema.optional(),
        hasMore: z.boolean(),
      })
      .strict(),
  })
  .strict();
export const sessionReplacedEnvelopeSchema = z
  .object({
    ...serverBase,
    type: z.literal('session_replaced'),
    payload: z.object({ reason: z.literal('new_connection') }).strict(),
  })
  .strict();
export const resyncRequiredEnvelopeSchema = z
  .object({
    ...stateBase,
    type: z.literal('resync_required'),
    payload: z
      .object({
        reason: z.enum(['sequence_gap', 'incompatible_version']),
        currentSeq: nonNegativeIntegerSchema,
      })
      .strict(),
  })
  .strict();

export const serverEnvelopeSchema = z.discriminatedUnion('type', [
  welcomeEnvelopeSchema,
  ackEnvelopeSchema,
  errorEnvelopeSchema,
  roomSnapshotEnvelopeSchema,
  gameStateEnvelopeSchema,
  gameEventEnvelopeSchema,
  chatBatchEnvelopeSchema,
  sessionReplacedEnvelopeSchema,
  resyncRequiredEnvelopeSchema,
]);

export type ServerMessage = z.infer<typeof serverEnvelopeSchema>;
export type ServerMessageType = ServerMessage['type'];
export type RoomSnapshotPayload = z.infer<typeof roomSnapshotPayloadSchema>;
export type RoomMemberView = z.infer<typeof roomMemberViewSchema>;
