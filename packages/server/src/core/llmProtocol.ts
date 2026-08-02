import type { LlmProviderType, ThinkingDepth } from '@ldj/shared';
import { normalizeLlmBaseUrl } from './llmBaseUrl.ts';

export interface LlmInferenceRequestInput {
  provider: LlmProviderType;
  model: string;
  apiKey: string | null;
  thinkingDepth: ThinkingDepth;
  system?: string;
  user: string;
  maxOutputTokens: number;
  temperature?: number;
}

const THINKING_BUDGETS: Partial<Record<ThinkingDepth, number>> = {
  low: 1024,
  medium: 2048,
  high: 4096,
  max: 8192,
};

function appendEndpoint(baseUrl: string, suffix: string): string {
  const normalized = normalizeLlmBaseUrl(baseUrl);
  if (normalized.endsWith(suffix)) return normalized;
  return normalized.endsWith('/v1') ? `${normalized}${suffix}` : `${normalized}/v1${suffix}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function normalizedString(value: unknown, maxLength?: number): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (normalized === '' || maxLength !== undefined && normalized.length > maxLength) return null;
  return normalized;
}

export function buildInferenceUrl(baseUrl: string, provider: LlmProviderType): string {
  return appendEndpoint(baseUrl, provider === 'anthropic' ? '/messages' : '/chat/completions');
}

export function buildModelsUrl(baseUrl: string): string {
  const normalized = normalizeLlmBaseUrl(baseUrl);
  if (normalized.endsWith('/models')) return normalized;
  return normalized.endsWith('/v1') ? `${normalized}/models` : `${normalized}/v1/models`;
}

export function buildModelsHeaders(
  provider: LlmProviderType,
  apiKey: string | null,
): Record<string, string> {
  if (provider === 'anthropic') {
    return {
      'anthropic-version': '2023-06-01',
      ...(apiKey === null ? {} : { 'x-api-key': apiKey }),
    };
  }
  return apiKey === null ? {} : { authorization: `Bearer ${apiKey}` };
}

export function buildInferenceRequest(
  input: LlmInferenceRequestInput,
): { headers: Record<string, string>; body: Record<string, unknown> } {
  const headers = {
    'content-type': 'application/json',
    ...buildModelsHeaders(input.provider, input.apiKey),
  };
  if (input.provider === 'anthropic') {
    const budgetTokens = THINKING_BUDGETS[input.thinkingDepth];
    return {
      headers,
      body: {
        model: input.model,
        ...(input.system === undefined ? {} : { system: input.system }),
        messages: [{ role: 'user', content: input.user }],
        max_tokens: budgetTokens === undefined
          ? input.maxOutputTokens
          : budgetTokens + input.maxOutputTokens,
        ...(input.temperature === undefined || budgetTokens !== undefined ? {} : { temperature: input.temperature }),
        ...(budgetTokens === undefined
          ? {}
          : { thinking: { type: 'enabled', budget_tokens: budgetTokens } }),
      },
    };
  }
  return {
    headers,
    body: {
      model: input.model,
      messages: [
        ...(input.system === undefined ? [] : [{ role: 'system', content: input.system }]),
        { role: 'user', content: input.user },
      ],
      max_tokens: input.maxOutputTokens,
      ...(input.temperature === undefined || input.thinkingDepth !== 'off' ? {} : { temperature: input.temperature }),
      ...(input.thinkingDepth === 'off' ? {} : { reasoning_effort: input.thinkingDepth }),
    },
  };
}

export function extractText(provider: LlmProviderType, body: unknown): string | null {
  const record = asRecord(body);
  if (record === null) return null;
  if (provider === 'anthropic') {
    if (!Array.isArray(record.content)) return null;
    for (const item of record.content) {
      const block = asRecord(item);
      if (block?.type !== 'text') continue;
      const text = normalizedString(block.text);
      if (text !== null) return text;
    }
    return null;
  }
  if (!Array.isArray(record.choices)) return null;
  for (const item of record.choices) {
    const choice = asRecord(item);
    const message = asRecord(choice?.message);
    const text = normalizedString(message?.content);
    if (text !== null) return text;
  }
  return null;
}

export function parseModelPage(body: unknown): { ids: string[]; nextUrl: string | null } {
  const record = asRecord(body);
  if (record === null) return { ids: [], nextUrl: null };
  const ids: string[] = [];
  const seen = new Set<string>();
  if (Array.isArray(record.data)) {
    for (const item of record.data) {
      const id = normalizedString(asRecord(item)?.id, 128);
      if (id !== null && !seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    }
  }
  const explicitNext = normalizedString(record.next) ?? normalizedString(record.next_page);
  if (explicitNext !== null) return { ids, nextUrl: explicitNext };
  const lastId = normalizedString(record.last_id, 128);
  return {
    ids,
    nextUrl: record.has_more === true && lastId !== null
      ? `?after_id=${encodeURIComponent(lastId)}`
      : null,
  };
}
