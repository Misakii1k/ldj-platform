import { createHash, randomBytes } from 'node:crypto';

const RESUME_TOKEN_BYTES = 32;
const RESUME_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function generateResumeToken(): string {
  return randomBytes(RESUME_TOKEN_BYTES).toString('base64url');
}

/** Returns the only representation of a resume token that may be persisted. */
export function hashResumeToken(token: string): string {
  if (!isValidResumeToken(token)) {
    throw new TypeError('resume token must be a 32-byte base64url value');
  }

  return createHash('sha256').update(token, 'utf8').digest('base64url');
}

function isValidResumeToken(token: string): boolean {
  if (!RESUME_TOKEN_PATTERN.test(token)) return false;

  const decoded = Buffer.from(token, 'base64url');
  return decoded.length === RESUME_TOKEN_BYTES && decoded.toString('base64url') === token;
}
