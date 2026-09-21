/**
 * 一次性演出的播放记忆（纯逻辑，可单测）。
 *
 * 关键约束：标记必须在播放**开始**时写入，而不是结束时。
 * 否则演出播到一半用户刷新，重连后会从头再演一遍派奖。
 */

const PREFIX = 'ww:stage:';

export interface StageMemory {
  has(key: string): boolean;
  mark(key: string): void;
  /** 换轮时清掉其它 roundToken 的记忆，避免 sessionStorage 无限增长 */
  keepOnly(roundToken: string): void;
}

function storageKey(roundToken: string): string {
  return `${PREFIX}${roundToken}`;
}

function readSet(store: Storage, roundToken: string): Set<string> {
  try {
    const raw = store.getItem(storageKey(roundToken));
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((item): item is string => typeof item === 'string'));
  } catch {
    return new Set();
  }
}

function writeSet(store: Storage, roundToken: string, keys: Set<string>): void {
  try {
    store.setItem(storageKey(roundToken), JSON.stringify([...keys]));
  } catch {
    // 隐私模式或配额耗尽：退化为"每次都演"，比整个界面崩掉可取
  }
}

export function createStageMemory(roundToken: string, storage?: Storage | null): StageMemory {
  const store =
    storage ?? (typeof sessionStorage === 'undefined' ? null : sessionStorage);

  if (!store) {
    // 无存储时退化为进程内记忆：至少能防住同一次会话里的重复播放
    const local = new Set<string>();
    return {
      has: (key) => local.has(key),
      mark: (key) => void local.add(key),
      keepOnly: () => undefined,
    };
  }

  return {
    has(key) {
      return readSet(store, roundToken).has(key);
    },
    mark(key) {
      const keys = readSet(store, roundToken);
      keys.add(key);
      writeSet(store, roundToken, keys);
    },
    keepOnly(token) {
      const keep = storageKey(token);
      const stale: string[] = [];
      for (let i = 0; i < store.length; i += 1) {
        const key = store.key(i);
        if (key && key.startsWith(PREFIX) && key !== keep) {
          stale.push(key);
        }
      }
      for (const key of stale) {
        try {
          store.removeItem(key);
        } catch {
          // 忽略：清理失败不影响本轮
        }
      }
    },
  };
}
