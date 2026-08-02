import type { LlmProviderType, ThinkingDepth } from '@ldj/shared';

export interface AiSettingsForm {
  provider: LlmProviderType;
  baseUrl: string;
  apiKey: string;
  clearApiKey: boolean;
  model: string;
  thinkingDepth: ThinkingDepth;
  timeoutMs: number;
}

export type AiDiagnosticErrorCode =
  | 'INVALID_CONFIG'
  | 'AUTH_FAILED'
  | 'MODEL_NOT_FOUND'
  | 'RATE_LIMITED'
  | 'UPSTREAM_TIMEOUT'
  | 'UPSTREAM_UNAVAILABLE'
  | 'INVALID_RESPONSE';

export type AiModelCatalogErrorCode =
  | 'INVALID_CONFIG'
  | 'AUTH_FAILED'
  | 'MODEL_CATALOG_NOT_FOUND'
  | 'RATE_LIMITED'
  | 'UPSTREAM_TIMEOUT'
  | 'UPSTREAM_UNAVAILABLE'
  | 'INVALID_RESPONSE';

export interface AiDiagnosticSuccess {
  status: 'success';
  fingerprint: string;
  provider: LlmProviderType;
  model: string;
  elapsedMs: number;
  usedSavedApiKey: boolean;
  message: string;
}

export interface AiDiagnosticFailure {
  status: 'error';
  fingerprint: string;
  code: AiDiagnosticErrorCode;
  message: string;
}

export type AiDiagnosticState =
  | { status: 'idle' }
  | { status: 'testing'; fingerprint: string }
  | AiDiagnosticSuccess
  | AiDiagnosticFailure
  | { status: 'stale'; previous: AiDiagnosticSuccess | AiDiagnosticFailure };

const DIAGNOSTIC_ERROR_MESSAGES: Record<AiDiagnosticErrorCode, string> = {
  INVALID_CONFIG: '配置无效，请检查服务商、地址、模型和超时时间',
  AUTH_FAILED: '认证失败，请检查 API 密钥及其访问权限',
  MODEL_NOT_FOUND: '模型不存在或不可访问，请确认模型名称和账号权限',
  RATE_LIMITED: '请求过于频繁或额度受限，请稍后再试',
  UPSTREAM_TIMEOUT: '上游响应超时，请检查网络或适当增加超时时间',
  UPSTREAM_UNAVAILABLE: '无法连接上游服务，请检查地址、网络和服务状态',
  INVALID_RESPONSE: '上游返回了无法识别的响应，请检查协议和服务兼容性',
};

const MODEL_CATALOG_ERROR_MESSAGES: Record<AiModelCatalogErrorCode, string> = {
  INVALID_CONFIG: '配置无效，请检查服务商和接口地址',
  AUTH_FAILED: '认证失败，请检查 API 密钥及其模型目录访问权限',
  MODEL_CATALOG_NOT_FOUND: '服务未提供模型目录接口，请保留当前模型或手动输入模型 ID',
  RATE_LIMITED: '模型目录请求过于频繁或额度受限，请稍后再试',
  UPSTREAM_TIMEOUT: '模型目录响应超时，请检查网络后重试',
  UPSTREAM_UNAVAILABLE: '无法连接模型目录，请检查接口地址、网络和服务状态',
  INVALID_RESPONSE: '模型目录返回了无法识别的响应，请手动输入模型 ID',
};

export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

export function buildModelRequestBody(form: AiSettingsForm): Record<string, unknown> {
  const body: Record<string, unknown> = {
    provider: form.provider,
    baseUrl: normalizeBaseUrl(form.baseUrl),
  };
  if (form.clearApiKey) body.apiKey = null;
  else if (form.apiKey.trim()) body.apiKey = form.apiKey.trim();
  return body;
}

export function createConfigFingerprint(form: AiSettingsForm): string {
  return JSON.stringify([
    form.provider,
    normalizeBaseUrl(form.baseUrl),
    form.model,
    form.thinkingDepth,
    form.timeoutMs,
    form.apiKey.trim() !== '',
    form.clearApiKey,
  ]);
}

export function markDiagnosticStale(
  state: AiDiagnosticState,
  fingerprint: string,
): AiDiagnosticState {
  if (state.status === 'testing' && state.fingerprint !== fingerprint) {
    return { status: 'idle' };
  }
  if (
    (state.status === 'success' || state.status === 'error') &&
    state.fingerprint !== fingerprint
  ) {
    return { status: 'stale', previous: state };
  }
  return state;
}

export function diagnosticErrorMessage(code: unknown): string {
  if (typeof code === 'string' && code in DIAGNOSTIC_ERROR_MESSAGES) {
    return DIAGNOSTIC_ERROR_MESSAGES[code as AiDiagnosticErrorCode];
  }
  return '连接测试失败，请检查配置后重试';
}

export function modelCatalogErrorMessage(code: unknown): string {
  if (typeof code === 'string' && code in MODEL_CATALOG_ERROR_MESSAGES) {
    return MODEL_CATALOG_ERROR_MESSAGES[code as AiModelCatalogErrorCode];
  }
  return '获取模型目录失败，请检查配置后重试';
}

export function thinkingDepthDescription(provider: LlmProviderType): string {
  return provider === 'anthropic'
    ? 'Max 在 Anthropic 协议中使用 8192-token thinking budget。'
    : 'Max 在 OpenAI 兼容协议中原样发送 reasoning_effort=max。';
}
