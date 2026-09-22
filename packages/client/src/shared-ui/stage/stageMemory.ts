/**
 * 一次性演出的播放记忆（纯逻辑，可单测）。共享版。
 *
 * 关键约束：标记必须在播放**开始**时写入，而不是结束时。
 * 否则演出播到一半用户刷新，重连后会从头再演一遍派奖。
 *
 * 本文件从 wits-wagers/stage/stageMemory.ts 上提。唯一的泛化改动是
 * 存储前缀：原先硬编码 'ww:stage:'，现在按游戏 id 分命名空间，
 * 这样多款游戏共用 sessionStorage 时 keepOnly 不会互相清掉。
 */

const PREFIX_ROOT = 'stage:';

export interface StageMemory {
  has(key: string): boolean;
  mark(key: string): void;
  /** 换轮时清掉其它 roundToken 的记忆，避免 sessionStorage 无限增长 */
  keepOnly(roundToken: string): void;
}

export interface StageMemoryOptions {
  /** 游戏 id，用于隔离命名空间。省略时落在公共前缀下 */
  readonly namespace?: string;
  readonly storage?: Storage | null;
}

function prefixOf(namespace: string | undefined): string {
  return namespace ? `${PREFIX_ROOT}${namespace}:` : PREFIX_ROOT;
}

function storageKey(prefix: string, roundToken: string): string {
  return `${prefix}${roundToken}`;
}

function readSet(store: Storage, prefix: string, roundToken: string): Set<string> {
  try {
    const raw = store.getItem(storageKey(prefix, roundToken));
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((item): item is string => typeof item === 'string'));
  } catch {
    return new Set();
  }
}

function writeSet(store: Storage, prefix: string, roundToken: string, keys: Set<string>): void {
  try {
    store.setItem(storageKey(prefix, roundToken), JSON.stringify([...keys]));
  } catch {
    // 隐私模式或配额耗尽：退化为"每次都演"，比整个界面崩掉可取
  }
}

export function createStageMemory(
  roundToken: string,
  options: StageMemoryOptions = {},
): StageMemory {
  const { namespace, storage } = options;
  const prefix = prefixOf(namespace);
  const store = storage ?? (typeof sessionStorage === 'undefined' ? null : sessionStorage);

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
      return readSet(store, prefix, roundToken).has(key);
    },
    mark(key) {
      const keys = readSet(store, prefix, roundToken);
      keys.add(key);
      writeSet(store, prefix, roundToken, keys);
    },
    keepOnly(token) {
      const keep = storageKey(prefix, token);
      const stale: string[] = [];
      for (let i = 0; i < store.length; i += 1) {
        const key = store.key(i);
        // 只清本命名空间下的：多款游戏共用 sessionStorage 时不互相误删
        if (key && key.startsWith(prefix) && key !== keep) {
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
