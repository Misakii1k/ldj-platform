import { z } from 'zod';

const opaqueId = <T extends string>(name: T) =>
  z
    .string()
    .min(1)
    .max(128)
    .regex(/^[A-Za-z0-9._:-]+$/, `${name} contains unsupported characters`)
    .brand<T>();

export const identityIdSchema = opaqueId('IdentityId');
export const playerIdSchema = opaqueId('PlayerId');
export const connectionIdSchema = opaqueId('ConnectionId');
export const roomIdSchema = opaqueId('RoomId');
export const sessionIdSchema = opaqueId('SessionId');

export type IdentityId = z.infer<typeof identityIdSchema>;
export type PlayerId = z.infer<typeof playerIdSchema>;
export type ConnectionId = z.infer<typeof connectionIdSchema>;
export type RoomId = z.infer<typeof roomIdSchema>;
export type SessionId = z.infer<typeof sessionIdSchema>;

export const requestIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/, 'requestId contains unsupported characters');

export const roomCodeSchema = z.preprocess(
  (value) => (typeof value === 'string' ? value.trim().toUpperCase() : value),
  z.string().regex(/^[A-HJ-NP-Z2-9]{5}$/, 'roomCode must be a five-character room code'),
);

export const resumeTokenSchema = z
  .string()
  .min(32)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/, 'resumeToken must use base64url characters');

export const gameIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'gameId must use lowercase kebab-case');

export const moduleVersionSchema = z.string().min(1).max(32);
export const nonNegativeIntegerSchema = z.number().int().min(0).safe();
export const timestampSchema = nonNegativeIntegerSchema;

export type RequestId = z.infer<typeof requestIdSchema>;
export type RoomCode = z.infer<typeof roomCodeSchema>;
export type ResumeToken = z.infer<typeof resumeTokenSchema>;
export type GameId = z.infer<typeof gameIdSchema>;
export type ModuleVersion = z.infer<typeof moduleVersionSchema>;
export type Timestamp = z.infer<typeof timestampSchema>;
