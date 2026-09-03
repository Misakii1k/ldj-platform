import { useState, useEffect } from 'react';
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

  useEffect(() => {
    let cancelled = false;
    async function fetchStatus() {
      try {
        const res = await fetch(buildApiUrl('/api/network/status'));
        if (res.ok && !cancelled) {
          const data = await res.json() as NetworkStatusData;
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
    const interval = setInterval(() => void fetchStatus(), 6000);
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
              <span>手机热点 0 流量模式</span>
            </>
          ) : (
            <>
              <Wifi size={14} className="smart-network-badge__icon" />
              <span>局域网 Wi-Fi 模式</span>
            </>
          )}
        </div>

        {hasClients ? (
          <div className="smart-network-badge is-success">
            <CheckCircle2 size={13} />
            <span>局域网已连通 ({netData?.onlineClientCount} 台设备)</span>
          </div>
        ) : (
          <button
            type="button"
            className="smart-network-badge is-notice"
            onClick={() => setShowApHelp(!showApHelp)}
            title="查看连接排查指引"
          >
            <HelpCircle size={13} />
            <span>连不上？防隔离排查</span>
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
          1. 扫码进房（免装APP）
        </button>
        <button
          type="button"
          className={`smart-network-tab ${activeTab === 'hotspot' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('hotspot')}
        >
          2. 一键连热点/Wi-Fi
        </button>
      </div>

      {/* 选项卡内容 1: 进房码 */}
      {activeTab === 'game' && (
        <div className="smart-network-card__content">
          <div className="smart-network-qr-wrapper">
            <QRCodeSVG
              value={inviteUrl}
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
              朋友手机连接同一 Wi-Fi 或房主热点后，使用自带<strong>相机 / 浏览器扫一扫</strong>即可直接进房，<strong>无需下载任何 APP</strong>！
            </p>
            <button
              type="button"
              className="smart-network-url-btn"
              onClick={() => void copyText(inviteUrl, '邀请链接')}
            >
              复制网页链接
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
              朋友使用系统相机扫此码可<strong>一键直连热点/Wi-Fi</strong>，免去手动输密码：
            </p>
            <div className="smart-network-form-row">
              <label>热点名：</label>
              <input
                type="text"
                value={hotspotSsid}
                onChange={(e) => setHotspotSsid(e.target.value)}
                placeholder="输入你的热点名"
                className="smart-network-input"
              />
            </div>
            <div className="smart-network-form-row">
              <label>密 码：</label>
              <input
                type="text"
                value={hotspotPassword}
                onChange={(e) => setHotspotPassword(e.target.value)}
                placeholder="无密码可留空"
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
            <span>公共 Wi-Fi 打不开？AP 隔离 100% 解决指南</span>
          </div>
          {showApHelp ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {showApHelp && (
          <div className="smart-network-ap-content">
            <p><strong>为什么在商场/酒店/咖啡馆 Wi-Fi 朋友扫码打不开？</strong></p>
            <p>公共 Wi-Fi 通常开启了【AP 隔离保护】，阻止连接同 Wi-Fi 的手机互相通信。</p>
            <div className="smart-network-ap-solution">
              <p><strong>推荐畅玩方案（0 流量消耗）：</strong></p>
              <ol>
                <li>房主手机开启【个人热点】；</li>
                <li>朋友连接房主热点（或扫上方「一键连热点」码）；</li>
                <li>连接后朋友扫「进房码」，局域网传输 <strong>不耗费房主任何手机流量</strong>！</li>
              </ol>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
