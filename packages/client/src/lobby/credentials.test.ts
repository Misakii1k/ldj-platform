import { describe, expect, it } from 'vitest';

import {
  getOrCreateIdentity,
  getBrowserStorage,
  listRoomCredentials,
  removeRoomCredential,
  saveRoomCredential,
  type StorageLike,
} from './credentials';

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

class ThrowingStorage implements StorageLike {
  getItem(): string | null { throw new DOMException('blocked', 'SecurityError'); }
  setItem(): void { throw new DOMException('blocked', 'SecurityError'); }
  removeItem(): void { throw new DOMException('blocked', 'SecurityError'); }
}

describe('lobby credentials', () => {
  it('creates one stable device identity', () => {
    const storage = new MemoryStorage();
    expect(getOrCreateIdentity(storage, () => 'device-test')).toBe('device-test');
    expect(getOrCreateIdentity(storage, () => 'device-other')).toBe('device-test');
  });

  it('stores only valid resumable seats and keeps the newest first', () => {
    const storage = new MemoryStorage();
    saveRoomCredential(storage, {
      roomCode: 'ABC23',
      playerId: 'player-a',
      resumeToken: 'a'.repeat(32),
      lastSeq: 3,
      savedAt: 10,
    });
    saveRoomCredential(storage, {
      roomCode: 'DEF45',
      playerId: 'player-b',
      resumeToken: 'b'.repeat(32),
      lastSeq: 7,
      savedAt: 20,
    });

    expect(listRoomCredentials(storage).map((item) => item.roomCode)).toEqual(['DEF45', 'ABC23']);
    removeRoomCredential(storage, 'def45');
    expect(listRoomCredentials(storage).map((item) => item.roomCode)).toEqual(['ABC23']);
  });

  it('ignores corrupt storage instead of exposing a broken restore action', () => {
    const storage = new MemoryStorage();
    storage.setItem('lan-party.rooms.v1', '{oops');
    expect(listRoomCredentials(storage)).toEqual([]);
  });

  it('keeps the lobby usable when browser storage is unavailable', () => {
    const storage = new ThrowingStorage();
    expect(getOrCreateIdentity(storage, () => 'device-fallback')).toBe('device-fallback');
    expect(listRoomCredentials(storage)).toEqual([]);
    expect(
      saveRoomCredential(storage, {
        roomCode: 'ABC23',
        playerId: 'player-a',
        resumeToken: 'a'.repeat(32),
        lastSeq: 1,
        savedAt: 1,
      }),
    ).toBe(false);
    expect(removeRoomCredential(storage, 'ABC23')).toBe(false);

    const blockedWindow = {};
    Object.defineProperty(blockedWindow, 'localStorage', {
      get: () => { throw new DOMException('blocked', 'SecurityError'); },
    });
    const fallback = getBrowserStorage(blockedWindow as Pick<Window, 'localStorage'>);
    expect(getOrCreateIdentity(fallback, () => 'device-memory')).toBe('device-memory');
  });
});
