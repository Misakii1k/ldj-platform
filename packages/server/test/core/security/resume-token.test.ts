import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { generateResumeToken, hashResumeToken } from '../../../src/core/security/resume-token.js';

describe('resume token security', () => {
  it('generates 32 random bytes encoded as unpadded base64url', () => {
    const first = generateResumeToken();
    const second = generateResumeToken();

    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(first, 'base64url')).toHaveLength(32);
    expect(second).not.toBe(first);
  });

  it('returns only a deterministic SHA-256 hash for storage', () => {
    const token = generateResumeToken();
    const expected = createHash('sha256').update(token, 'utf8').digest('base64url');

    expect(hashResumeToken(token)).toBe(expected);
    expect(hashResumeToken(token)).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hashResumeToken(token)).not.toContain(token);
  });

  it('rejects malformed tokens without including token contents in errors', () => {
    const malformed = 'private malformed resume token';

    expect(() => hashResumeToken(malformed)).toThrowError(
      expect.not.objectContaining({ message: expect.stringContaining(malformed) }),
    );
  });
});
