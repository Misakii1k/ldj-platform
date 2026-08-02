/**
 * settings.ts 测试：覆盖校验分支、库/env 优先级、视图脱敏、fromEnv 标志、清空密钥、末尾斜杠处理。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, type Db } from '../src/persistence/db.ts';
import {
  resolveLlmConfig,
  getLlmSettingsView,
  updateLlmSettings,
  SettingsError,
  LLM_TIMEOUT_MIN_MS,
  LLM_TIMEOUT_MAX_MS,
} from '../src/core/settings.ts';
import type { LlmConfig } from '../src/config.ts';

/** 建内存库 + 手动建 app_settings 表（不走完整迁移器，加快测试速度） */
function freshDb(): Db {
  const db = openDb({ path: ':memory:' });
  db.exec(`
    CREATE TABLE app_settings (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  return db;
}

const envFallback: LlmConfig = {
  provider: 'openai',
  baseUrl: 'http://env.example/v1',
  apiKey: 'env-key',
  model: 'env-model',
  thinkingDepth: 'off',
  timeoutMs: 20000,
};

/** env 中无密钥，用于测试 hasApiKey / 清空密钥场景 */
const envNoKey: LlmConfig = {
  provider: 'openai',
  baseUrl: 'http://env.example/v1',
  apiKey: null,
  model: 'env-model',
  thinkingDepth: 'off',
  timeoutMs: 20000,
};

// ==================== 校验分支（应抛 SettingsError）====================

test('baseUrl 非法（not-a-url）→ SettingsError', () => {
  const db = freshDb();
  assert.throws(
    () => updateLlmSettings(db, { baseUrl: 'not-a-url' }, envFallback),
    SettingsError,
  );
  db.close();
});

test('baseUrl 非法（http:// 无 host）→ SettingsError', () => {
  const db = freshDb();
  assert.throws(
    () => updateLlmSettings(db, { baseUrl: 'http://' }, envFallback),
    SettingsError,
  );
  db.close();
});

test('baseUrl 协议非 http(s)（ftp://example.com）→ SettingsError', () => {
  const db = freshDb();
  assert.throws(
    () => updateLlmSettings(db, { baseUrl: 'ftp://example.com' }, envFallback),
    SettingsError,
  );
  db.close();
});

test('baseUrl 协议非 http(s)（javascript:alert(1)）→ SettingsError', () => {
  const db = freshDb();
  assert.throws(
    () => updateLlmSettings(db, { baseUrl: 'javascript:alert(1)' }, envFallback),
    SettingsError,
  );
  db.close();
});

test('baseUrl 拒绝凭据、query 和 hash', () => {
  const invalidUrls = [
    'https://user:pass@api.example.com/v1',
    'https://api.example.com/v1?token=secret',
    'https://api.example.com/v1#fragment',
  ];
  for (const baseUrl of invalidUrls) {
    const db = freshDb();
    assert.throws(() => updateLlmSettings(db, { baseUrl }, envFallback), SettingsError);
    db.close();
  }
});

test('timeoutMs < 1000 → SettingsError', () => {
  const db = freshDb();
  assert.throws(
    () => updateLlmSettings(db, { timeoutMs: LLM_TIMEOUT_MIN_MS - 1 }, envFallback),
    SettingsError,
  );
  db.close();
});

test('timeoutMs > 120000 → SettingsError', () => {
  const db = freshDb();
  assert.throws(
    () => updateLlmSettings(db, { timeoutMs: LLM_TIMEOUT_MAX_MS + 1 }, envFallback),
    SettingsError,
  );
  db.close();
});

test('timeoutMs 非整数（1.5）→ SettingsError', () => {
  const db = freshDb();
  assert.throws(
    () => updateLlmSettings(db, { timeoutMs: 1.5 }, envFallback),
    SettingsError,
  );
  db.close();
});

test('timeoutMs 非整数（NaN）→ SettingsError', () => {
  const db = freshDb();
  assert.throws(
    () => updateLlmSettings(db, { timeoutMs: NaN }, envFallback),
    SettingsError,
  );
  db.close();
});

test('模型名超长（> 128 字符）→ SettingsError', () => {
  const db = freshDb();
  assert.throws(
    () => updateLlmSettings(db, { model: 'a'.repeat(129) }, envFallback),
    SettingsError,
  );
  db.close();
});

// ==================== 边界值（应通过）====================

test('timeoutMs = 1000（下界）应通过', () => {
  const db = freshDb();
  const result = updateLlmSettings(db, { timeoutMs: LLM_TIMEOUT_MIN_MS }, envFallback);
  assert.equal(result.timeoutMs, LLM_TIMEOUT_MIN_MS);
  assert.equal(resolveLlmConfig(db, envFallback).timeoutMs, LLM_TIMEOUT_MIN_MS);
  db.close();
});

test('timeoutMs = 120000（上界）应通过', () => {
  const db = freshDb();
  const result = updateLlmSettings(db, { timeoutMs: LLM_TIMEOUT_MAX_MS }, envFallback);
  assert.equal(result.timeoutMs, LLM_TIMEOUT_MAX_MS);
  assert.equal(resolveLlmConfig(db, envFallback).timeoutMs, LLM_TIMEOUT_MAX_MS);
  db.close();
});

test('思考深度支持 max', () => {
  const db = freshDb();
  const result = updateLlmSettings(db, { thinkingDepth: 'max' }, envFallback);
  assert.equal(result.thinkingDepth, 'max');
  db.close();
});

// ==================== 库/env 优先级 ===================

test('已保存的 openai 服务商可以覆盖 anthropic 环境兜底', () => {
  const db = freshDb();
  const anthropicEnv: LlmConfig = { ...envFallback, provider: 'anthropic' };
  updateLlmSettings(db, { provider: 'openai' }, anthropicEnv);
  assert.equal(resolveLlmConfig(db, anthropicEnv).provider, 'openai');
  db.close();
});

test('库有值 → resolveLlmConfig 返回库值', () => {
  const db = freshDb();
  const result = updateLlmSettings(
    db,
    {
      baseUrl: 'http://db.example/v1',
      apiKey: 'db-key',
      model: 'db-model',
      timeoutMs: 30000,
    },
    envFallback,
  );
  // updateLlmSettings 返回值即生效配置
  assert.equal(result.baseUrl, 'http://db.example/v1');
  assert.equal(result.apiKey, 'db-key');
  assert.equal(result.model, 'db-model');
  assert.equal(result.timeoutMs, 30000);
  // resolveLlmConfig 也应返回库值
  const cfg = resolveLlmConfig(db, envFallback);
  assert.equal(cfg.baseUrl, 'http://db.example/v1');
  assert.equal(cfg.apiKey, 'db-key');
  assert.equal(cfg.model, 'db-model');
  assert.equal(cfg.timeoutMs, 30000);
  db.close();
});

test('库无值 → 回落 env', () => {
  const db = freshDb();
  const cfg = resolveLlmConfig(db, envFallback);
  assert.equal(cfg.baseUrl, 'http://env.example/v1');
  assert.equal(cfg.apiKey, 'env-key');
  assert.equal(cfg.model, 'env-model');
  assert.equal(cfg.timeoutMs, 20000);
  db.close();
});

test('旧数据库思考深度 8192 解析为 max', () => {
  const db = freshDb();
  db.prepare('INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)')
    .run('llm.thinkingDepth', '8192', 1);
  assert.equal(resolveLlmConfig(db, envFallback).thinkingDepth, 'max');
  db.close();
});

test('清空库值（patch.baseUrl = null）→ 回落 env', () => {
  const db = freshDb();
  updateLlmSettings(db, { baseUrl: 'http://db.example/v1' }, envFallback);
  assert.equal(resolveLlmConfig(db, envFallback).baseUrl, 'http://db.example/v1');
  // 清空库值
  updateLlmSettings(db, { baseUrl: null }, envFallback);
  assert.equal(resolveLlmConfig(db, envFallback).baseUrl, 'http://env.example/v1');
  db.close();
});

// ==================== 视图不含密钥原文 ===================

test('getLlmSettingsView 返回对象不含 apiKey 字段', () => {
  const db = freshDb();
  updateLlmSettings(db, { apiKey: 'secret-key' }, envFallback);
  const view = getLlmSettingsView(db, envFallback);
  assert.equal('apiKey' in view, false);
  db.close();
});

test('hasApiKey：设了非空密钥 → true', () => {
  const db = freshDb();
  updateLlmSettings(db, { apiKey: 'secret-key' }, envNoKey);
  assert.equal(getLlmSettingsView(db, envNoKey).hasApiKey, true);
  db.close();
});

test('hasApiKey：未设或空 → false', () => {
  const db = freshDb();
  // envNoKey 的 apiKey 为 null，库也未写入 → hasApiKey = false
  assert.equal(getLlmSettingsView(db, envNoKey).hasApiKey, false);
  db.close();
});

// ==================== fromEnv 标志 ===================

test('fromEnv：库未写且 env 有值时 → true', () => {
  const db = freshDb();
  assert.equal(getLlmSettingsView(db, envFallback).fromEnv, true);
  db.close();
});

test('fromEnv：库已写时 → false', () => {
  const db = freshDb();
  updateLlmSettings(db, { baseUrl: 'http://db.example/v1' }, envFallback);
  assert.equal(getLlmSettingsView(db, envFallback).fromEnv, false);
  db.close();
});

// ==================== 清空密钥 ===================

test('patch.apiKey = null → 库中删除该项', () => {
  const db = freshDb();
  updateLlmSettings(db, { apiKey: 'secret-key' }, envNoKey);
  assert.equal(getLlmSettingsView(db, envNoKey).hasApiKey, true);
  updateLlmSettings(db, { apiKey: null }, envNoKey);
  assert.equal(getLlmSettingsView(db, envNoKey).hasApiKey, false);
  db.close();
});

test('patch.apiKey = ""（空字符串 trim 后也空）→ 库中删除该项', () => {
  const db = freshDb();
  updateLlmSettings(db, { apiKey: 'secret-key' }, envNoKey);
  assert.equal(getLlmSettingsView(db, envNoKey).hasApiKey, true);
  updateLlmSettings(db, { apiKey: '' }, envNoKey);
  assert.equal(getLlmSettingsView(db, envNoKey).hasApiKey, false);
  db.close();
});

test('更换 provider 且未提交新密钥时清除旧密钥', () => {
  const db = freshDb();
  updateLlmSettings(db, { provider: 'openai', apiKey: 'old-key' }, envNoKey);
  const result = updateLlmSettings(db, { provider: 'anthropic' }, envNoKey);
  assert.equal(result.apiKey, null);
  assert.equal(getLlmSettingsView(db, envNoKey).hasApiKey, false);
  db.close();
});

test('更换 baseUrl 且未提交新密钥时清除旧密钥', () => {
  const db = freshDb();
  updateLlmSettings(db, { baseUrl: 'https://old.example/v1', apiKey: 'old-key' }, envNoKey);
  const result = updateLlmSettings(db, { baseUrl: 'https://new.example/v1' }, envNoKey);
  assert.equal(result.apiKey, null);
  assert.equal(getLlmSettingsView(db, envNoKey).hasApiKey, false);
  db.close();
});

// ==================== 末尾斜杠处理 ===================

test('baseUrl 末尾斜杠应被去掉（http://x:11434/v1/ → http://x:11434/v1）', () => {
  const db = freshDb();
  updateLlmSettings(db, { baseUrl: 'http://x:11434/v1/' }, envFallback);
  assert.equal(resolveLlmConfig(db, envFallback).baseUrl, 'http://x:11434/v1');
  db.close();
});

test('设置校验失败时不会部分写入前面的字段', () => {
  const db = freshDb();
  updateLlmSettings(db, { baseUrl: 'http://initial.example/v1', model: 'initial-model' }, envFallback);

  assert.throws(
    () => updateLlmSettings(db, { baseUrl: 'http://new.example/v1', model: 'a'.repeat(129) }, envFallback),
    SettingsError,
  );

  const resolved = resolveLlmConfig(db, envFallback);
  assert.equal(resolved.baseUrl, 'http://initial.example/v1');
  assert.equal(resolved.model, 'initial-model');
  db.close();
});

test('API 预设会被校验并持久化，非法预设不会污染旧值', () => {
  const db = freshDb();
  const profiles = JSON.stringify([
    {
      id: 'local',
      name: '本地模型',
      provider: 'openai',
      baseUrl: 'http://127.0.0.1:11434/v1',
      model: 'qwen2.5',
      thinkingDepth: 'off',
      timeoutMs: 30_000,
      hasApiKey: false,
    },
  ]);
  updateLlmSettings(db, { profilesJson: profiles, activeProfileId: 'local' }, envFallback);
  assert.equal(getLlmSettingsView(db, envFallback).activeProfileId, 'local');
  assert.equal(getLlmSettingsView(db, envFallback).profiles[0]?.model, 'qwen2.5');

  assert.throws(
    () => updateLlmSettings(db, { profilesJson: '{"not":"an array"}' }, envFallback),
    SettingsError,
  );
  assert.equal(getLlmSettingsView(db, envFallback).activeProfileId, 'local');
  db.close();
});

test('旧 API 预设思考深度 8192 解析并保存为 max', () => {
  const db = freshDb();
  const profiles = JSON.stringify([
    {
      id: 'legacy',
      name: '旧预设',
      provider: 'anthropic',
      baseUrl: 'https://api.anthropic.com',
      model: 'claude-test',
      thinkingDepth: '8192',
      timeoutMs: 30_000,
      hasApiKey: true,
    },
  ]);
  db.prepare('INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)')
    .run('llm.profiles', profiles, 1);

  assert.equal(getLlmSettingsView(db, envFallback).profiles[0]?.thinkingDepth, 'max');
  updateLlmSettings(db, { profilesJson: profiles }, envFallback);
  const stored = db.prepare('SELECT value FROM app_settings WHERE key = ?')
    .get('llm.profiles') as { value: string };
  assert.equal(JSON.parse(stored.value)[0].thinkingDepth, 'max');
  db.close();
});
