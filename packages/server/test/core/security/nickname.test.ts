import { describe, expect, it } from 'vitest';

import { normalizeNickname } from '../../../src/core/security/nickname.js';

describe('normalizeNickname', () => {
  it('trims surrounding whitespace and normalizes to NFC', () => {
    expect(normalizeNickname('  A\u0301lice  ')).toBe('Álice');
  });

  it('counts Unicode code points rather than UTF-16 code units', () => {
    expect(normalizeNickname('😀'.repeat(16))).toBe('😀'.repeat(16));
    expect(() => normalizeNickname('😀'.repeat(17))).toThrow('1 to 16 Unicode code points');
  });

  it('rejects a nickname that is empty after trimming', () => {
    expect(() => normalizeNickname(' \t\n ')).toThrow('1 to 16 Unicode code points');
  });

  it('rejects unpaired UTF-16 surrogates', () => {
    expect(() => normalizeNickname('player-\uD800')).toThrow('Unicode scalar values');
    expect(() => normalizeNickname('player-\uDC00')).toThrow('Unicode scalar values');
  });

  it('does not include rejected nickname contents in errors', () => {
    const secretNickname = 'private-name-that-is-too-long';

    expect(() => normalizeNickname(secretNickname)).toThrowError(
      expect.not.objectContaining({ message: expect.stringContaining(secretNickname) }),
    );
  });
});
