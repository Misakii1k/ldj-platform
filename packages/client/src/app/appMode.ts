/**
 * APP 身份模式（玩家 / 桌面 / 主机）与最近主机记忆。
 * 纯 localStorage 逻辑，不含 React；UI 在 AppModeGate/AppModeContext。
 */
import { safeGetItem, safeRemoveItem, safeSetItem } from '../lib/safeStorage.ts';
import { normalizeServerBase } from '../connection/serverAddress.ts';

export type AppMode = 'player' | 'table' | 'host';

const APP_MODE_KEY = 'ldj_app_mode';
const RECENT_HOSTS_KEY = 'ldj_recent_hosts';
const MAX_RECENT_HOSTS = 5;

export function getSavedAppMode(): AppMode | null {
  const raw = safeGetItem(APP_MODE_KEY);
  if (raw === 'player' || raw === 'table' || raw === 'host') return raw;
  return null;
}

export function saveAppMode(mode: AppMode): void {
  safeSetItem(APP_MODE_KEY, mode);
}

export function clearAppMode(): void {
  safeRemoveItem(APP_MODE_KEY);
}

/**
 * 模拟模式设备的初始角色：APP 明确选择的身份优先（桌面模式 → 桌面端，
 * 玩家模式 → 玩家端）；浏览器无 APP 身份时沿用各游戏自己的记忆。
 */
export function resolveInitialDeviceRole(perGameKey: string): 'player' | 'table' {
  const mode = getSavedAppMode();
  if (mode === 'table') return 'table';
  if (mode === 'player') return 'player';
  const saved = safeGetItem(perGameKey);
  if (saved === 'table' || saved === 'player') return saved;
  return 'player';
}

/** 最近连接过的主机（归一化，最近在前，最多 5 条） */
export function getRecentHosts(): string[] {
  const raw = safeGetItem(RECENT_HOSTS_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === 'string');
  } catch {
    return [];
  }
}

export function rememberRecentHost(base: string): void {
  const normalized = normalizeServerBase(base);
  if (normalized === null) return;
  const next = [normalized, ...getRecentHosts().filter((h) => h !== normalized)].slice(0, MAX_RECENT_HOSTS);
  safeSetItem(RECENT_HOSTS_KEY, JSON.stringify(next));
}

export function forgetRecentHosts(): void {
  safeRemoveItem(RECENT_HOSTS_KEY);
}
