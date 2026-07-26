import { identityIdSchema } from '@lan-party/shared';
import { describe, expect, it } from 'vitest';

import {
  buildCreateRoomEnvelope,
  buildJoinRoomEnvelope,
  buildResyncEnvelope,
  buildResumeRoomEnvelope,
  validateLobbyForm,
  type LobbyForm,
} from './envelopes';

const baseForm: LobbyForm = {
  nickname: '  阿沐  ',
  roomCode: 'abc23',
  password: '',
  role: 'player',
};
const identityId = identityIdSchema.parse('device-test');

describe('lobby envelopes', () => {
  it('constructs create requests through the shared protocol schema', () => {
    const message = buildCreateRoomEnvelope(baseForm, identityId, () => 'request:create');
    expect(message).toEqual({
      v: 1,
      type: 'create_room',
      requestId: 'request:create',
      payload: {
        identityId: 'device-test',
        nickname: '阿沐',
        gameId: 'undercover',
        spectatorsAllowed: true,
      },
    });
  });

  it('normalizes room code and carries the chosen join role', () => {
    const message = buildJoinRoomEnvelope(
      { ...baseForm, password: 'card-table', role: 'spectator' },
      identityId,
      () => 'request:join',
    );
    expect(message.type).toBe('join_room');
    if (message.type !== 'join_room') throw new Error('Unexpected message type');
    expect(message.payload).toMatchObject({
      roomCode: 'ABC23',
      nickname: '阿沐',
      role: 'spectator',
      password: 'card-table',
    });
  });

  it('builds a resume request without exposing identity data', () => {
    const message = buildResumeRoomEnvelope(
      {
        roomCode: 'ABC23',
        playerId: 'player-a',
        resumeToken: 'a'.repeat(32),
        lastSeq: 9,
        savedAt: 1,
      },
      () => 'request:resume',
    );
    expect(message).toMatchObject({
      type: 'resume_room',
      requestId: 'request:resume',
      payload: { roomCode: 'ABC23', playerId: 'player-a', lastSeq: 9 },
    });
    expect('identityId' in message.payload).toBe(false);
  });

  it('returns field-local validation messages', () => {
    expect(validateLobbyForm('join', { ...baseForm, nickname: '', roomCode: 'O1', password: '123' }))
      .toEqual({
        nickname: '昵称需为 1–16 个字符',
        roomCode: '请输入 5 位房间码（不含 0、1、I、O）',
        password: '密码留空，或输入 4–32 个字符',
      });
  });

  it('counts password length by Unicode code points', () => {
    expect(validateLobbyForm('create', { ...baseForm, password: '🃏'.repeat(3) }).password).toBeDefined();
    expect(validateLobbyForm('create', { ...baseForm, password: '🃏'.repeat(4) }).password).toBeUndefined();
    expect(validateLobbyForm('create', { ...baseForm, password: '🃏'.repeat(33) }).password).toBeDefined();
  });

  it('keeps the last applied room sequence in resync requests', () => {
    expect(buildResyncEnvelope(12, () => 'request:resync')).toEqual({
      v: 1,
      type: 'resync',
      requestId: 'request:resync',
      payload: { lastSeq: 12 },
    });
  });
});
