import { describe, expect, it } from 'vitest';

import {
  clientEnvelopeSchema,
  errorEnvelopeSchema,
  protocolErrorCodes,
  protocolErrorPayloadSchema,
  serverEnvelopeSchema,
} from '../src/index.js';

describe('client protocol v1', () => {
  it('parses a valid create-room envelope and normalizes user text', () => {
    const result = clientEnvelopeSchema.safeParse({
      v: 1,
      type: 'create_room',
      requestId: 'req-1',
      payload: {
        identityId: 'identity-1',
        nickname: '  A\u0301lice  ',
        password: 'party-time',
        gameId: 'undercover',
        gameConfig: { roundSeconds: 30 },
      },
    });

    expect(result.success).toBe(true);
    if (result.success && result.data.type === 'create_room') {
      expect(result.data.payload.nickname).toBe('Álice');
    }
  });

  it('measures room passwords by Unicode code points', () => {
    const base = {
      v: 1,
      type: 'create_room',
      requestId: 'unicode-password',
      payload: { identityId: 'identity-1', nickname: '玩家', gameId: 'undercover' },
    } as const;
    expect(
      clientEnvelopeSchema.safeParse({
        ...base,
        payload: { ...base.payload, password: '😀'.repeat(32) },
      }).success,
    ).toBe(true);
    expect(
      clientEnvelopeSchema.safeParse({
        ...base,
        payload: { ...base.payload, password: '😀'.repeat(33) },
      }).success,
    ).toBe(false);
  });

  it('accepts each declared client message type', () => {
    const messages = [
      {
        v: 1,
        type: 'join_room',
        requestId: '2',
        payload: { identityId: 'i-1', roomCode: 'abc23', nickname: '玩家', role: 'player' },
      },
      {
        v: 1,
        type: 'resume_room',
        requestId: '3',
        payload: {
          roomCode: 'ABC23',
          playerId: 'p-1',
          resumeToken: 'abcdefghijklmnopqrstuvwxyz_12345',
          lastSeq: 2,
        },
      },
      { v: 1, type: 'leave_room', requestId: '4', expectedSeq: 2, payload: {} },
      {
        v: 1,
        type: 'room_command',
        requestId: '5',
        expectedSeq: 2,
        payload: { command: 'start_game' },
      },
      {
        v: 1,
        type: 'game_action',
        requestId: '6',
        expectedSeq: 2,
        payload: { action: { type: 'confirm_word' } },
      },
      { v: 1, type: 'chat_send', requestId: '7', payload: { text: '大家好' } },
      { v: 1, type: 'resync', requestId: '8', payload: { lastSeq: 2, chatCursor: 9 } },
    ];

    for (const message of messages) {
      expect(clientEnvelopeSchema.safeParse(message).success).toBe(true);
    }
  });

  it('rejects unknown envelope and payload fields', () => {
    expect(
      clientEnvelopeSchema.safeParse({
        v: 1,
        type: 'chat_send',
        requestId: 'req-1',
        unexpected: true,
        payload: { text: 'hello' },
      }).success,
    ).toBe(false);

    expect(
      clientEnvelopeSchema.safeParse({
        v: 1,
        type: 'chat_send',
        requestId: 'req-1',
        payload: { text: 'hello', kind: 'system' },
      }).success,
    ).toBe(false);
  });

  it('requires expectedSeq for state-dependent messages', () => {
    expect(
      clientEnvelopeSchema.safeParse({
        v: 1,
        type: 'game_action',
        requestId: 'req-1',
        payload: { action: { type: 'vote', targetPlayerId: 'p-2' } },
      }).success,
    ).toBe(false);
  });

  it('rejects invalid and over-limit text and numbers', () => {
    const invalidMessages = [
      { v: 1, type: 'chat_send', requestId: 'a', payload: { text: ' '.repeat(10) } },
      { v: 1, type: 'chat_send', requestId: 'b', payload: { text: '字'.repeat(301) } },
      {
        v: 1,
        type: 'create_room',
        requestId: 'c',
        payload: { identityId: 'i', nickname: '名'.repeat(17), gameId: 'undercover' },
      },
      {
        v: 1,
        type: 'game_action',
        requestId: 'd',
        expectedSeq: 1,
        payload: { action: { amount: Number.POSITIVE_INFINITY } },
      },
      {
        v: 1,
        type: 'resync',
        requestId: 'e',
        payload: { lastSeq: -1 },
      },
    ];

    for (const message of invalidMessages) {
      expect(clientEnvelopeSchema.safeParse(message).success).toBe(false);
    }
  });

  it('rejects dangerous keys and oversized game action objects', () => {
    const polluted = JSON.parse(
      '{"v":1,"type":"game_action","requestId":"p","expectedSeq":0,"payload":{"action":{"__proto__":{"admin":true}}}}',
    ) as unknown;
    expect(clientEnvelopeSchema.safeParse(polluted).success).toBe(false);

    expect(
      clientEnvelopeSchema.safeParse({
        v: 1,
        type: 'game_action',
        requestId: 'large',
        expectedSeq: 0,
        payload: { action: { blob: 'x'.repeat(17 * 1024) } },
      }).success,
    ).toBe(false);
  });
});

describe('server protocol v1 errors', () => {
  it('accepts every stable error code with the required public fields', () => {
    for (const code of protocolErrorCodes) {
      const hint =
        code === 'RATE_LIMITED'
          ? { retryAfterMs: 1_000 }
          : code === 'STALE_CLIENT_STATE'
            ? { currentSeq: 12 }
            : {};
      expect(
        protocolErrorPayloadSchema.safeParse({
          code,
          message: '请稍后重试',
          recoverable: true,
          ...hint,
        }).success,
      ).toBe(true);
    }
  });

  it('supports retry and sequence hints and rejects internal details', () => {
    expect(
      protocolErrorPayloadSchema.safeParse({
        code: 'STALE_CLIENT_STATE',
        message: '客户端状态已过期',
        recoverable: true,
        currentSeq: 12,
      }).success,
    ).toBe(true);

    expect(
      protocolErrorPayloadSchema.safeParse({
        code: 'INTERNAL_ERROR',
        message: '服务暂时不可用',
        recoverable: false,
        stack: 'secret stack',
      }).success,
    ).toBe(false);

    expect(
      protocolErrorPayloadSchema.safeParse({
        code: 'RATE_LIMITED',
        message: '操作太频繁',
        recoverable: true,
      }).success,
    ).toBe(false);
  });

  it('requires error and ack correlation and roomSeq on state messages', () => {
    expect(
      errorEnvelopeSchema.safeParse({
        v: 1,
        type: 'error',
        serverNow: 1,
        payload: { code: 'INVALID_MESSAGE', message: '消息无效', recoverable: false },
      }).success,
    ).toBe(false);

    expect(
      serverEnvelopeSchema.safeParse({
        v: 1,
        type: 'game_state',
        serverNow: 1,
        payload: { sessionId: 's-1', moduleId: 'undercover', view: {} },
      }).success,
    ).toBe(false);
  });
});
