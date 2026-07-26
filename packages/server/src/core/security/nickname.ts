import { containsOnlyUnicodeScalarValues } from './unicode.js';

const MIN_NICKNAME_CODE_POINTS = 1;
const MAX_NICKNAME_CODE_POINTS = 16;

/**
 * Applies the canonical server-side nickname representation.
 *
 * Length is intentionally measured after trimming and NFC normalization so
 * every caller performs duplicate checks against the same value.
 */
export function normalizeNickname(value: string): string {
  if (!containsOnlyUnicodeScalarValues(value)) {
    throw new RangeError('nickname must contain only Unicode scalar values');
  }

  const normalized = value.trim().normalize('NFC');
  const codePointCount = Array.from(normalized).length;

  if (
    codePointCount < MIN_NICKNAME_CODE_POINTS ||
    codePointCount > MAX_NICKNAME_CODE_POINTS
  ) {
    throw new RangeError('nickname must contain 1 to 16 Unicode code points');
  }

  return normalized;
}
