/**
 * 服务器地址解析（APP 跨源连接层）：
 *
 * 浏览器部署下客户端与服务器同源，地址恒等于当前页面源；
 * APP（Capacitor WebView，源为 http://localhost）则必须显式指定目标主机。
 *
 * 解析优先级：
 * 1. 运行时覆盖（主机模式：桥接层注入本机内嵌服务器地址，设备角色权威，最高优先）；
 * 2. 手动配置（连接设置页保存的主机地址，玩家/桌面模式使用）；
 * 3. 同源默认（浏览器行为与历史版本完全一致）。
 */

const MANUAL_SERVER_BASE_KEY = 'ldj_server_base';

/** localStorage 不可用（Node 测试环境 / 异常 WebView）时的内存兜底 */
const memoryStore = new Map<string, string>();

let runtimeOverride: string | null = null;
const listeners = new Set<() => void>();

function safeGetItem(key: string): string | null {
  try {
    const stored = globalThis.localStorage?.getItem(key);
    if (stored !== null && stored !== undefined) return stored;
  } catch {
    // localStorage 不可用时走内存兜底
  }
  return memoryStore.get(key) ?? null;
}

function safeSetItem(key: string, value: string | null): void {
  memoryStore.set(key, value ?? '');
  if (value === null) memoryStore.delete(key);
  try {
    if (value === null) {
      globalThis.localStorage?.removeItem(key);
    } else {
      globalThis.localStorage?.setItem(key, value);
    }
  } catch {
    // 忽略持久化失败
  }
}

/**
 * 归一化用户输入的主机地址：
 * - 补全缺失的 http:// 前缀；
 * - 去掉路径/查询/锚点与凭据（服务器根部署）；
 * - 非法输入返回 null。
 */
export function normalizeServerBase(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  let candidate = trimmed;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) {
    candidate = `http://${candidate}`;
  }
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.username || url.password) return null;
    if (!url.hostname) return null;
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

/** 手动配置的主机地址（未配置返回 null） */
export function getManualServerBase(): string | null {
  const raw = safeGetItem(MANUAL_SERVER_BASE_KEY);
  if (!raw) return null;
  return normalizeServerBase(raw);
}

/** 保存/清除手动配置；非法输入返回 false 且不改动现有配置 */
export function setManualServerBase(input: string | null): boolean {
  if (input === null) {
    safeSetItem(MANUAL_SERVER_BASE_KEY, null);
    notifyListeners();
    return true;
  }
  const normalized = normalizeServerBase(input);
  if (normalized === null) return false;
  safeSetItem(MANUAL_SERVER_BASE_KEY, normalized);
  notifyListeners();
  return true;
}

/** 运行时覆盖（主机模式桥接注入）；传 null 清除 */
export function setRuntimeServerBase(base: string | null): void {
  if (base === null) {
    runtimeOverride = null;
    notifyListeners();
    return;
  }
  const normalized = normalizeServerBase(base);
  if (normalized === null) return;
  runtimeOverride = normalized;
  notifyListeners();
}

export function getRuntimeServerBase(): string | null {
  return runtimeOverride;
}

/** 解析当前应连接的服务器根地址（无尾部斜杠） */
export function resolveServerBase(): string {
  const runtime = runtimeOverride;
  if (runtime) return runtime;
  const manual = getManualServerBase();
  if (manual) return manual;
  const protocol = globalThis.location?.protocol ?? 'http:';
  const host = globalThis.location?.host ?? '127.0.0.1:8080';
  return `${protocol}//${host}`;
}

/** 由服务器根地址构造 WebSocket 端点 */
export function buildWsUrl(base: string = resolveServerBase()): string {
  return `${base.replace(/^http/i, 'ws')}/ws`;
}

/** 由服务器根地址构造 HTTP API 绝对地址（path 以 / 开头） */
export function buildApiUrl(path: string, base: string = resolveServerBase()): string {
  return `${base}${path}`;
}

/** 订阅地址变更（手动配置/运行时覆盖变化时触发），返回退订函数 */
export function subscribeServerBaseChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifyListeners(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // 单个订阅者异常不影响其余
    }
  }
}
