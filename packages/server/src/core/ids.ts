/**
 * 标识与凭证生成（SPEC §4.1、SEC-004、SEC-005）。
 * resumeToken ≥128 bit 随机性，服务端只存哈希；房间密码用带盐 scrypt。
 */
import { randomUUID, randomBytes, createHash, scryptSync, timingSafeEqual } from 'node:crypto';

export function newRoomId(): string {
  return `room_${randomUUID()}`;
}

export function newPlayerId(): string {
  return `p_${randomUUID()}`;
}

export function newSessionId(): string {
  return `s_${randomUUID()}`;
}

/** 256 bit 随机恢复凭证，base64url 文本 */
export function newResumeToken(): string {
  return randomBytes(32).toString('base64url');
}

/** 恢复凭证哈希（高熵随机值可用快哈希） */
export function hashResumeToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** 房间短码：5 位，字符集排除 0/O/1/I（FR-ROOM-001） */
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function newRoomCode(): string {
  const bytes = randomBytes(5);
  let code = '';
  for (const b of bytes) {
    code += ROOM_CODE_ALPHABET[b % ROOM_CODE_ALPHABET.length];
  }
  return code;
}

/** 查找归一化：大小写不敏感（FR-ROOM-001） */
export function normalizeRoomCode(input: string): string {
  return input.trim().toUpperCase();
}

/** 房间密码慢哈希：scrypt，格式 scrypt$N$r$p$salt$hash（FR-ROOM-002） */
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

export function hashRoomPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 32, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export function verifyRoomPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, nStr, rStr, pStr, saltB64, hashB64] = parts;
  const salt = Buffer.from(saltB64!, 'base64url');
  const expected = Buffer.from(hashB64!, 'base64url');
  const actual = scryptSync(password, salt, expected.length, {
    N: Number(nStr),
    r: Number(rStr),
    p: Number(pStr),
  });
  return timingSafeEqual(actual, expected);
}
