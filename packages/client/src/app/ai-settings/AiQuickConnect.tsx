import type { RefObject } from 'react';
import type { AiDiagnosticState } from './aiSettingsState.ts';
import { AiConnectionTestResult } from './AiConnectionTestResult.tsx';

interface AiQuickConnectProps {
  apiKey: string;
  hasApiKey: boolean;
  disabled: boolean;
  saving: boolean;
  diagnostic: AiDiagnosticState;
  inputRef: RefObject<HTMLInputElement | null>;
  onApiKeyChange: (value: string) => void;
  onTest: () => void;
}

export function AiQuickConnect(props: AiQuickConnectProps) {
  const { apiKey, hasApiKey, disabled, saving, diagnostic, inputRef, onApiKeyChange, onTest } = props;
  return (
    <section className="ai-quick-connect" aria-labelledby="ai-quick-connect-title">
      <div>
        <span className="ai-eyebrow">快速连接</span>
        <h3 id="ai-quick-connect-title">填写密钥，测试后启用</h3>
        <p>测试不会保存设置或发送对局数据。</p>
      </div>
      <label className="room-sheet__field" htmlFor="settings-api-key">
        <span>API Key</span>
        <input
          id="settings-api-key"
          ref={inputRef}
          type="password"
          value={apiKey}
          onChange={(event) => onApiKeyChange(event.target.value)}
          placeholder={hasApiKey ? '已设置，留空保持不变' : '本地模型可留空'}
          autoComplete="new-password"
          disabled={disabled}
        />
      </label>
      <div className="ai-quick-connect__actions">
        <button type="button" className="ai-secondary-action" onClick={onTest} disabled={disabled || diagnostic.status === 'testing'}>
          {diagnostic.status === 'testing' ? '测试中…' : '测试连接'}
        </button>
        <button type="submit" className="room-sheet__submit" disabled={disabled || saving}>
          {saving ? '保存中…' : '保存并启用'}<span aria-hidden="true">→</span>
        </button>
      </div>
      <AiConnectionTestResult diagnostic={diagnostic} />
    </section>
  );
}
