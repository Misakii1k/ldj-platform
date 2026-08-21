/** 运行配置（SPEC §13.1：数据目录、端口、公开地址、日志级别通过环境变量设置） */
import { resolve } from 'node:path';
import type { LlmProviderType, ThinkingDepth } from '@ldj/shared';
import { normalizeThinkingDepth } from './core/settings.ts';
import { normalizeLlmBaseUrl } from './core/llmBaseUrl.ts';

/**
 * 大模型接入配置（AI 玩家）。
 *
 * 默认全空 = 功能关闭：没配 baseUrl 就不能添加 AI 玩家，只能用规则机器人。
 * 端点由使用者自己指定（本地 Ollama、自建网关或云服务都行），
 * 平台不内置任何默认第三方地址——决定把对局内容发给谁，是使用者的选择。
 *
 * 注意：启用后，AI 玩家的局势描述（含它自己的手牌/身份）会发往该端点。
 */
export interface LlmConfig {
  provider: LlmProviderType;
  /** 端点前缀，例如 http://127.0.0.1:11434/v1 或 https://api.anthropic.com */
  baseUrl: string | null;
  /** API 密钥；本地模型通常留空 */
  apiKey: string | null;
  model: string;
  thinkingDepth: ThinkingDepth;
  /** 单次决策超时；超时或报错则回落到规则策略 */
  timeoutMs: number;
}

export interface ServerConfig {
  host: string;
  port: number;
  dbPath: string;
  /** 数据目录（SQLite、启动信息 boot.json 等）；APP 内嵌运行时由原生层注入 */
  dataDir: string;
  /** 显式覆盖二维码地址（FR-BOOT-002） */
  publicBaseUrl: string | null;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  /** 额外允许的 Origin（开发模式例外，SPEC §9.5） */
  allowedOrigins: string[];
  allowPrivateLlmUpstream: boolean;
  llm: LlmConfig;
  /**
   * 远程改设置的口令。
   *
   * 不设（默认）时，写设置只放行本机请求 —— 也就是只有开服务器那台机器能改。
   * 想在手机上改设置就设一个，请求头带 x-admin-token。
   * 之所以要这道关：设置里含 API 密钥，而局域网内谁都能访问这个端口。
   */
  adminToken: string | null;
  /**
   * join/resume 限流配额覆盖（E2E/CI 放宽用；默认 10 次/分钟/IP，SPEC §9.5）。
   * 只读配置，不新增设置键；缺省时保持生产限流。
   */
  joinLimitMax?: number | null;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const port = Number(env.PORT ?? 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`非法端口：${env.PORT}`);
  }
  const dataDir = env.DATA_DIR ?? './data';
  const logLevel = env.LOG_LEVEL ?? 'info';
  if (!['debug', 'info', 'warn', 'error'].includes(logLevel)) {
    throw new Error(`非法日志级别：${logLevel}`);
  }
  const llmTimeout = Number(env.LLM_TIMEOUT_MS ?? 20_000);
  if (!Number.isInteger(llmTimeout) || llmTimeout < 1000 || llmTimeout > 120_000) {
    throw new Error(`非法 LLM 超时：${env.LLM_TIMEOUT_MS}`);
  }
  const rawLlmBaseUrl = (env.LLM_BASE_URL ?? '').trim();
  let llmBaseUrl: string | null = null;
  if (rawLlmBaseUrl !== '') {
    try {
      llmBaseUrl = normalizeLlmBaseUrl(rawLlmBaseUrl);
    } catch {
      throw new Error('非法 LLM Base URL');
    }
  }
  const llmProvider = (env.LLM_PROVIDER ?? 'openai').trim().toLowerCase();
  if (llmProvider !== 'openai' && llmProvider !== 'anthropic') {
    throw new Error(`非法 LLM 服务商：${env.LLM_PROVIDER}`);
  }
  const thinkingDepthRaw = env.LLM_THINKING_DEPTH === undefined
    ? 'off'
    : env.LLM_THINKING_DEPTH.trim().toLowerCase();
  const thinkingDepth = normalizeThinkingDepth(thinkingDepthRaw);
  if (thinkingDepth === null) {
    throw new Error(`非法 LLM 思考深度：${env.LLM_THINKING_DEPTH}`);
  }
  const allowPrivateNetworkRaw = env.LLM_ALLOW_PRIVATE_NETWORK;
  if (allowPrivateNetworkRaw !== undefined && allowPrivateNetworkRaw !== 'true' && allowPrivateNetworkRaw !== 'false') {
    throw new Error(`非法 LLM 私网上游开关：${allowPrivateNetworkRaw}`);
  }

  return {
    host: env.HOST ?? '0.0.0.0',
    port,
    dbPath: env.DB_PATH ?? resolve(dataDir, 'platform.db'),
    dataDir,
    publicBaseUrl: env.PUBLIC_BASE_URL ?? null,
    logLevel: logLevel as ServerConfig['logLevel'],
    // 默认放行 Capacitor WebView 源（APP 跨源连接）；ALLOWED_ORIGINS 可追加
    allowedOrigins: [
      ...new Set([
        ...(env.ALLOWED_ORIGINS ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        'http://localhost',
        'https://localhost',
      ]),
    ],
    allowPrivateLlmUpstream: allowPrivateNetworkRaw === 'true',
    llm: {
      provider: llmProvider,
      baseUrl: llmBaseUrl,
      apiKey: (env.LLM_API_KEY ?? '').trim() || null,
      model: (env.LLM_MODEL ?? '').trim() || 'gpt-4o-mini',
      thinkingDepth,
      timeoutMs: llmTimeout,
    },
    adminToken: (env.ADMIN_TOKEN ?? '').trim() || null,
    joinLimitMax: env.E2E_JOIN_LIMIT_MAX === undefined
      ? null
      : (() => {
          const n = Number(env.E2E_JOIN_LIMIT_MAX);
          if (!Number.isInteger(n) || n < 1 || n > 10_000) {
            throw new Error(`非法 join 限流配额：${env.E2E_JOIN_LIMIT_MAX}`);
          }
          return n;
        })(),
  };
}
