import {
  identityIdSchema,
  playerIdSchema,
  resumeTokenSchema,
  roomCodeSchema,
  type IdentityId,
} from '@lan-party/shared';

import { createRandomId } from './random-id';

const IDENTITY_KEY = 'lan-party.identity.v1';
const ROOMS_KEY = 'lan-party.rooms.v1';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface RoomCredential {
  roomCode: string;
  playerId: string;
  resumeToken: string;
  lastSeq: number;
  savedAt: number;
}

class MemoryStorage implements StorageLike {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

const fallbackStorage = new MemoryStorage();

export function getBrowserStorage(source: Pick<Window, 'localStorage'>): StorageLike {
  try {
    return source.localStorage;
  } catch {
    return fallbackStorage;
  }
}

function safeGet(storage: StorageLike, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(storage: StorageLike, key: string, value: string): boolean {
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function safeRemove(storage: StorageLike, key: string): boolean {
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function isRoomCredential(value: unknown): value is RoomCredential {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    roomCodeSchema.safeParse(record.roomCode).success &&
    playerIdSchema.safeParse(record.playerId).success &&
    resumeTokenSchema.safeParse(record.resumeToken).success &&
    typeof record.lastSeq === 'number' &&
    Number.isSafeInteger(record.lastSeq) &&
    record.lastSeq >= 0 &&
    typeof record.savedAt === 'number' &&
    Number.isFinite(record.savedAt)
  );
}

function readCredentials(storage: StorageLike): RoomCredential[] {
  const raw = safeGet(storage, ROOMS_KEY);
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isRoomCredential) : [];
  } catch {
    return [];
  }
}

export function getOrCreateIdentity(
  storage: StorageLike,
  createId: () => string = () => createRandomId('device'),
): IdentityId {
  const stored = safeGet(storage, IDENTITY_KEY);
  const existing = identityIdSchema.safeParse(stored);
  if (existing.success) return existing.data;

  const identity = identityIdSchema.parse(createId());
  safeSet(storage, IDENTITY_KEY, identity);
  return identity;
}

export function listRoomCredentials(storage: StorageLike): RoomCredential[] {
  return readCredentials(storage).sort((left, right) => right.savedAt - left.savedAt);
}

export function saveRoomCredential(storage: StorageLike, credential: RoomCredential): boolean {
  if (!isRoomCredential(credential)) return false;
  const others = readCredentials(storage).filter((item) => item.roomCode !== credential.roomCode);
  return safeSet(storage, ROOMS_KEY, JSON.stringify([credential, ...others].slice(0, 10)));
}

export function removeRoomCredential(storage: StorageLike, roomCode: string): boolean {
  const normalized = roomCodeSchema.safeParse(roomCode);
  if (!normalized.success) return false;
  const remaining = readCredentials(storage).filter((item) => item.roomCode !== normalized.data);
  if (remaining.length === 0) {
    return safeRemove(storage, ROOMS_KEY);
  }
  return safeSet(storage, ROOMS_KEY, JSON.stringify(remaining));
}
