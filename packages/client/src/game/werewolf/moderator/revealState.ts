/**
 * 抽卡仪式「本局是否已确认看牌」的持久化状态。
 *
 * 键里带 sessionId：同一局刷新 / 重连不重播抽卡演出，也不会把身份重新亮在屏幕上；
 * 新一局（新 sessionId）自动重播。
 * 存储不可用（隐私模式、配额满）时降级为「每次都播」，不抛错、不阻断对局。
 */

const STORAGE_PREFIX = 'ldj:werewolf.moderator.seen.';

export interface RevealStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

export function revealStorageKey(sessionId: string, playerId: string): string {
  return `${STORAGE_PREFIX}${sessionId}.${playerId}`;
}

/** 用给定 Storage 构造存储；不可用时返回 null。 */
export function createRevealStore(storage: Storage | null | undefined): RevealStore | null {
  if (!storage) return null;
  return {
    get(key) {
      try {
        return storage.getItem(key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        storage.setItem(key, value);
      } catch {
        // 配额满 / 隐私模式：忽略，降级为每次都播
      }
    },
  };
}

/** 读取浏览器 localStorage；不可用时返回 null。 */
export function defaultRevealStore(): RevealStore | null {
  try {
    return createRevealStore(globalThis.localStorage);
  } catch {
    return null;
  }
}

export function hasConfirmedReveal(
  store: RevealStore | null,
  sessionId: string,
  playerId: string,
): boolean {
  if (store === null || !sessionId || !playerId) return false;
  return store.get(revealStorageKey(sessionId, playerId)) === '1';
}

export function markRevealConfirmed(
  store: RevealStore | null,
  sessionId: string,
  playerId: string,
): void {
  if (store === null || !sessionId || !playerId) return;
  store.set(revealStorageKey(sessionId, playerId), '1');
}
