import type { LlmProviderType } from '@ldj/shared';
import type { AiDiagnosticState } from './aiSettingsState.ts';

interface AiEngineStatusProps {
  provider: LlmProviderType;
  model: string;
  hasApiKey: boolean;
  diagnostic: AiDiagnosticState;
}

const STATUS_LABELS: Record<AiDiagnosticState['status'], string> = {
  idle: '尚未诊断',
  testing: '正在诊断',
  success: '连接正常',
  stale: '配置已变化',
  error: '连接异常',
};

export function AiEngineStatus({ provider, model, hasApiKey, diagnostic }: AiEngineStatusProps) {
  return (
    <div className="ai-engine-status">
      <div className="ai-engine-status__headline">
        <span className={`ai-status-dot ai-status-dot--${diagnostic.status}`} aria-hidden="true" />
        <strong role="status" aria-live="polite" aria-atomic="true">{STATUS_LABELS[diagnostic.status]}</strong>
      </div>
      <dl>
        <div><dt>协议</dt><dd>{provider === 'anthropic' ? 'Anthropic' : 'OpenAI 兼容'}</dd></div>
        <div><dt>模型</dt><dd>{model.trim() || '未设置'}</dd></div>
        <div><dt>密钥</dt><dd>{hasApiKey ? '已保存' : '未保存'}</dd></div>
      </dl>
    </div>
  );
}
