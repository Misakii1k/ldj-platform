/**
 * 连接主机设置：手动输入地址 + 最近主机记忆。
 * 门控页与平台设置弹层共用；保存即切换连接目标（自动重连由连接层负责）。
 */
import { useState } from 'react';
import { Server, Clock3 } from 'lucide-react';
import {
  getManualServerBase,
  normalizeServerBase,
  setManualServerBase,
} from '../connection/serverAddress.ts';
import { getRecentHosts, rememberRecentHost } from './appMode.ts';

interface ConnectionSettingsProps {
  /** 保存成功后的回调（门控页用它关闭自身） */
  onSaved?: () => void;
  submitLabel?: string;
}

export function ConnectionSettings({ onSaved, submitLabel = '连接该主机' }: ConnectionSettingsProps) {
  const [address, setAddress] = useState<string>(() => getManualServerBase() ?? '');
  const [error, setError] = useState<string | null>(null);
  const recentHosts = getRecentHosts();

  function save(raw: string) {
    const normalized = normalizeServerBase(raw);
    if (normalized === null) {
      setError('地址格式应为 主机IP:端口，例如 192.168.1.5:8080');
      return;
    }
    setManualServerBase(normalized);
    rememberRecentHost(normalized);
    setError(null);
    onSaved?.();
  }

  return (
    <div className="connection-settings">
      <label className="connection-settings__field">
        <span className="connection-settings__label"><Server size={14} aria-hidden="true" /> 主机地址</span>
        <input
          type="text"
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="例如 192.168.1.5:8080"
          className="connection-settings__input"
        />
      </label>
      {error !== null && <p className="connection-settings__error" role="alert">{error}</p>}
      <button type="button" className="primary-btn connection-settings__submit" onClick={() => save(address)}>
        {submitLabel}
      </button>

      {recentHosts.length > 0 && (
        <div className="connection-settings__recent">
          <p className="connection-settings__recent-title"><Clock3 size={13} aria-hidden="true" /> 最近连接</p>
          <div className="connection-settings__recent-list">
            {recentHosts.map((host) => (
              <button
                key={host}
                type="button"
                className={`connection-chip ${host === address.trim() ? 'is-active' : ''}`}
                onClick={() => {
                  setAddress(host);
                  save(host);
                }}
              >
                {host.replace(/^https?:\/\//, '')}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
