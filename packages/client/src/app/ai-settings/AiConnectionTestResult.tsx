import type { AiDiagnosticState } from './aiSettingsState.ts';

interface AiConnectionTestResultProps {
  diagnostic: AiDiagnosticState;
}

export function AiConnectionTestResult({ diagnostic }: AiConnectionTestResultProps) {
  if (diagnostic.status === 'idle') return null;
  if (diagnostic.status === 'testing') {
    return <p className="ai-diagnostic ai-diagnostic--testing" role="status">正在发起最小模型调用…</p>;
  }
  if (diagnostic.status === 'stale') {
    return <p className="ai-diagnostic ai-diagnostic--stale" role="status">配置已变化，建议重新测试</p>;
  }
  if (diagnostic.status === 'success') {
    return (
      <p className="ai-diagnostic ai-diagnostic--success" role="status">
        连接正常 · {diagnostic.model} · {diagnostic.elapsedMs}ms
        {diagnostic.usedSavedApiKey ? ' · 使用已保存密钥' : ''}
      </p>
    );
  }
  return <p className="ai-diagnostic ai-diagnostic--error" role="alert">{diagnostic.message}</p>;
}
