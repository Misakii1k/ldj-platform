import type { LlmProviderType } from '@ldj/shared';
import { buildModelsHeaders, buildModelsUrl, parseModelPage } from './llmProtocol.ts';
import { normalizeLlmBaseUrl } from './llmBaseUrl.ts';
import { readLimitedJson, safeFetch, type UpstreamAddressPolicy } from './safeUpstream.ts';

export type LlmModelCatalogErrorCode =
  | 'INVALID_CONFIG'
  | 'AUTH_FAILED'
  | 'MODEL_CATALOG_NOT_FOUND'
  | 'RATE_LIMITED'
  | 'UPSTREAM_TIMEOUT'
  | 'UPSTREAM_UNAVAILABLE'
  | 'INVALID_RESPONSE';

export class LlmModelCatalogError extends Error {
  readonly code: LlmModelCatalogErrorCode;

  constructor(code: LlmModelCatalogErrorCode, message: string) {
    super(message);
    this.name = 'LlmModelCatalogError';
    this.code = code;
  }
}

export interface LlmModelCatalogInput {
  provider: LlmProviderType;
  baseUrl: string;
  apiKey: string | null;
  timeoutMs?: number;
}

const ERROR_MESSAGES: Record<LlmModelCatalogErrorCode, string> = {
  INVALID_CONFIG: '模型目录配置无效',
  AUTH_FAILED: '上游认证失败',
  MODEL_CATALOG_NOT_FOUND: '上游不提供模型目录接口',
  RATE_LIMITED: '上游请求频率受限',
  UPSTREAM_TIMEOUT: '上游模型目录请求超时',
  UPSTREAM_UNAVAILABLE: '暂时无法连接上游模型目录',
  INVALID_RESPONSE: '上游模型目录响应无效',
};

function fail(code: LlmModelCatalogErrorCode): never {
  throw new LlmModelCatalogError(code, ERROR_MESSAGES[code]);
}

function normalizeInput(input: LlmModelCatalogInput): Required<LlmModelCatalogInput> {
  if (input.provider !== 'openai' && input.provider !== 'anthropic') fail('INVALID_CONFIG');
  if (typeof input.baseUrl !== 'string' || input.baseUrl.trim() === '') fail('INVALID_CONFIG');
  let baseUrl: string;
  try {
    baseUrl = normalizeLlmBaseUrl(input.baseUrl);
  } catch {
    fail('INVALID_CONFIG');
  }
  if (input.apiKey !== null && typeof input.apiKey !== 'string') fail('INVALID_CONFIG');
  const timeoutMs = input.timeoutMs ?? 6000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) fail('INVALID_CONFIG');
  return {
    provider: input.provider,
    baseUrl,
    apiKey: input.apiKey === null ? null : input.apiKey.trim() || null,
    timeoutMs,
  };
}

function isModelPage(body: unknown): boolean {
  if (typeof body !== 'object' || body === null) return false;
  if (Array.isArray(body)) return true;
  const record = body as Record<string, unknown>;
  return Array.isArray(record.data) || Array.isArray(record.models);
}

function mapStatus(status: number): never {
  if (status === 401 || status === 403) fail('AUTH_FAILED');
  if (status === 404) fail('MODEL_CATALOG_NOT_FOUND');
  if (status === 429) fail('RATE_LIMITED');
  fail('UPSTREAM_UNAVAILABLE');
}

export async function fetchLlmModels(
  rawInput: LlmModelCatalogInput,
  requestSignal?: AbortSignal,
  addressPolicy?: UpstreamAddressPolicy,
): Promise<string[]> {
  const input = normalizeInput(rawInput);
  const controller = new AbortController();
  const abort = () => controller.abort();
  requestSignal?.addEventListener('abort', abort, { once: true });
  if (requestSignal?.aborted) controller.abort();
  const timer = setTimeout(abort, input.timeoutMs);
  timer.unref?.();
  const models: string[] = [];
  const seen = new Set<string>();
  let currentUrl = buildModelsUrl(input.baseUrl);
  let initialOrigin: string | null = null;

  try {
    for (let page = 0; page < 5 && models.length < 500; page += 1) {
      let validatedUrl: URL;
      try {
        if (controller.signal.aborted) throw new DOMException('The operation was aborted', 'AbortError');
        validatedUrl = new URL(currentUrl);
      } catch (error) {
        if ((error as Error).name === 'AbortError') throw error;
        if (page === 0 && (error as Error).message === 'INVALID_UPSTREAM_URL') fail('INVALID_CONFIG');
        if (page === 0 && (error as Error).message === 'UPSTREAM_DNS_FAILED') fail('UPSTREAM_UNAVAILABLE');
        if (page === 0) fail('INVALID_CONFIG');
        fail('INVALID_RESPONSE');
      }
      if (initialOrigin === null) initialOrigin = validatedUrl.origin;
      else if (validatedUrl.origin !== initialOrigin) fail('INVALID_RESPONSE');

      let response: Response;
      try {
        response = await safeFetch(validatedUrl, {
          headers: buildModelsHeaders(input.provider, input.apiKey),
          signal: controller.signal,
          redirect: 'manual',
        }, addressPolicy);
      } catch (error) {
        if ((error as Error).name === 'AbortError') throw error;
        if (page === 0 && (error as Error).message === 'INVALID_UPSTREAM_URL') fail('INVALID_CONFIG');
        if (page === 0 && (error as Error).message === 'UPSTREAM_DNS_FAILED') fail('UPSTREAM_UNAVAILABLE');
        fail(page === 0 ? 'UPSTREAM_UNAVAILABLE' : 'INVALID_RESPONSE');
      }
      if (response.status >= 300 && response.status < 400) fail('INVALID_RESPONSE');
      if (!response.ok) mapStatus(response.status);

      let body: unknown;
      try {
        body = await readLimitedJson(response);
      } catch {
        fail('INVALID_RESPONSE');
      }
      if (!isModelPage(body)) fail('INVALID_RESPONSE');
      const parsed = parseModelPage(body);
      for (const id of parsed.ids) {
        if (seen.has(id)) continue;
        seen.add(id);
        models.push(id);
        if (models.length === 500) break;
      }
      if (parsed.nextUrl === null) break;
      try {
        currentUrl = new URL(parsed.nextUrl, validatedUrl).toString();
      } catch {
        fail('INVALID_RESPONSE');
      }
    }
    if (models.length === 0) fail('INVALID_RESPONSE');
    return models;
  } catch (error) {
    if (error instanceof LlmModelCatalogError) throw error;
    if ((error as Error).name === 'AbortError') fail('UPSTREAM_TIMEOUT');
    fail('UPSTREAM_UNAVAILABLE');
  } finally {
    clearTimeout(timer);
    requestSignal?.removeEventListener('abort', abort);
  }
  return fail('UPSTREAM_UNAVAILABLE');
}
