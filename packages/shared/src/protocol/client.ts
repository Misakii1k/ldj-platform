import { z } from 'zod';

import {
  gameIdSchema,
  identityIdSchema,
  nonNegativeIntegerSchema,
  playerIdSchema,
  requestIdSchema,
  resumeTokenSchema,
  roomCodeSchema,
} from '../ids.js';
import { emptyPayloadSchema, safeJsonObjectSchema } from '../json.js';
import {
  clientChatTextSchema,
  clientNicknameSchema,
  containsOnlyUnicodeScalars,
} from '../text.js';

const passwordSchema = z
  .string()
  .max(64)
  .refine(containsOnlyUnicodeScalars, 'password must contain valid Unicode scalar values')
  .refine((value) => {
    const length = Array.from(value).length;
    return length >= 4 && length <= 32;
  }, 'password must contain 4 to 32 Unicode characters');
const roleSchema = z.enum(['player', 'spectator']);

const createRoomPayloadSchema = z
  .object({
    identityId: identityIdSchema,
    nickname: clientNicknameSchema,
    password: passwordSchema.optional(),
    gameId: gameIdSchema,
    gameConfig: safeJsonObjectSchema.optional(),
    spectatorsAllowed: z.boolean().optional(),
  })
  .strict();

const joinRoomPayloadSchema = z
  .object({
    identityId: identityIdSchema,
    roomCode: roomCodeSchema,
    nickname: clientNicknameSchema,
    role: roleSchema,
    password: passwordSchema.optional(),
  })
  .strict();

const resumeRoomPayloadSchema = z
  .object({
    roomCode: roomCodeSchema,
    playerId: playerIdSchema,
    resumeToken: resumeTokenSchema,
    lastSeq: nonNegativeIntegerSchema,
    chatCursor: nonNegativeIntegerSchema.optional(),
  })
  .strict();

export const roomCommandSchema = z.discriminatedUnion('command', [
  z.object({ command: z.literal('start_game') }).strict(),
  z.object({ command: z.literal('abort_game'), confirmed: z.literal(true) }).strict(),
  z.object({ command: z.literal('return_to_lobby') }).strict(),
  z.object({ command: z.literal('kick_member'), targetPlayerId: playerIdSchema }).strict(),
  z.object({ command: z.literal('transfer_host'), targetPlayerId: playerIdSchema }).strict(),
  z
    .object({
      command: z.literal('update_config'),
      gameId: gameIdSchema,
      gameConfig: safeJsonObjectSchema,
      spectatorsAllowed: z.boolean().optional(),
    })
    .strict(),
]);

const gameActionPayloadSchema = z.object({ action: safeJsonObjectSchema }).strict();

const chatSendPayloadSchema = z
  .object({
    text: clientChatTextSchema,
  })
  .strict();

const resyncPayloadSchema = z
  .object({
    lastSeq: nonNegativeIntegerSchema,
    chatCursor: nonNegativeIntegerSchema.optional(),
  })
  .strict();

const independentEnvelopeFields = {
  v: z.literal(1),
  requestId: requestIdSchema,
} as const;

const sequencedEnvelopeFields = {
  ...independentEnvelopeFields,
  expectedSeq: nonNegativeIntegerSchema,
} as const;

export const createRoomEnvelopeSchema = z
  .object({ ...independentEnvelopeFields, type: z.literal('create_room'), payload: createRoomPayloadSchema })
  .strict();
export const joinRoomEnvelopeSchema = z
  .object({ ...independentEnvelopeFields, type: z.literal('join_room'), payload: joinRoomPayloadSchema })
  .strict();
export const resumeRoomEnvelopeSchema = z
  .object({ ...independentEnvelopeFields, type: z.literal('resume_room'), payload: resumeRoomPayloadSchema })
  .strict();
export const leaveRoomEnvelopeSchema = z
  .object({ ...sequencedEnvelopeFields, type: z.literal('leave_room'), payload: emptyPayloadSchema })
  .strict();
export const roomCommandEnvelopeSchema = z
  .object({ ...sequencedEnvelopeFields, type: z.literal('room_command'), payload: roomCommandSchema })
  .strict();
export const gameActionEnvelopeSchema = z
  .object({ ...sequencedEnvelopeFields, type: z.literal('game_action'), payload: gameActionPayloadSchema })
  .strict();
export const chatSendEnvelopeSchema = z
  .object({ ...independentEnvelopeFields, type: z.literal('chat_send'), payload: chatSendPayloadSchema })
  .strict();
export const resyncEnvelopeSchema = z
  .object({ ...independentEnvelopeFields, type: z.literal('resync'), payload: resyncPayloadSchema })
  .strict();

export const clientEnvelopeSchema = z.discriminatedUnion('type', [
  createRoomEnvelopeSchema,
  joinRoomEnvelopeSchema,
  resumeRoomEnvelopeSchema,
  leaveRoomEnvelopeSchema,
  roomCommandEnvelopeSchema,
  gameActionEnvelopeSchema,
  chatSendEnvelopeSchema,
  resyncEnvelopeSchema,
]);

export type ClientMessage = z.infer<typeof clientEnvelopeSchema>;
export type ClientMessageType = ClientMessage['type'];
export type RoomCommand = z.infer<typeof roomCommandSchema>;
