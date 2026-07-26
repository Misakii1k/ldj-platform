import { describe, expect, it } from 'vitest';

import {
  createAuthenticatedChatActor,
  createPlatformChatIssuer,
  createSystemChatMessage,
  createUserChatMessage,
  isChatActorBoundTo,
  type AuthenticatedChatActor,
  type PlatformChatIssuer,
} from '../../../src/core/chat/message.js';
import { normalizeChatText } from '../../../src/core/chat/text.js';

describe('canonical chat text', () => {
  it('trims and NFC-normalizes text while preserving plain-text XSS characters verbatim', () => {
    expect(normalizeChatText('  e\u0301 <img src=x onerror=alert(1)> & "hello"  ')).toBe(
      'é <img src=x onerror=alert(1)> & "hello"',
    );
  });

  it('counts Unicode scalar values rather than UTF-16 code units', () => {
    expect(normalizeChatText('😀'.repeat(300))).toBe('😀'.repeat(300));
    expect(() => normalizeChatText('😀'.repeat(301))).toThrow('1 to 300 Unicode scalar values');
  });

  it.each(['', '   \t\r\n　', `valid\uD800`, `valid\uDC00`])(
    'rejects empty, blank, or non-scalar text %#',
    (text) => {
      expect(() => normalizeChatText(text)).toThrow();
    },
  );
});

describe('chat message authority', () => {
  it('constructs a user message only from an authenticated actor and never accepts a sender field', () => {
    const actor = createAuthenticatedChatActor({
      roomId: 'room-1',
      playerId: 'player-1',
      connectionId: 'connection-1',
    });

    expect(
      createUserChatMessage({ id: 1, actor, text: 'hello', createdAt: 1_000 }),
    ).toEqual({
      id: 1,
      fromPlayerId: 'player-1',
      kind: 'user',
      text: 'hello',
      createdAt: 1_000,
    });

    const forged = {
      roomId: 'room-1',
      playerId: 'victim',
      connectionId: 'connection-attacker',
    } as unknown as AuthenticatedChatActor;
    expect(() =>
      createUserChatMessage({ id: 2, actor: forged, text: 'forged', createdAt: 1_001 }),
    ).toThrow('authenticated chat actor');
  });

  it('binds an actor to its authenticated room and connection context', () => {
    const binding = {
      roomId: 'room-1',
      playerId: 'player-1',
      connectionId: 'connection-1',
    };
    const actor = createAuthenticatedChatActor(binding);

    expect(isChatActorBoundTo(actor, binding)).toBe(true);
    expect(isChatActorBoundTo(actor, { ...binding, roomId: 'room-2' })).toBe(false);
    expect(isChatActorBoundTo(actor, { ...binding, connectionId: 'connection-old' })).toBe(false);
    expect(
      isChatActorBoundTo(
        { ...binding } as unknown as AuthenticatedChatActor,
        binding,
      ),
    ).toBe(false);
  });

  it('constructs system messages only through a runtime-issued platform capability', () => {
    const issuer = createPlatformChatIssuer('platform');
    expect(
      createSystemChatMessage({ id: 3, issuer, text: '<b>joined</b>', createdAt: 1_002 }),
    ).toEqual({
      id: 3,
      fromPlayerId: null,
      kind: 'system',
      text: '<b>joined</b>',
      createdAt: 1_002,
    });

    const forged = { source: 'platform' } as unknown as PlatformChatIssuer;
    expect(() =>
      createSystemChatMessage({ id: 4, issuer: forged, text: 'fake notice', createdAt: 1_003 }),
    ).toThrow('platform chat issuer');
  });

  it('allows an explicitly issued game-module capability and validates message metadata', () => {
    const issuer = createPlatformChatIssuer('game_module');
    expect(
      createSystemChatMessage({ id: 1, issuer, text: 'round started', createdAt: 0 }),
    ).toMatchObject({ kind: 'system', fromPlayerId: null });

    expect(() =>
      createSystemChatMessage({ id: 0, issuer, text: 'invalid', createdAt: 0 }),
    ).toThrow('positive safe integer');
    expect(() =>
      createSystemChatMessage({ id: -1, issuer, text: 'invalid', createdAt: 0 }),
    ).toThrow('id');
    expect(() =>
      createSystemChatMessage({ id: 1, issuer, text: 'invalid', createdAt: Number.NaN }),
    ).toThrow('createdAt');
  });
});
