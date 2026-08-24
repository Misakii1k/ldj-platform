/**
 * 主机模式控制台（仅原生 APP）：
 * 一键启动内嵌服务器 → 轮询就绪 → 展示入口地址/二维码与热点引导 → 进入大厅。
 * 「进入大厅」通过 setRuntimeServerBase 把连接层指向 127.0.0.1 后交回正常应用流程。
 *
 * 多候选地址：当探测到多个网卡（如同时有 Wi-Fi 缓存 IP + 热点 IP）时，
 * 二维码下方列出全部候选，操作者可手动切换 qrTarget，
 * 避免自动选中过期的 Wi-Fi 网卡 IP 导致玩家扫码连不上。
 */
import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Play, RotateCcw, Radio, Wifi, Loader2, CheckCircle2, Settings, LogIn } from 'lucide-react';
import { HostServer, type NativeLanAddress } from './hostServer.ts';
import { setRuntimeServerBase, setShareServerBase } from '../connection/serverAddress.ts';
import { useAppMode } from './AppModeContext.tsx';

interface NetStatusLite {
  local: string;
  lan: string[];
  qrTarget: string;
  primaryType: 'hotspot' | 'wifi' | 'local_only';
  onlineClientCount: number;
}

const POLL_MS = 1500;

export function HostConsole() {
  const { backToModeSelection } = useAppMode();
  const [phase, setPhase] = useState<'starting' | 'running' | 'error'>('starting');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [netStatus, setNetStatus] = useState<NetStatusLite | null>(null);
  const [port, setPort] = useState<number>(8080);
  /** 合并去重后的全部候选地址（含原生层补充的网卡 IP） */
  const [candidates, setCandidates] = useState<string[]>([]);
  /** 当前选中作为二维码展示的地址（默认跟随 qrTarget，操作者可手动切换） */
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [nativeAddrs, setNativeAddrs] = useState<NativeLanAddress[]>([]);
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

        // 原生层补充网卡探测：合并 node 与 Java 视角，去重，给出真实候选列表
        let extras: NativeLanAddress[] = [];
        try {
          const { addresses } = await HostServer.lanAddresses();
          extras = addresses ?? [];
        } catch {
          // 老版本插件无此方法；忽略
        }
        if (!alive) return;
        setNativeAddrs(extras);

        const extraUrls = extras.map((a) => `http://${a.address}:${boot?.port ?? port}`);
        const merged = Array.from(new Set([...(data.lan ?? []), ...extraUrls]));
        setCandidates(merged);
        // 自动跟随服务端推荐的 qrTarget；操作者手动改过则尊重其选择
        setSelectedUrl((prev) => prev ?? data.qrTarget);
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
    // 分享地址必须 LAN 可达：优先操作者当前选中的二维码地址/服务端推荐 qrTarget；
    // 本机 WebView 直连内嵌服务器仍用回环地址（两者分开记录，见 serverAddress.ts）
    setShareServerBase(selectedUrl ?? netStatus?.qrTarget ?? null);
    setRuntimeServerBase(`http://127.0.0.1:${port}`);
  }

  async function toggleServer() {
    if (phase === 'running') {
      await HostServer.stop();
      setNetStatus(null);
      setPhase('starting');
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
  const qrUrl = selectedUrl ?? netStatus?.qrTarget ?? `http://127.0.0.1:${port}`;
  const multiCandidate = candidates.length > 1;

  return (
    <main className="host-console">
      <div className="host-console__content">
        <header className="host-console__head">
          <div className="home-brand" aria-label="聚乐桌">
            <span className="home-brand__tile" aria-hidden="true">聚</span>
            <div>
              <span className="home-brand__name">聚乐桌</span>
              <span className="host-console__badge">主机模式</span>
            </div>
          </div>
          <button type="button" className="host-console__switch" onClick={backToModeSelection}>
            切换身份
          </button>
        </header>

        <section className={`host-status-card is-${phase}`} aria-live="polite">
          <div className="host-status-card__row">
            {phase === 'starting' && <Loader2 size={20} className="host-spin" aria-hidden="true" />}
            {phase === 'running' && <span className="host-status-dot" aria-hidden="true" />}
            {phase === 'error' && <Settings size={20} aria-hidden="true" />}
            <div>
              <strong>
                {phase === 'starting' && '正在启动内嵌游戏服务器…'}
                {phase === 'running' && `内嵌服务器运行中 · 端口 ${port}`}
                {phase === 'error' && `启动失败：${errorMsg ?? '未知错误'}`}
              </strong>
              <p className="host-status-card__sub">
                {phase === 'running' ? '本机已具备局域网联机服务能力，局域网玩家可直连' : '正在初始化本地网络环境'}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="host-status-card__action"
            onClick={() => void toggleServer()}
          >
            {phase === 'running'
              ? (<><RotateCcw size={13} aria-hidden="true" /> 停止并重启</>)
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
                  className="host-net-card__link"
                  onClick={() => void HostServer.openNetworkSettings()}
                >
                  开热点更稳（0 流量）→ 跳转设置
                </button>
              )}
            </section>

            <section className="host-qr-card" aria-label="玩家扫码加入">
              <div className="host-qr-frame">
                <QRCodeSVG value={qrUrl} size={156} className="host-qr" role="img" aria-label="入口地址二维码" />
              </div>
              <p className="host-qr-hint">朋友连同 Wi-Fi / 热点后，手机相机扫码或浏览器打开即可进房：</p>
              <div className="host-qr-url-row">
                <code className="host-qr-url">{qrUrl}</code>
              </div>

              {multiCandidate && (
                <div className="host-qr-candidates" role="group" aria-label="选择入口地址">
                  <p className="host-qr-candidates__hint">
                    检测到多个网卡地址，若玩家扫码连不上请切换其它地址：
                  </p>
                  <div className="host-qr-candidates__list">
                    {candidates.map((url) => (
                      <button
                        key={url}
                        type="button"
                        className={`text-btn host-qr-candidate ${url === qrUrl ? 'is-active' : ''}`}
                        onClick={() => setSelectedUrl(url)}
                      >
                        {url}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {candidates.length === 0 && (
                <p className="host-qr-warn">
                  未检测到局域网地址。请确认热点已开启或 Wi-Fi 已连接，再点「停止并重启」。
                </p>
              )}

              {(netStatus?.onlineClientCount ?? 0) > 0 && (
                <p className="host-online">已有 <strong>{netStatus?.onlineClientCount}</strong> 台设备在线连接</p>
              )}
            </section>

            <button type="button" className="primary-btn host-enter-btn" onClick={enterLobby}>
              <LogIn size={18} aria-hidden="true" /> 进入大厅（本机开房）
            </button>
          </>
        )}
      </div>
    </main>
  );
}
