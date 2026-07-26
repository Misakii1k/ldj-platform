import { describe, expect, it } from 'vitest';

import {
  hashRoomPassword,
  validateRoomPassword,
  verifyRoomPassword,
} from '../../../src/core/security/password.js';

describe('room password security', () => {
  it('accepts 4 to 32 Unicode code points without changing the password', () => {
    expect(validateRoomPassword('😀😀😀😀')).toBe('😀😀😀😀');
    expect(validateRoomPassword('x'.repeat(32))).toBe('x'.repeat(32));
  });

  it('rejects passwords outside the length limits without echoing them', () => {
    const tooLong = 'not-secret-'.repeat(4);

    expect(() => validateRoomPassword('abc')).toThrow('4 to 32 Unicode characters');
    expect(() => validateRoomPassword(tooLong)).toThrowError(
      expect.not.objectContaining({ message: expect.stringContaining(tooLong) }),
    );
  });

  it('rejects unpaired surrogates that Node would encode as the same replacement character', () => {
    expect(() => validateRoomPassword('abcd\uD800')).toThrow('Unicode scalar values');
    expect(() => validateRoomPassword('abcd\uD801')).toThrow('Unicode scalar values');
    expect(() => validateRoomPassword('abcd\uDC00')).toThrow('Unicode scalar values');
  });

  it('stores a salted, versioned scrypt representation and verifies it', async () => {
    const password = '聚会-password-😀';
    const first = await hashRoomPassword(password);
    const second = await hashRoomPassword(password);

    expect(first).toMatch(/^scrypt-v1\$16384\$8\$1\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
    expect(first).not.toContain(password);
    expect(second).not.toBe(first);
    await expect(verifyRoomPassword(password, first)).resolves.toBe(true);
    await expect(verifyRoomPassword('wrong-password', first)).resolves.toBe(false);
  });

  it('rejects malformed or unsupported password hashes safely', async () => {
    await expect(verifyRoomPassword('valid-password', 'not-a-password-hash')).resolves.toBe(false);
    await expect(
      verifyRoomPassword(
        'valid-password',
        'scrypt-v2$16384$8$1$c2FsdA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      ),
    ).resolves.toBe(false);
  });

  it('does not leak password contents through validation errors', async () => {
    const invalidPassword = 'shh';

    await expect(hashRoomPassword(invalidPassword)).rejects.not.toThrow(invalidPassword);
    await expect(verifyRoomPassword(invalidPassword, 'scrypt-v1$bad')).rejects.not.toThrow(
      invalidPassword,
    );
  });
});
