import { containsOnlyUnicodeScalarValues } from '../security/unicode.js';

export const MIN_CHAT_TEXT_SCALARS = 1;
export const MAX_CHAT_TEXT_SCALARS = 300;

export type CanonicalChatText = string & { readonly __canonicalChatText: unique symbol };

/**
 * Produces the one canonical server representation of user-visible chat text.
 * This deliberately does not escape or strip markup-like characters: rendering
 * remains a client text-node responsibility, and the original plain text is kept.
 */
export function normalizeChatText(input: unknown): CanonicalChatText {
  if (typeof input !== 'string') {
    throw new TypeError('chat text must be a string');
  }
  if (!containsOnlyUnicodeScalarValues(input)) {
    throw new RangeError('chat text must contain only Unicode scalar values');
  }

  const canonical = input.trim().normalize('NFC');
  const scalarCount = Array.from(canonical).length;
  if (scalarCount < MIN_CHAT_TEXT_SCALARS || scalarCount > MAX_CHAT_TEXT_SCALARS) {
    throw new RangeError(
      `chat text must contain ${String(MIN_CHAT_TEXT_SCALARS)} to ${String(MAX_CHAT_TEXT_SCALARS)} Unicode scalar values after normalization`,
    );
  }

  return canonical as CanonicalChatText;
}
