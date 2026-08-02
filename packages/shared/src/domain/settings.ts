export const LLM_PROVIDER_TYPES = ['openai', 'anthropic'] as const;
export type LlmProviderType = (typeof LLM_PROVIDER_TYPES)[number];

export const THINKING_DEPTH_OPTIONS = [
  { value: 'off', label: '关闭 (不开启思考)' },
  { value: 'low', label: '低深度 (Low / 1024 tokens)' },
  { value: 'medium', label: '中深度 (Medium / 2048 tokens)' },
  { value: 'high', label: '高深度 (High / 4096 tokens)' },
  { value: 'max', label: '最大深度 (Max / Anthropic 8192 tokens)' },
] as const;

export type ThinkingDepth = (typeof THINKING_DEPTH_OPTIONS)[number]['value'];

export interface LlmProfileSummary {
  id: string;
  name: string;
  provider: LlmProviderType;
  baseUrl: string;
  model: string;
  thinkingDepth: ThinkingDepth;
  timeoutMs: number;
  hasApiKey: boolean;
}

export interface LlmSettingsView {
  provider: LlmProviderType;
  baseUrl: string | null;
  model: string;
  thinkingDepth: ThinkingDepth;
  timeoutMs: number;
  hasApiKey: boolean;
  fromEnv: boolean;
  profiles: LlmProfileSummary[];
  activeProfileId: string | null;
}

export interface LlmSettingsPatch {
  provider?: LlmProviderType;
  baseUrl?: string | null;
  apiKey?: string | null;
  model?: string;
  thinkingDepth?: ThinkingDepth;
  timeoutMs?: number;
  profilesJson?: string | null;
  activeProfileId?: string | null;
}
