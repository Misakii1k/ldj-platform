/**
 * localStorage 安全访问：存储被禁用（隐私模式/异常 WebView）或非浏览器环境
 * （Node 单测）时静默降级为进程内兜底，调用方无需各自 try/catch。
 */

const memoryStore = new Map<string, string>();

export function safeGetItem(key: string): string | null {
  try {
    const stored = globalThis.localStorage?.getItem(key);
    if (stored !== null && stored !== undefined) return stored;
  } catch {
    // localStorage 不可用时走内存兜底
  }
  return memoryStore.get(key) ?? null;
}

export function safeSetItem(key: string, value: string): void {
  memoryStore.set(key, value);
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // 忽略持久化失败
  }
}

export function safeRemoveItem(key: string): void {
  memoryStore.delete(key);
  try {
    globalThis.localStorage?.removeItem(key);
  } catch {
    // 忽略
  }
}
