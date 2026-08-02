import type { LlmProfileSummary, LlmProviderType, ThinkingDepth } from '@ldj/shared';
import type { AiDiagnosticState } from './aiSettingsState.ts';

export interface ApiProfile extends Omit<LlmProfileSummary, 'hasApiKey'> {
  apiKey?: string;
  hasApiKey?: boolean;
  builtIn?: boolean;
}

export interface AiFieldState {
  provider: LlmProviderType;
  baseUrl: string;
  apiKey: string;
  model: string;
  thinkingDepth: ThinkingDepth;
  timeoutMs: string;
  hasApiKey: boolean;
  clearApiKey: boolean;
  fromEnv: boolean;
}

export interface AiBusyState {
  loading: boolean;
  saving: boolean;
  testing: boolean;
  fetchingModels: boolean;
}

export interface DiagnosticProps {
  diagnostic: AiDiagnosticState;
}
