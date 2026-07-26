import {
  createRoomEnvelopeSchema,
  joinRoomEnvelopeSchema,
  resyncEnvelopeSchema,
  resumeRoomEnvelopeSchema,
  type ClientMessage,
  type IdentityId,
} from '@lan-party/shared';

import type { RoomCredential } from './credentials';
import { createRandomId } from './random-id';

export type LobbyMode = 'create' | 'join';
export type MemberRole = 'player' | 'spectator';

export interface LobbyForm {
  nickname: string;
  roomCode: string;
  password: string;
  role: MemberRole;
}

export type LobbyField = 'nickname' | 'roomCode' | 'password';
export type LobbyFieldErrors = Partial<Record<LobbyField, string>>;

export type RequestIdFactory = () => string;

export const createRequestId: RequestIdFactory = () => createRandomId('web');

export function validateLobbyForm(mode: LobbyMode, form: LobbyForm): LobbyFieldErrors {
  const errors: LobbyFieldErrors = {};
  const nicknameLength = Array.from(form.nickname.trim().normalize('NFC')).length;
  if (nicknameLength < 1 || nicknameLength > 16) errors.nickname = '昵称需为 1–16 个字符';
  if (mode === 'join' && !/^[A-HJ-NP-Z2-9]{5}$/.test(form.roomCode.trim().toUpperCase())) {
    errors.roomCode = '请输入 5 位房间码（不含 0、1、I、O）';
  }
  const passwordLength = Array.from(form.password).length;
  if (passwordLength > 0 && (passwordLength < 4 || passwordLength > 32)) {
    errors.password = '密码留空，或输入 4–32 个字符';
  }
  return errors;
}

function optionalPassword(password: string): string | undefined {
  return password.length === 0 ? undefined : password;
}

export function buildCreateRoomEnvelope(
  form: LobbyForm,
  identityId: IdentityId,
  requestId: RequestIdFactory = createRequestId,
): ClientMessage {
  return createRoomEnvelopeSchema.parse({
    v: 1,
    type: 'create_room',
    requestId: requestId(),
    payload: {
      identityId,
      nickname: form.nickname,
      password: optionalPassword(form.password),
      gameId: 'undercover',
      spectatorsAllowed: true,
    },
  });
}

export function buildJoinRoomEnvelope(
  form: LobbyForm,
  identityId: IdentityId,
  requestId: RequestIdFactory = createRequestId,
): ClientMessage {
  return joinRoomEnvelopeSchema.parse({
    v: 1,
    type: 'join_room',
    requestId: requestId(),
    payload: {
      identityId,
      roomCode: form.roomCode,
      nickname: form.nickname,
      role: form.role,
      password: optionalPassword(form.password),
    },
  });
}

export function buildResumeRoomEnvelope(
  credential: RoomCredential,
  requestId: RequestIdFactory = createRequestId,
): ClientMessage {
  return resumeRoomEnvelopeSchema.parse({
    v: 1,
    type: 'resume_room',
    requestId: requestId(),
    payload: {
      roomCode: credential.roomCode,
      playerId: credential.playerId,
      resumeToken: credential.resumeToken,
      lastSeq: credential.lastSeq,
    },
  });
}

export function buildResyncEnvelope(
  lastSeq: number,
  requestId: RequestIdFactory = createRequestId,
): ClientMessage {
  return resyncEnvelopeSchema.parse({
    v: 1,
    type: 'resync',
    requestId: requestId(),
    payload: { lastSeq },
  });
}
