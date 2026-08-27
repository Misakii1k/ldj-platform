import { useState, type RefObject } from 'react';
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
  const [revealKey, setRevealKey] = useState(false);
  return (
    <section className="ai-quick-connect" aria-labelledby="ai-quick-connect-title">
      <div>
        <span className="ai-eyebrow">快速连接</span>
        <h3 id="ai-quick-connect-title">填写密钥，测试后启用</h3>
        <p>测试不会保存设置或发送对局数据。</p>
      </div>
      <label className="room-sheet__field" htmlFor="settings-api-key">
        <span>
          API Key
          {hasApiKey && <span className="ai-key-saved-tag">（已保存生效）</span>}
        </span>
        <span className="ai-key-input-wrap">
          <input
            id="settings-api-key"
            ref={inputRef}
            type={revealKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(event) => onApiKeyChange(event.target.value)}
            placeholder={hasApiKey ? '已安全保存，留空保持不变' : '本地模型可留空'}
            autoComplete="new-password"
            disabled={disabled}
          />
          <button
            type="button"
            className="ai-key-reveal"
            onClick={() => setRevealKey((current) => !current)}
            aria-label={revealKey ? '隐藏 API Key 明文' : '查看 API Key 明文'}
            aria-pressed={revealKey}
            title={revealKey ? '隐藏明文' : '查看明文'}
            disabled={disabled}
          >
            {/* 眼睛 / 眼睛加斜杠：纯内联 SVG，跟随 currentColor */}
            {revealKey ? (
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        </span>
        {hasApiKey && !apiKey && (
          <small className="ai-key-hint">
            ✓ 密钥已按当前预设保存在服务端（出于安全不回显原文；留空保存将保持已有密钥不变，输入新密钥可覆盖）。
          </small>
        )}
        {Boolean(apiKey) && (
          <small className="ai-key-hint ai-key-hint--pending">
            已输入新密钥，点击「保存并启用」或「测试连接」进行验证。
          </small>
        )}
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
