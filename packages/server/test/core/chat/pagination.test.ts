import { describe, expect, it } from 'vitest';

import {
  createAuthenticatedChatActor,
  createUserChatMessage,
  type ChatMessage,
} from '../../../src/core/chat/message.js';
import { paginateChatMessages } from '../../../src/core/chat/pagination.js';

const actor = createAuthenticatedChatActor({
  roomId: 'room-1',
  playerId: 'player-1',
  connectionId: 'connection-1',
});

function message(id: number): ChatMessage {
  return createUserChatMessage({ id, actor, text: `message-${String(id)}`, createdAt: id });
}

describe('chat cursor pagination', () => {
  it('returns ascending pages of at most 100 messages with an explicit next cursor', () => {
    const messages = Array.from({ length: 205 }, (_, index) => message(index + 1));

    const first = paginateChatMessages(messages);
    expect(first.messages).toHaveLength(100);
    expect(first.messages.at(0)?.id).toBe(1);
    expect(first.messages.at(-1)?.id).toBe(100);
    expect(first).toMatchObject({ nextCursor: 100, hasMore: true });

    const second = paginateChatMessages(messages, { afterCursor: first.nextCursor });
    expect(second.messages).toHaveLength(100);
    expect(second.messages.at(0)?.id).toBe(101);
    expect(second.messages.at(-1)?.id).toBe(200);
    expect(second).toMatchObject({ nextCursor: 200, hasMore: true });

    const third = paginateChatMessages(messages, { afterCursor: second.nextCursor });
    expect(third.messages.map(({ id }) => id)).toEqual([201, 202, 203, 204, 205]);
    expect(third).toMatchObject({ nextCursor: 205, hasMore: false });
  });

  it('uses the supplied cursor for an empty page and never repeats the cursor item', () => {
    const messages = [message(7), message(8)];

    expect(paginateChatMessages(messages, { afterCursor: 7, limit: 1 })).toEqual({
      messages: [messages[1]],
      nextCursor: 8,
      hasMore: false,
    });
    expect(paginateChatMessages(messages, { afterCursor: 8 })).toEqual({
      messages: [],
      nextCursor: 8,
      hasMore: false,
    });
  });

  it('accepts zero only as the initial cursor and rejects a persisted message id of zero', () => {
    expect(
      paginateChatMessages([message(1), message(2)], { afterCursor: 0 }).messages.map(
        ({ id }) => id,
      ),
    ).toEqual([1, 2]);

    const invalid = { ...message(1), id: 0 } as ChatMessage;
    expect(() => paginateChatMessages([invalid])).toThrow('positive safe integer');
  });

  it.each([0, 101, 1.5, Number.NaN])('rejects an invalid page limit of %s', (limit) => {
    expect(() => paginateChatMessages([message(1)], { limit })).toThrow('limit');
  });

  it('rejects duplicate or non-increasing source ids instead of emitting ambiguous pages', () => {
    expect(() => paginateChatMessages([message(1), message(1)])).toThrow('strictly increasing');
    expect(() => paginateChatMessages([message(2), message(1)])).toThrow('strictly increasing');
  });
});
