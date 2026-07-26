import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

import { containsOnlyUnicodeScalarValues } from './unicode.js';

const FORMAT_VERSION = 'scrypt-v1';
const COST = 16_384;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;
const SALT_BYTES = 16;
const DERIVED_KEY_BYTES = 64;
const MAX_MEMORY_BYTES = 64 * 1024 * 1024;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

interface ParsedPasswordHash {
  derivedKey: Buffer;
  salt: Buffer;
}

export function validateRoomPassword(password: string): string {
  if (!containsOnlyUnicodeScalarValues(password)) {
    throw new RangeError('room password must contain only Unicode scalar values');
  }

  const characterCount = Array.from(password).length;

  if (characterCount < 4 || characterCount > 32) {
    throw new RangeError('room password must contain 4 to 32 Unicode characters');
  }

  return password;
}

export async function hashRoomPassword(password: string): Promise<string> {
  validateRoomPassword(password);
  const salt = randomBytes(SALT_BYTES);
  const derivedKey = await deriveKey(password, salt);

  return [
    FORMAT_VERSION,
    COST,
    BLOCK_SIZE,
    PARALLELIZATION,
    salt.toString('base64url'),
    derivedKey.toString('base64url'),
  ].join('$');
}

export async function verifyRoomPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  validateRoomPassword(password);
  const parsed = parseStoredHash(storedHash);
  if (parsed === undefined) return false;

  const candidate = await deriveKey(password, parsed.salt);
  return timingSafeEqual(candidate, parsed.derivedKey);
}

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      DERIVED_KEY_BYTES,
      {
        N: COST,
        r: BLOCK_SIZE,
        p: PARALLELIZATION,
        maxmem: MAX_MEMORY_BYTES,
      },
      (error, derivedKey) => {
        if (error !== null) {
          reject(error);
          return;
        }
        resolve(derivedKey);
      },
    );
  });
}

function parseStoredHash(storedHash: string): ParsedPasswordHash | undefined {
  const parts = storedHash.split('$');
  if (parts.length !== 6) return undefined;

  const [version, cost, blockSize, parallelization, encodedSalt, encodedKey] = parts;
  if (
    version !== FORMAT_VERSION ||
    cost !== String(COST) ||
    blockSize !== String(BLOCK_SIZE) ||
    parallelization !== String(PARALLELIZATION) ||
    encodedSalt === undefined ||
    encodedKey === undefined ||
    !BASE64URL_PATTERN.test(encodedSalt) ||
    !BASE64URL_PATTERN.test(encodedKey)
  ) {
    return undefined;
  }

  const salt = Buffer.from(encodedSalt, 'base64url');
  const derivedKey = Buffer.from(encodedKey, 'base64url');
  if (
    salt.length !== SALT_BYTES ||
    derivedKey.length !== DERIVED_KEY_BYTES ||
    salt.toString('base64url') !== encodedSalt ||
    derivedKey.toString('base64url') !== encodedKey
  ) {
    return undefined;
  }

  return { derivedKey, salt };
}
