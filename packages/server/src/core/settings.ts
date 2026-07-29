/**
 * 运行期设置（存库、改完即生效）。
 *
 * 为什么不只用环境变量：环境变量要改文件、要重启进程，聚会现场没人愿意干这个。
 * 这里的规则是「库里有就用库里的，库里没有就用环境变量兜底」——
 * 部署方可以继续用 LLM_BASE_URL 预置，房主也能在网页上临时改。
 *
 * 密钥只进不出：写入后对外一律只回 hasApiKey 布尔，任何接口都不回传原文。
 */
import type { Db } from '../persistence/db.ts';
import type { LlmConfig } from '../config.ts';

/** 设置项键名；值一律以字符串存，读出时各自解析 */
const KEY_LLM_BASE_URL = 'llm.baseUrl';
const KEY_LLM_API_KEY = 'llm.apiKey';
const KEY_LLM_MODEL = 'llm.model';
const KEY_LLM_TIMEOUT_MS = 'llm.timeoutMs';

export const LLM_TIMEOUT_MIN_MS = 1000;
export const LLM_TIMEOUT_MAX_MS = 120_000;

/** 对外可见的设置视图：不含密钥原文 */
export interface LlmSettingsView {
  baseUrl: string | null;
  model: string;
  timeoutMs: number;
  /** 是否已设置密钥；原文永不出库 */
  hasApiKey: boolean;
  /** 该项当前值是否来自环境变量（库里没写过） */
  fromEnv: boolean;
}

/** 一次设置更新；字段缺省表示"不动这一项" */
export interface LlmSettingsPatch {
  baseUrl?: string | null;
  /** null = 清空密钥；undefined = 保持不变 */
  apiKey?: string | null;
  model?: string;
  timeoutMs?: number;
}

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

/**
 * 合并环境变量与库设置，得到当前生效的大模型配置。
 * envFallback 传 loadConfig() 读出来的那份。
 */
export function resolveLlmConfig(db: Db, envFallback: LlmConfig): LlmConfig {
  const baseUrl = readRaw(db, KEY_LLM_BASE_URL);
  const apiKey = readRaw(db, KEY_LLM_API_KEY);
  const model = readRaw(db, KEY_LLM_MODEL);
  const timeoutRaw = readRaw(db, KEY_LLM_TIMEOUT_MS);
  const timeoutMs = timeoutRaw === null ? null : Number(timeoutRaw);

  return {
    baseUrl: baseUrl ?? envFallback.baseUrl,
    apiKey: apiKey ?? envFallback.apiKey,
    model: model ?? envFallback.model,
    timeoutMs:
      timeoutMs !== null && Number.isInteger(timeoutMs) ? timeoutMs : envFallback.timeoutMs,
  };
}

/** 给设置面板看的视图（不含密钥原文） */
export function getLlmSettingsView(db: Db, envFallback: LlmConfig): LlmSettingsView {
  const effective = resolveLlmConfig(db, envFallback);
  return {
    baseUrl: effective.baseUrl,
    model: effective.model,
    timeoutMs: effective.timeoutMs,
    hasApiKey: effective.apiKey !== null && effective.apiKey !== '',
    fromEnv: readRaw(db, KEY_LLM_BASE_URL) === null && envFallback.baseUrl !== null,
  };
}

/** 校验并写入设置；返回写入后的生效配置 */
export function updateLlmSettings(
  db: Db,
  patch: LlmSettingsPatch,
  envFallback: LlmConfig,
  now: number = Date.now(),
): LlmConfig {
  if (patch.baseUrl !== undefined && patch.baseUrl !== null) {
    const trimmed = patch.baseUrl.trim().replace(/\/+$/, '');
    if (trimmed !== '') {
      let parsed: URL;
      try {
        parsed = new URL(trimmed);
      } catch {
        throw new SettingsError('接口地址不是合法 URL，例如 http://127.0.0.1:11434/v1');
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new SettingsError('接口地址只支持 http 或 https');
      }
    }
    writeRaw(db, KEY_LLM_BASE_URL, trimmed === '' ? null : trimmed, now);
  } else if (patch.baseUrl === null) {
    writeRaw(db, KEY_LLM_BASE_URL, null, now);
  }

  if (patch.apiKey !== undefined) {
    const trimmed = patch.apiKey === null ? null : patch.apiKey.trim();
    writeRaw(db, KEY_LLM_API_KEY, trimmed === '' ? null : trimmed, now);
  }

  if (patch.model !== undefined) {
    const trimmed = patch.model.trim();
    if (trimmed.length > 128) {
      throw new SettingsError('模型名过长');
    }
    writeRaw(db, KEY_LLM_MODEL, trimmed === '' ? null : trimmed, now);
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
    writeRaw(db, KEY_LLM_TIMEOUT_MS, String(patch.timeoutMs), now);
  }

  return resolveLlmConfig(db, envFallback);
}
