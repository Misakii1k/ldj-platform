import { useState, useEffect, useMemo } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Wifi, Radio, ShieldAlert, CheckCircle2, Copy, HelpCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { useToast } from '../shared-ui/ToastContext.tsx';
import { buildApiUrl } from '../connection/serverAddress.ts';

interface NetworkStatusData {
  local: string;
  lan: string[];
  qrTarget: string;
  primaryType: 'hotspot' | 'wifi' | 'local_only';
  interfaces: Array<{
    interfaceName: string;
    address: string;
    type: 'hotspot' | 'wifi' | 'ethernet' | 'other';
  }>;
  onlineClientCount: number;
}

interface SmartNetworkGuideProps {
  inviteUrl: string;
  roomCode: string;
}

export function SmartNetworkGuide({ inviteUrl, roomCode }: SmartNetworkGuideProps) {
  const { showToast } = useToast();
  const [netData, setNetData] = useState<NetworkStatusData | null>(null);
  const [activeTab, setActiveTab] = useState<'game' | 'hotspot'>('game');
  const [showApHelp, setShowApHelp] = useState(false);
  
  // 热点配网自定义参数
  const [hotspotSsid, setHotspotSsid] = useState('桌游主机热点');
  const [hotspotPassword, setHotspotPassword] = useState('');

  // 确保局域网二维码与分享链接优先使用真实局域网 IP（避免 127.0.0.1 导致外机无法访问）
  const effectiveInviteUrl = useMemo(() => {
    const targetBase = netData?.qrTarget || (netData?.lan?.[0] ? `http://${netData.lan[0]}:8080` : null);
    if (!targetBase) return inviteUrl;
    try {
      const parsed = new URL(inviteUrl);
      if (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost' || parsed.hostname === '0.0.0.0') {
        const target = new URL(targetBase);
        parsed.protocol = target.protocol;
        parsed.hostname = target.hostname;
        parsed.port = target.port;
        return parsed.toString();
      }
    } catch {
      // ignore
    }
    return inviteUrl;
  }, [inviteUrl, netData]);

  useEffect(() => {
    let cancelled = false;
    async function fetchStatus() {
      try {
        const netRes = await fetch(buildApiUrl('/api/network/status'));
        if (netRes.ok && !cancelled) {
          const data = await netRes.json() as NetworkStatusData;
          setNetData(data);
          if (data.primaryType === 'hotspot') {
            setHotspotSsid('主机热点');
          }
        }
      } catch {
        // 本地单机/离线环境容错
      }
    }
    void fetchStatus();
    const interval = setInterval(() => void fetchStatus(), 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  async function copyText(text: string, label: string) {
    await navigator.clipboard?.writeText(text);
    showToast(`${label}已复制`, 'success');
  }

  // 生成标准的 Wi-Fi 配网二维码字符串 (WIFI:T:WPA;S:ssid;P:password;;)
  const wifiQrValue = hotspotPassword
    ? `WIFI:T:WPA;S:${hotspotSsid};P:${hotspotPassword};;`
    : `WIFI:T:nopass;S:${hotspotSsid};;`;

  const isHotspot = netData?.primaryType === 'hotspot';
  const hasClients = (netData?.onlineClientCount ?? 0) > 1;

  return (
    <div className="smart-network-guide">
      {/* 状态指示条 */}
      <div className="smart-network-guide__badge-row">
        <div className={`smart-network-badge ${isHotspot ? 'is-hotspot' : 'is-wifi'}`}>
          {isHotspot ? (
            <>
              <Radio size={14} className="smart-network-badge__icon" />
              <span>手机热点</span>
            </>
          ) : (
            <>
              <Wifi size={14} className="smart-network-badge__icon" />
              <span>局域网 Wi-Fi</span>
            </>
          )}
        </div>

        {hasClients ? (
          <div className="smart-network-badge is-success">
            <CheckCircle2 size={13} />
            <span>{netData?.onlineClientCount} 台设备在席</span>
          </div>
        ) : (
          <button
            type="button"
            className="smart-network-badge is-notice"
            onClick={() => setShowApHelp(!showApHelp)}
            title="查看局域网连接排查说明"
          >
            <HelpCircle size={13} />
            <span>连接排查</span>
          </button>
        )}
      </div>

      {/* 选项卡切换 */}
      <div className="smart-network-tabs">
        <button
          type="button"
          className={`smart-network-tab ${activeTab === 'game' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('game')}
        >
          局域网扫码
        </button>
        <button
          type="button"
          className={`smart-network-tab ${activeTab === 'hotspot' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('hotspot')}
        >
          连接热点
        </button>
      </div>

      {/* 选项卡内容 1: 局域网进房码 */}
      {activeTab === 'game' && (
        <div className="smart-network-card__content">
          <div className="smart-network-qr-wrapper">
            <QRCodeSVG
              value={effectiveInviteUrl}
              size={136}
              className="smart-network-qr"
              role="img"
              aria-label="扫码直达本房间加入页"
            />
          </div>
          <div className="smart-network-info">
            <div className="smart-network-code-row">
              <span className="smart-network-label">房间号：</span>
              <strong className="smart-network-code">{roomCode}</strong>
              <button
                type="button"
                className="smart-network-copy-btn"
                onClick={() => void copyText(roomCode, '房间号')}
              >
                <Copy size={13} /> 复制
              </button>
            </div>
            <p className="smart-network-hint">
              现场同 Wi-Fi 或热点玩家，使用手机相机或微信扫码即玩。
            </p>
            <button
              type="button"
              className="smart-network-url-btn"
              onClick={() => void copyText(effectiveInviteUrl, '局域网链接')}
            >
              复制局域网链接
            </button>
          </div>
        </div>
      )}

      {/* 选项卡内容 2: 连热点码 */}
      {activeTab === 'hotspot' && (
        <div className="smart-network-card__content">
          <div className="smart-network-qr-wrapper">
            <QRCodeSVG
              value={wifiQrValue}
              size={136}
              className="smart-network-qr"
              role="img"
              aria-label="一键连 Wi-Fi 二维码"
            />
          </div>
          <div className="smart-network-info">
            <p className="smart-network-hint" style={{ marginTop: 0 }}>
              使用系统相机扫描二维码，可以直接连接房主设置的 Wi-Fi 或热点。
            </p>
            <div className="smart-network-form-row">
              <label>热点名：</label>
              <input
                type="text"
                value={hotspotSsid}
                onChange={(e) => setHotspotSsid(e.target.value)}
                placeholder="输入热点名称"
                className="smart-network-input"
              />
            </div>
            <div className="smart-network-form-row">
              <label>密 码：</label>
              <input
                type="text"
                value={hotspotPassword}
                onChange={(e) => setHotspotPassword(e.target.value)}
                placeholder="无密码留空"
                className="smart-network-input"
              />
            </div>
          </div>
        </div>
      )}

      {/* AP 隔离与排查折叠向导 */}
      <div className="smart-network-ap-section">
        <button
          type="button"
          className="smart-network-ap-toggle"
          onClick={() => setShowApHelp(!showApHelp)}
        >
          <div className="smart-network-ap-title">
            <ShieldAlert size={14} color="#d97706" />
            <span>连接问题排查（AP 隔离处理）</span>
          </div>
          {showApHelp ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {showApHelp && (
          <div className="smart-network-ap-content">
            <p>商场、餐厅或酒店等公共 Wi-Fi 通常开启了 AP 隔离，会限制同一网络下的设备相互访问。</p>
            <div className="smart-network-ap-solution">
              <p><strong>建议改用手机热点：</strong></p>
              <ol>
                <li>房主手机开启个人热点；</li>
                <li>其他玩家连接该热点（也可切换到上方“连接热点”直接扫码）；</li>
                <li>连接后再扫描进房二维码。局域网对局只在本地设备之间传输数据，不消耗手机流量。</li>
              </ol>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
