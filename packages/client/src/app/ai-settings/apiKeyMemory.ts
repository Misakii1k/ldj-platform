/**
 * 按预设记住用户本机输入过的 API Key。
 *
 * 服务端出于安全从不回显密钥原文；但用户需要"存完还在、可随时查看"的体验，
 * 所以把【用户自己在浏览器里键入】的值按 profileId 记录在 localStorage：
 * 重开设置页自动回填（密码框遮蔽），配合小眼睛即可查看明文。
 * 只用本机已有信息，不做任何网络回传。
 */

export interface KeyStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const STORAGE_KEY = 'ldj_llm_apikey_memory_v1';

function defaultStorage(): KeyStorageLike | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/** localStorage 未定义（测试环境）或不可写时静默降级为无记忆 */
function readAll(storage: KeyStorageLike | null): Record<string, string> {
  if (storage === null) return {};
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    const result: Record<string, string> = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof id === 'string' && typeof value === 'string' && value !== '') result[id] = value;
    }
    return result;
  } catch {
    return {};
  }
}

function writeAll(storage: KeyStorageLike | null, all: Record<string, string>): void {
  if (storage === null) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // 隐私模式等场景写入失败：放弃记忆但不影响保存主流程
  }
}

/** 取某个预设（或全局 ''）记住的密钥 */
export function loadRememberedKey(profileId: string, storage: KeyStorageLike | null = defaultStorage()): string | null {
  return readAll(storage)[profileId] ?? null;
}

/** 保存成功后记录输入框里的值 */
export function rememberKey(profileId: string, apiKey: string, storage: KeyStorageLike | null = defaultStorage()): void {
  const trimmed = apiKey.trim();
  if (trimmed === '') return;
  const all = readAll(storage);
  all[profileId] = trimmed;
  writeAll(storage, all);
}

/** 清除密钥成功后删掉记忆 */
export function forgetKey(profileId: string, storage: KeyStorageLike | null = defaultStorage()): void {
  const all = readAll(storage);
  if (!(profileId in all)) return;
  delete all[profileId];
  writeAll(storage, all);
}
