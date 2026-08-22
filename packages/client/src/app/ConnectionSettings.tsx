/**
 * 连接主机设置：自动发现（mDNS）+ 扫码 + 手动输入 + 最近主机记忆。
 * 门控页与平台设置弹层共用；保存即切换连接目标（自动重连由连接层负责）。
 */
import { useEffect, useState } from 'react';
import { Server, Clock3, Radar, ScanLine } from 'lucide-react';
import {
  getManualServerBase,
  normalizeServerBase,
  setManualServerBase,
} from '../connection/serverAddress.ts';
import { getRecentHosts, rememberRecentHost } from './appMode.ts';
import { isNativeApp } from './nativePlatform.ts';
import { NsdDiscovery, type NsdService } from './nsdDiscovery.ts';
import { ScanToConnect } from './ScanToConnect.tsx';

interface ConnectionSettingsProps {
  /** 保存成功后的回调（门控页用它关闭自身） */
  onSaved?: () => void;
  submitLabel?: string;
}

export function ConnectionSettings({ onSaved, submitLabel = '连接该主机' }: ConnectionSettingsProps) {
  const [address, setAddress] = useState<string>(() => getManualServerBase() ?? '');
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [discovered, setDiscovered] = useState<NsdService[]>([]);
  const recentHosts = getRecentHosts();
  const native = isNativeApp();

  // 原生 APP：mDNS 自动发现局域网内主机
  useEffect(() => {
    if (!native) return;
    let stopped = false;
    void NsdDiscovery.discover().catch(() => {
      // 设备不支持 NSD 时静默，手动/扫码仍可用
    });
    const timer = setInterval(() => {
      void NsdDiscovery.list()
        .then(({ services }) => {
          if (!stopped) setDiscovered(services);
        })
        .catch(() => {
          // 忽略
        });
    }, 2000);
    return () => {
      stopped = true;
      clearInterval(timer);
      void NsdDiscovery.stop().catch(() => {
        // 忽略
      });
    };
  }, [native]);

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
      {native && discovered.length > 0 && (
        <div className="connection-settings__recent">
          <p className="connection-settings__recent-title">
            <Radar size={13} aria-hidden="true" /> 局域网发现的主机
          </p>
          <div className="connection-settings__recent-list">
            {discovered.map((svc) => {
              const base = `http://${svc.host}:${svc.port}`;
              return (
                <button
                  key={`${svc.host}:${svc.port}`}
                  type="button"
                  className={`connection-chip ${base === address.trim() ? 'is-active' : ''}`}
                  onClick={() => {
                    setAddress(base);
                    save(base);
                  }}
                >
                  {base.replace(/^https?:\/\//, '')}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <label className="connection-settings__field">
        <span className="connection-settings__label"><Server size={14} aria-hidden="true" /> 主机地址</span>
        <div className="connection-settings__input-row">
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
          <button
            type="button"
            className="connection-settings__scan-btn"
            onClick={() => setScanning(true)}
            aria-label="扫码识别主机地址"
            title="扫码识别"
          >
            <ScanLine size={18} aria-hidden="true" />
          </button>
        </div>
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

      {scanning && (
        <ScanToConnect
          onClose={() => setScanning(false)}
          onScanned={(base) => {
            setScanning(false);
            setAddress(base);
            save(base);
          }}
        />
      )}
    </div>
  );
}
