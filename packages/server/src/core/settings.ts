/**
 * 运行期设置（存库、改完即生效）。
 *
 * 密钥只进不出：写入后对外一律只回 hasApiKey 布尔，任何接口都不回传原文。
 */
import { withTransaction, type Db } from '../persistence/db.ts';
import type { LlmConfig } from '../config.ts';
import type {
  LlmProviderType,
  ThinkingDepth,
  LlmSettingsView,
  LlmSettingsPatch,
  LlmProfileSummary,
} from '@ldj/shared';
import { THINKING_DEPTH_OPTIONS } from '@ldj/shared';
import { normalizeLlmBaseUrl } from './llmBaseUrl.ts';

export type { LlmSettingsView, LlmSettingsPatch };

const KEY_LLM_PROVIDER = 'llm.provider';
const KEY_LLM_BASE_URL = 'llm.baseUrl';
const KEY_LLM_API_KEY = 'llm.apiKey';
const KEY_LLM_MODEL = 'llm.model';
const KEY_LLM_THINKING_DEPTH = 'llm.thinkingDepth';
const KEY_LLM_TIMEOUT_MS = 'llm.timeoutMs';
const KEY_LLM_PROFILES = 'llm.profiles';
const KEY_LLM_ACTIVE_PROFILE_ID = 'llm.activeProfileId';

/** 按预设独立保存密钥的键前缀：<前缀><profileId>。旧的全局 KEY_LLM_API_KEY 仍是回落。 */
const PROFILE_KEY_PREFIX = 'llm.apiKey.';

export const LLM_TIMEOUT_MIN_MS = 1000;
export const LLM_TIMEOUT_MAX_MS = 120_000;
const MAX_LLM_PROFILES = 32;
const MAX_PROFILE_ID_LENGTH = 128;
const MAX_PROFILE_NAME_LENGTH = 64;
const MAX_PROFILE_BASE_URL_LENGTH = 2048;

export class SettingsError extends Error {}

function readRaw(db: Db, key: string): string | null {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

function writeRaw(db: Db, key: string, value: string | null, now: number): void {
  if (value === null) {
    db.prepare('DELETE FROM app_settings WHERE key = ?').run(key);
    return;
  }
  db.prepare(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(key, value, now);
}

function isProvider(value: unknown): value is LlmProviderType {
  return value === 'openai' || value === 'anthropic';
}

export function normalizeThinkingDepth(value: unknown): ThinkingDepth | null {
  if (value === '8192') return 'max';
  return THINKING_DEPTH_OPTIONS.some((option) => option.value === value)
    ? value as ThinkingDepth
    : null;
}

function parseProfile(value: unknown, index: number): LlmProfileSummary {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new SettingsError(`第 ${index + 1} 个 API 预设格式不正确`);
  }
  const source = value as Record<string, unknown>;
  const id = typeof source.id === 'string' ? source.id.trim() : '';
  const name = typeof source.name === 'string' ? source.name.trim() : '';
  const baseUrl = typeof source.baseUrl === 'string' ? source.baseUrl.trim() : '';
  const model = typeof source.model === 'string' ? source.model.trim() : '';
  const thinkingDepth = normalizeThinkingDepth(source.thinkingDepth);
  const timeoutMs = source.timeoutMs;

  if (id === '' || id.length > MAX_PROFILE_ID_LENGTH) {
    throw new SettingsError(`第 ${index + 1} 个 API 预设 id 无效`);
  }
  if (name === '' || name.length > MAX_PROFILE_NAME_LENGTH) {
    throw new SettingsError(`第 ${index + 1} 个 API 预设名称无效`);
  }
  if (baseUrl.length > MAX_PROFILE_BASE_URL_LENGTH) {
    throw new SettingsError(`第 ${index + 1} 个 API 预设地址过长`);
  }
  if (model.length > 128) {
    throw new SettingsError(`第 ${index + 1} 个 API 预设模型名过长`);
  }
  if (!isProvider(source.provider)) {
    throw new SettingsError(`第 ${index + 1} 个 API 预设服务商无效`);
  }
  if (thinkingDepth === null) {
    throw new SettingsError(`第 ${index + 1} 个 API 预设思考深度无效`);
  }
  if (
    typeof timeoutMs !== 'number' ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs < LLM_TIMEOUT_MIN_MS ||
    timeoutMs > LLM_TIMEOUT_MAX_MS
  ) {
    throw new SettingsError(`第 ${index + 1} 个 API 预设超时无效`);
  }
  if (typeof source.hasApiKey !== 'boolean') {
    throw new SettingsError(`第 ${index + 1} 个 API 预设密钥标记无效`);
  }

  return {
    id,
    name,
    provider: source.provider,
    baseUrl,
    model,
    thinkingDepth,
    timeoutMs,
    hasApiKey: source.hasApiKey,
  };
}

function parseProfilesJson(raw: string | null, strict: boolean): LlmProfileSummary[] {
  if (raw === null || raw.trim() === '') return [];
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    if (strict) throw new SettingsError('profilesJson 不是合法 JSON');
    return [];
  }
  if (!Array.isArray(value)) {
    if (strict) throw new SettingsError('profilesJson 必须是数组');
    return [];
  }
  if (value.length > MAX_LLM_PROFILES) {
    if (strict) throw new SettingsError(`API 预设最多 ${MAX_LLM_PROFILES} 个`);
    return [];
  }

  try {
    const profiles = value.map((profile, index) => parseProfile(profile, index));
    if (new Set(profiles.map((profile) => profile.id)).size !== profiles.length) {
      throw new SettingsError('API 预设 id 不能重复');
    }
    return profiles;
  } catch (error) {
    if (strict) throw error;
    return [];
  }
}

function normalizeBaseUrl(value: string | null): string | null {
  if (value === null) return null;
  if (value.trim() === '') return null;
  try {
    return normalizeLlmBaseUrl(value);
  } catch {
    throw new SettingsError('接口地址不是合法 URL；支持带或不带 /v1 的地址、完整端点路径，也可省略 https:// 前缀');
  }
}

/** 读某个预设的独立密钥；预设没存过再看全局旧键（兼容升级前的数据） */
function readProfileApiKey(db: Db, profileId: string): string | null {
  const own = readRaw(db, PROFILE_KEY_PREFIX + profileId);
  if (own !== null) return own;
  return readRaw(db, KEY_LLM_API_KEY);
}

function writeProfileApiKey(db: Db, profileId: string, apiKey: string | null, now: number): void {
  writeRaw(db, PROFILE_KEY_PREFIX + profileId, apiKey, now);
}

/**
 * 合并环境变量与库设置，得到当前生效的大模型配置。
 */
export function resolveLlmConfig(db: Db, envFallback: LlmConfig): LlmConfig {
  const providerRaw = readRaw(db, KEY_LLM_PROVIDER);
  const provider: LlmProviderType = providerRaw === 'anthropic'
    ? 'anthropic'
    : providerRaw === 'openai'
      ? 'openai'
      : (envFallback.provider ?? 'openai');
  const baseUrl = readRaw(db, KEY_LLM_BASE_URL);
  const model = readRaw(db, KEY_LLM_MODEL);
  const thinkingDepthRaw = readRaw(db, KEY_LLM_THINKING_DEPTH);
  const thinkingDepth = normalizeThinkingDepth(thinkingDepthRaw) ?? envFallback.thinkingDepth;
  const timeoutRaw = readRaw(db, KEY_LLM_TIMEOUT_MS);
  const timeoutMs = timeoutRaw === null ? null : Number(timeoutRaw);

  // 密钥跟着激活预设走：预设存过自己的钥就用它；
  // 否则回落全局旧键（升级前数据），再回落 env。
  const activeProfileIdRaw = readRaw(db, KEY_LLM_ACTIVE_PROFILE_ID);
  const activeProfilesJson = readRaw(db, KEY_LLM_PROFILES);
  let profileApiKey: string | null = null;
  if (activeProfileIdRaw !== null && activeProfilesJson !== null && activeProfilesJson.includes(activeProfileIdRaw)) {
    profileApiKey = readProfileApiKey(db, activeProfileIdRaw);
  }
  const globalApiKey = readRaw(db, KEY_LLM_API_KEY);

  return {
    provider,
    baseUrl: baseUrl ?? envFallback.baseUrl,
    apiKey: profileApiKey !== null
      ? (profileApiKey === '' ? null : profileApiKey)
      : globalApiKey === '' ? null : globalApiKey ?? envFallback.apiKey,
    model: model ?? envFallback.model,
    thinkingDepth,
    timeoutMs:
      timeoutMs !== null && Number.isInteger(timeoutMs) ? timeoutMs : envFallback.timeoutMs,
  };
}

/** 给设置面板看的视图（不含密钥原文） */
export function getLlmSettingsView(db: Db, envFallback: LlmConfig): LlmSettingsView {
  const effective = resolveLlmConfig(db, envFallback);
  const profilesRaw = readRaw(db, KEY_LLM_PROFILES);
  const profiles = parseProfilesJson(profilesRaw, false);
  const storedActiveProfileId = readRaw(db, KEY_LLM_ACTIVE_PROFILE_ID);
  const activeProfileId = storedActiveProfileId !== null && profiles.some((profile) => profile.id === storedActiveProfileId)
    ? storedActiveProfileId
    : null;

  return {
    provider: effective.provider,
    baseUrl: effective.baseUrl,
    model: effective.model,
    thinkingDepth: effective.thinkingDepth,
    timeoutMs: effective.timeoutMs,
    hasApiKey: effective.apiKey !== null && effective.apiKey !== '',
    fromEnv: readRaw(db, KEY_LLM_BASE_URL) === null && envFallback.baseUrl !== null,
    profiles,
    activeProfileId,
  };
}

/** 校验并写入设置；返回写入后的生效配置 */
export function updateLlmSettings(
  db: Db,
  patch: LlmSettingsPatch,
  envFallback: LlmConfig,
  now: number = Date.now(),
): LlmConfig {
  const normalized: {
    provider?: LlmProviderType;
    baseUrl?: string | null;
    apiKey?: string | null;
    model?: string | null;
    thinkingDepth?: ThinkingDepth;
    timeoutMs?: number;
    profilesJson?: string | null;
    activeProfileId?: string | null;
  } = {};
  if (patch.provider !== undefined) {
    if (patch.provider !== 'openai' && patch.provider !== 'anthropic') {
      throw new SettingsError('非法服务商类型');
    }
    normalized.provider = patch.provider;
  }

  if (patch.baseUrl !== undefined) {
    normalized.baseUrl = normalizeBaseUrl(patch.baseUrl);
  }

  if (patch.apiKey !== undefined) {
    const trimmed = patch.apiKey === null ? null : patch.apiKey.trim();
    normalized.apiKey = trimmed === '' ? null : trimmed;
  }

  // 切换 provider/baseUrl 不再清掉已存密钥：密钥按预设独立保存，
  // 同一预设内换地址或回来都保持可用；不同预设的钥本来就互不相干。

  if (patch.model !== undefined) {
    const trimmed = patch.model.trim();
    if (trimmed.length > 128) {
      throw new SettingsError('模型名过长');
    }
    normalized.model = trimmed === '' ? null : trimmed;
  }

  if (patch.thinkingDepth !== undefined) {
    const thinkingDepth = normalizeThinkingDepth(patch.thinkingDepth);
    if (thinkingDepth === null) {
      throw new SettingsError('非法的思考深度选项');
    }
    normalized.thinkingDepth = thinkingDepth;
  }

  if (patch.timeoutMs !== undefined) {
    if (
      !Number.isInteger(patch.timeoutMs) ||
      patch.timeoutMs < LLM_TIMEOUT_MIN_MS ||
      patch.timeoutMs > LLM_TIMEOUT_MAX_MS
    ) {
      throw new SettingsError(
        `超时需在 ${LLM_TIMEOUT_MIN_MS}–${LLM_TIMEOUT_MAX_MS} 毫秒之间`,
      );
    }
    normalized.timeoutMs = patch.timeoutMs;
  }

  let nextProfiles = parseProfilesJson(readRaw(db, KEY_LLM_PROFILES), false);
  if (patch.profilesJson !== undefined) {
    nextProfiles = parseProfilesJson(patch.profilesJson, true);
    normalized.profilesJson = patch.profilesJson === null ? null : JSON.stringify(nextProfiles);
  }

  if (patch.activeProfileId !== undefined) {
    const activeProfileId = patch.activeProfileId === null ? null : patch.activeProfileId.trim() || null;
    if (activeProfileId !== null && !nextProfiles.some((profile) => profile.id === activeProfileId)) {
      throw new SettingsError('activeProfileId 不存在于 API 预设列表');
    }
    normalized.activeProfileId = activeProfileId;
  } else {
    const currentActiveProfileId = readRaw(db, KEY_LLM_ACTIVE_PROFILE_ID);
    if (currentActiveProfileId !== null && !nextProfiles.some((profile) => profile.id === currentActiveProfileId)) {
      normalized.activeProfileId = null;
    }
  }

  // 提交了密钥时写进激活预设的独立槽；没有激活预设仍写全局键（未用预设功能的场景）
  // 注意：patch.activeProfileId 为显式 null 时不能回落到库里的旧激活 id（会写错槽）
  const apiKeyTargetProfileId = patch.apiKey !== undefined
    ? (normalized.activeProfileId !== undefined
        ? normalized.activeProfileId
        : readRaw(db, KEY_LLM_ACTIVE_PROFILE_ID))
    : undefined;

  withTransaction(db, () => {
    if (normalized.provider !== undefined) writeRaw(db, KEY_LLM_PROVIDER, normalized.provider, now);
    if (normalized.baseUrl !== undefined) writeRaw(db, KEY_LLM_BASE_URL, normalized.baseUrl, now);
    if (apiKeyTargetProfileId !== null && apiKeyTargetProfileId !== undefined && normalized.apiKey !== undefined) {
      writeProfileApiKey(db, apiKeyTargetProfileId, normalized.apiKey, now);
    } else if (normalized.apiKey !== undefined) {
      writeRaw(db, KEY_LLM_API_KEY, normalized.apiKey, now);
    }
    if (normalized.model !== undefined) writeRaw(db, KEY_LLM_MODEL, normalized.model, now);
    if (normalized.thinkingDepth !== undefined) writeRaw(db, KEY_LLM_THINKING_DEPTH, normalized.thinkingDepth, now);
    if (normalized.timeoutMs !== undefined) writeRaw(db, KEY_LLM_TIMEOUT_MS, String(normalized.timeoutMs), now);
    if (normalized.profilesJson !== undefined) writeRaw(db, KEY_LLM_PROFILES, normalized.profilesJson, now);
    if (normalized.activeProfileId !== undefined) writeRaw(db, KEY_LLM_ACTIVE_PROFILE_ID, normalized.activeProfileId, now);
  });

  return resolveLlmConfig(db, envFallback);
}
