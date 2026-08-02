import { THINKING_DEPTH_OPTIONS, type LlmProviderType, type ThinkingDepth } from '@ldj/shared';
import { buildInferenceRequest, buildInferenceUrl, extractText } from './llmProtocol.ts';
import { normalizeLlmBaseUrl } from './llmBaseUrl.ts';
import { readLimitedJson, safeFetch, type UpstreamAddressPolicy } from './safeUpstream.ts';

export interface LlmConnectionTestInput {
  provider: LlmProviderType;
  baseUrl: string;
  apiKey: string | null;
  model: string;
  thinkingDepth: ThinkingDepth;
  timeoutMs: number;
}

export interface LlmConnectionTestSuccess {
  provider: LlmProviderType;
  model: string;
  elapsedMs: number;
  message: '连接成功';
}

export type LlmConnectionTestErrorCode =
  | 'INVALID_CONFIG'
  | 'AUTH_FAILED'
  | 'MODEL_NOT_FOUND'
  | 'RATE_LIMITED'
  | 'UPSTREAM_TIMEOUT'
  | 'UPSTREAM_UNAVAILABLE'
  | 'INVALID_RESPONSE';

export class LlmConnectionTestError extends Error {
  readonly code: LlmConnectionTestErrorCode;

  constructor(code: LlmConnectionTestErrorCode, message: string) {
    super(message);
    this.name = 'LlmConnectionTestError';
    this.code = code;
  }
}

const ERROR_MESSAGES: Record<LlmConnectionTestErrorCode, string> = {
  INVALID_CONFIG: '诊断配置无效',
  AUTH_FAILED: '上游服务拒绝鉴权',
  MODEL_NOT_FOUND: '上游服务未找到指定模型或接口',
  RATE_LIMITED: '上游服务请求过于频繁',
  UPSTREAM_TIMEOUT: '连接上游服务超时',
  UPSTREAM_UNAVAILABLE: '暂时无法连接上游服务',
  INVALID_RESPONSE: '上游服务返回了无效响应',
};

function fail(code: LlmConnectionTestErrorCode): never {
  throw new LlmConnectionTestError(code, ERROR_MESSAGES[code]);
}

function normalizeInput(input: LlmConnectionTestInput): LlmConnectionTestInput {
  if (input.provider !== 'openai' && input.provider !== 'anthropic') fail('INVALID_CONFIG');
  if (typeof input.baseUrl !== 'string') fail('INVALID_CONFIG');
  let baseUrl: string;
  try {
    baseUrl = normalizeLlmBaseUrl(input.baseUrl);
  } catch {
    fail('INVALID_CONFIG');
  }
  if (typeof input.model !== 'string' || input.model.trim() === '') fail('INVALID_CONFIG');
  if (!THINKING_DEPTH_OPTIONS.some((option) => option.value === input.thinkingDepth)) fail('INVALID_CONFIG');
  if (!Number.isInteger(input.timeoutMs) || input.timeoutMs < 1000 || input.timeoutMs > 120000) {
    fail('INVALID_CONFIG');
  }
  if (input.apiKey !== null && typeof input.apiKey !== 'string') fail('INVALID_CONFIG');
  return {
    provider: input.provider,
    baseUrl,
    apiKey: input.apiKey === null ? null : input.apiKey.trim() || null,
    model: input.model.trim(),
    thinkingDepth: input.thinkingDepth,
    timeoutMs: input.timeoutMs,
  };
}

function mapHttpError(status: number): never {
  if (status === 401 || status === 403) fail('AUTH_FAILED');
  if (status === 404) fail('MODEL_NOT_FOUND');
  if (status === 429) fail('RATE_LIMITED');
  fail('UPSTREAM_UNAVAILABLE');
}

export async function testLlmConnection(
  rawInput: LlmConnectionTestInput,
  requestSignal?: AbortSignal,
  addressPolicy?: UpstreamAddressPolicy,
): Promise<LlmConnectionTestSuccess> {
  const input = normalizeInput(rawInput);
  const startedAt = Date.now();
  const controller = new AbortController();
  const abort = () => controller.abort();
  requestSignal?.addEventListener('abort', abort, { once: true });
  if (requestSignal?.aborted) controller.abort();
  const timer = setTimeout(abort, input.timeoutMs);
  timer.unref?.();

  try {
    const request = buildInferenceRequest({
      provider: input.provider,
      model: input.model,
      apiKey: input.apiKey,
      thinkingDepth: input.thinkingDepth,
      user: 'Reply with only OK.',
      maxOutputTokens: input.provider === 'anthropic' && input.thinkingDepth !== 'off' ? 300 : 8,
    });
    const requestUrl = buildInferenceUrl(input.baseUrl, input.provider);
    const response = await safeFetch(requestUrl, {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify(request.body),
      signal: controller.signal,
      redirect: 'manual',
    }, addressPolicy);

    if (response.status >= 300 && response.status < 400) fail('INVALID_RESPONSE');
    if (!response.ok) mapHttpError(response.status);

    let body: unknown;
    try {
      body = await readLimitedJson(response);
    } catch {
      fail('INVALID_RESPONSE');
    }
    if (extractText(input.provider, body) === null) fail('INVALID_RESPONSE');

    return {
      provider: input.provider,
      model: input.model,
      elapsedMs: Date.now() - startedAt,
      message: '连接成功',
    };
  } catch (error) {
    if (error instanceof LlmConnectionTestError) throw error;
    if ((error as Error).name === 'AbortError') return fail('UPSTREAM_TIMEOUT');
    if ((error as Error).message === 'INVALID_UPSTREAM_URL') return fail('INVALID_CONFIG');
    return fail('UPSTREAM_UNAVAILABLE');
  } finally {
    clearTimeout(timer);
    requestSignal?.removeEventListener('abort', abort);
  }
}
