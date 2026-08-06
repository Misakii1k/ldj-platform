import {
  parseAdjudicationClassification,
  type AdjudicationClassification,
  type AdjudicationProviderPayload,
  type LlmProviderType,
  type ThinkingDepth,
} from '@ldj/shared';
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

/**
 * D4-A2：白板猜词裁判系统提示词（隐私红线）。
 * 只包含判断职责、六类分类解释与严格 JSON 输出要求；
 * 不得包含 room/player/nickname/role/chat/ballot、密钥、请求头等任何上下文。
 */
export function buildAdjudicationSystemPrompt(): string {
  return [
    '你是白板猜词的外部裁判，负责判断玩家给出的答案是否与标准答案同义。',
    '你的输入只有标准答案与玩家答案两段文本，没有其他任何上下文信息。',
    '你必须只输出一个严格 JSON 对象：{"classification":"..."}，不得包含任何其他文字、注释或格式。',
    'classification 只能是以下六类之一，请选择最贴切的一类：',
    '1. equivalent：两段文本意思相同，可以互相替换；',
    '2. not_equivalent：两段文本意思不同；',
    '3. uncertain：信息不足，无法确定是否同义；',
    '4. provider_error：你的服务内部出现错误，无法完成判断；',
    '5. timeout：无法在规定时限内给出答复；',
    '6. invalid_response：输入异常、格式不对或不可用。',
    '除非确实无法判断，否则请直接给出结论，不要输出额外解释。',
  ].join('\n');
}

/**
 * D4-A2：裁判用户提示词（最小化）。
 * 只包含两个归一化文本与政策版本；主/备请求均从同一最小输入重新构造。
 */
export function buildAdjudicationUserPrompt(payload: AdjudicationProviderPayload): string {
  return `标准答案：${payload.normalizedStandardAnswer}\n玩家答案：${payload.normalizedGuess}\n裁决政策版本：${payload.adjudicationPolicyVersion}`;
}

/** 严格解析模型文本；只接受无额外字段的 JSON classification 对象。 */
export function parseAdjudicationResponse(value: unknown): AdjudicationClassification | null {
  if (typeof value !== 'string') return parseAdjudicationClassification(value);
  const text = value.trim();
  if (text === '') return null;
  try {
    return parseAdjudicationClassification(JSON.parse(text));
  } catch {
    return null;
  }
}
