/**
 * 主机模式控制台（仅原生 APP）：
 * 一键启动内嵌服务器 → 轮询就绪 → 展示入口地址/二维码与热点引导 → 进入大厅。
 * 「进入大厅」通过 setRuntimeServerBase 把连接层指向 127.0.0.1 后交回正常应用流程。
 */
import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Play, Square, Radio, Wifi, Loader2, CheckCircle2, Settings, LogIn } from 'lucide-react';
import { HostServer } from './hostServer.ts';
import { setRuntimeServerBase } from '../connection/serverAddress.ts';

interface NetStatusLite {
  local: string;
  lan: string[];
  qrTarget: string;
  primaryType: 'hotspot' | 'wifi' | 'local_only';
  onlineClientCount: number;
}

const POLL_MS = 1500;

export function HostConsole() {
  const [phase, setPhase] = useState<'starting' | 'running' | 'error'>('starting');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [netStatus, setNetStatus] = useState<NetStatusLite | null>(null);
  const [port, setPort] = useState<number>(8080);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!startedRef.current) {
      startedRef.current = true;
      HostServer.start().catch((err: unknown) => {
        setPhase('error');
        setErrorMsg(err instanceof Error ? err.message : String(err));
      });
    }

    let alive = true;
    async function poll() {
      try {
        const { boot } = await HostServer.bootInfo();
        if (!alive) return;
        if (boot?.port && boot.port !== port) setPort(boot.port);
        const res = await fetch(`http://127.0.0.1:${boot?.port ?? port}/api/network/status`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as NetStatusLite;
        if (!alive) return;
        setNetStatus(data);
        setPhase('running');
      } catch {
        // 服务未就绪，继续轮询
      }
    }
    void poll();
    const timer = setInterval(() => void poll(), POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  function enterLobby() {
    setRuntimeServerBase(`http://127.0.0.1:${port}`);
  }

  async function toggleServer() {
    if (phase === 'running') {
      await HostServer.stop();
      setNetStatus(null);
      setPhase('starting');
      // 重启服务（保持轮询自动发现）
      void HostServer.start().catch(() => setPhase('error'));
    } else {
      setPhase('starting');
      await HostServer.start().catch((err: unknown) => {
        setPhase('error');
        setErrorMsg(err instanceof Error ? err.message : String(err));
      });
    }
  }

  const isHotspot = netStatus?.primaryType === 'hotspot';

  return (
    <main className="host-console">
      <div className="host-console__content">
        <header className="host-console__head">
          <span className="host-console__tile" aria-hidden="true">聚</span>
          <div>
            <h1 className="host-console__title">主机模式</h1>
            <p className="host-console__subtitle">这台设备就是游戏服务器，局域网内免服务器直连</p>
          </div>
        </header>

        <section className={`host-status-card is-${phase}`} aria-live="polite">
          <div className="host-status-card__row">
            {phase === 'starting' && <Loader2 size={18} className="host-spin" aria-hidden="true" />}
            {phase === 'running' && <CheckCircle2 size={18} aria-hidden="true" />}
            {phase === 'error' && <Settings size={18} aria-hidden="true" />}
            <strong>
              {phase === 'starting' && '正在启动内嵌服务器…'}
              {phase === 'running' && `服务器运行中 · 端口 ${port}`}
              {phase === 'error' && `启动失败：${errorMsg ?? '未知错误'}`}
            </strong>
          </div>
          <button
            type="button"
            className="text-btn host-status-card__action"
            onClick={() => void toggleServer()}
          >
            {phase === 'running'
              ? (<><Square size={13} aria-hidden="true" /> 停止并重启</>)
              : (<><Play size={13} aria-hidden="true" /> 启动服务器</>)}
          </button>
        </section>

        {phase === 'running' && (
          <>
            <section className="host-net-card">
              <div className={`smart-network-badge ${isHotspot ? 'is-hotspot' : 'is-wifi'}`}>
                {isHotspot
                  ? (<><Radio size={14} aria-hidden="true" /> 手机热点 0 流量模式</>)
                  : (<><Wifi size={14} aria-hidden="true" /> 局域网 Wi-Fi 模式</>)}
              </div>
              {!isHotspot && (
                <button
                  type="button"
                  className="text-btn"
                  onClick={() => void HostServer.openNetworkSettings()}
                >
                  开热点更稳（0 流量）→ 跳转设置
                </button>
              )}
            </section>

            <section className="host-qr-card" aria-label="玩家扫码加入">
              {netStatus && (
                <>
                  <QRCodeSVG value={netStatus.qrTarget} size={148} className="host-qr" role="img" aria-label="入口地址二维码" />
                  <p className="host-qr-hint">朋友连同一 Wi-Fi / 热点后，相机扫码或浏览器打开即可进房</p>
                  <code className="host-qr-url">{netStatus.qrTarget}</code>
                  {(netStatus.onlineClientCount ?? 0) > 0 && (
                    <p className="host-online">已有 {netStatus.onlineClientCount} 台设备连接</p>
                  )}
                </>
              )}
            </section>

            <button type="button" className="primary-btn host-enter-btn" onClick={enterLobby}>
              <LogIn size={16} aria-hidden="true" /> 进入大厅（本机开房）
            </button>
          </>
        )}
      </div>
    </main>
  );
}
