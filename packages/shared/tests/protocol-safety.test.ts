import { describe, expect, it } from 'vitest';

import {
  chatMessageSchema,
  clientEnvelopeSchema,
  roomMemberViewSchema,
  safeJsonValueSchema,
  serverEnvelopeSchema,
} from '../src/index.js';

function validAck(result: unknown): unknown {
  return {
    v: 1,
    type: 'ack',
    serverNow: 1,
    roomSeq: 1,
    requestId: 'request-1',
    payload: { accepted: true, result },
  };
}

function validMember(nickname: string): unknown {
  return {
    playerId: 'player-1',
    nickname,
    role: 'player',
    connectionStatus: 'CONNECTED',
    isHost: false,
    joinedAt: 1,
  };
}

function validChat(text: string): unknown {
  return {
    id: 1,
    fromPlayerId: 'player-1',
    kind: 'user',
    text,
    createdAt: 1,
  };
}

describe('safe JSON protocol values', () => {
  it('accepts safe scalar, array, and object acknowledgement results', () => {
    for (const result of [true, 42, 'ready', null, [1, 'two'], { ready: true }]) {
      expect(safeJsonValueSchema.safeParse(result).success).toBe(true);
      expect(serverEnvelopeSchema.safeParse(validAck(result)).success).toBe(true);
    }
  });

  it.each(['__proto__', 'constructor', 'prototype'])(
    'rejects the dangerous key %s anywhere in acknowledgement results',
    (key) => {
      const result = JSON.parse(`{"outer":{"${key}":{"admin":true}}}`) as unknown;
      expect(safeJsonValueSchema.safeParse(result).success).toBe(false);
      expect(serverEnvelopeSchema.safeParse(validAck(result)).success).toBe(false);
    },
  );

  it('rejects acknowledgement results beyond the depth, entry, and byte limits', () => {
    let tooDeep: Record<string, unknown> = { value: true };
    for (let index = 0; index < 11; index += 1) tooDeep = { nested: tooDeep };

    const tooManyEntries = Object.fromEntries(
      Array.from({ length: 257 }, (_, index) => [`key-${String(index)}`, index]),
    );
    const tooManyBytes = Object.fromEntries(
      Array.from({ length: 10 }, (_, index) => [`key-${String(index)}`, 'x'.repeat(1_700)]),
    );

    for (const result of [tooDeep, tooManyEntries, tooManyBytes]) {
      expect(safeJsonValueSchema.safeParse(result).success).toBe(false);
      expect(serverEnvelopeSchema.safeParse(validAck(result)).success).toBe(false);
    }
  });
});

describe('canonical protocol text', () => {
  it('requires server member nicknames to be trimmed NFC Unicode scalar strings of length 1 to 16', () => {
    expect(roomMemberViewSchema.safeParse(validMember('😀'.repeat(16))).success).toBe(true);

    for (const nickname of [
      '',
      ' nickname ',
      'A\u0301lice',
      '😀'.repeat(17),
      `broken-\uD800`,
    ]) {
      expect(roomMemberViewSchema.safeParse(validMember(nickname)).success).toBe(false);
    }
  });

  it('requires server chat to be trimmed NFC Unicode scalar text of length 1 to 300', () => {
    expect(chatMessageSchema.safeParse(validChat('😀'.repeat(300))).success).toBe(true);

    for (const text of ['', '   ', ' message ', 'A\u0301', '😀'.repeat(301), `broken-\uDC00`]) {
      expect(chatMessageSchema.safeParse(validChat(text)).success).toBe(false);
    }
  });

  it('rejects unpaired surrogates in client text while retaining normalization', () => {
    const invalidMessages = [
      {
        v: 1,
        type: 'create_room',
        requestId: 'nickname-surrogate',
        payload: {
          identityId: 'identity-1',
          nickname: `broken-\uD800`,
          gameId: 'undercover',
        },
      },
      {
        v: 1,
        type: 'chat_send',
        requestId: 'chat-surrogate',
        payload: { text: `broken-\uDC00` },
      },
      {
        v: 1,
        type: 'create_room',
        requestId: 'password-surrogate',
        payload: {
          identityId: 'identity-1',
          nickname: '玩家',
          password: `abcd\uD800`,
          gameId: 'undercover',
        },
      },
    ];

    for (const message of invalidMessages) {
      expect(clientEnvelopeSchema.safeParse(message).success).toBe(false);
    }

    const normalized = clientEnvelopeSchema.safeParse({
      v: 1,
      type: 'chat_send',
      requestId: 'normalized-chat',
      payload: { text: '  A\u0301  ' },
    });
    expect(normalized.success).toBe(true);
    if (normalized.success && normalized.data.type === 'chat_send') {
      expect(normalized.data.payload.text).toBe('\u00C1');
    }
  });
});
