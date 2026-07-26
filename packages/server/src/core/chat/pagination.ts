import type { ChatMessage } from './message.js';

export const MAX_CHAT_PAGE_SIZE = 100;

export interface ChatPage {
  readonly messages: readonly ChatMessage[];
  readonly nextCursor: number;
  readonly hasMore: boolean;
}

export function paginateChatMessages(
  messages: readonly ChatMessage[],
  options: { readonly afterCursor?: number; readonly limit?: number } = {},
): ChatPage {
  const limit = options.limit ?? MAX_CHAT_PAGE_SIZE;
  assertPageLimit(limit);
  if (options.afterCursor !== undefined) {
    assertNonNegativeSafeInteger(options.afterCursor, 'afterCursor');
  }
  assertStrictlyIncreasingIds(messages);

  const eligible =
    options.afterCursor === undefined
      ? messages
      : messages.filter(({ id }) => id > options.afterCursor!);
  const pageMessages = Object.freeze(eligible.slice(0, limit));
  const lastMessage = pageMessages.at(-1);

  return Object.freeze({
    messages: pageMessages,
    nextCursor: lastMessage?.id ?? options.afterCursor ?? 0,
    hasMore: eligible.length > pageMessages.length,
  });
}

function assertPageLimit(limit: number): void {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_CHAT_PAGE_SIZE) {
    throw new RangeError(`limit must be an integer from 1 to ${String(MAX_CHAT_PAGE_SIZE)}`);
  }
}

function assertStrictlyIncreasingIds(messages: readonly ChatMessage[]): void {
  let previousId: number | undefined;
  for (const message of messages) {
    assertPositiveSafeInteger(message.id, 'message id');
    if (previousId !== undefined && message.id <= previousId) {
      throw new RangeError('chat message ids must be strictly increasing and unique');
    }
    previousId = message.id;
  }
}

function assertPositiveSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
}

function assertNonNegativeSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`);
  }
}
