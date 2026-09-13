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
import { Play, RotateCcw, Radio, Wifi, Loader2, Settings, LogIn, Monitor, Users, Copy, Check, ArrowLeft } from 'lucide-react';
import { HostServer, isLocalhostOrigin, type NativeLanAddress } from './hostServer.ts';
import { setRuntimeServerBase, setShareServerBase } from '../connection/serverAddress.ts';
import { isNativeApp } from './nativePlatform.ts';
import { saveAppMode, getSavedAppMode } from './appMode.ts';
import { useAppMode } from './AppModeContext.tsx';

interface NetStatusLite {
  local: string;
  lan: string[];
  qrTarget: string;
  primaryType: 'hotspot' | 'wifi' | 'local_only';
  onlineClientCount: number;
}

export interface HostConsoleProps {
  onExit?: (mode: 'table' | 'player') => void;
  canClose?: boolean;
}

const POLL_MS = 1500;

export function HostConsole({ onExit, canClose }: HostConsoleProps = {}) {
  const { backToModeSelection } = useAppMode();
  const isPc = !isNativeApp() && isLocalhostOrigin();
  const [phase, setPhase] = useState<'starting' | 'running' | 'error'>('starting');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [netStatus, setNetStatus] = useState<NetStatusLite | null>(null);
  const [port, setPort] = useState<number>(() => {
    if (typeof window !== 'undefined' && window.location.port) {
      return Number(window.location.port) || 8080;
    }
    return 8080;
  });
  /** 合并去重后的全部候选地址（含原生层补充的网卡 IP） */
  const [candidates, setCandidates] = useState<string[]>([]);
  /** 当前选中作为二维码展示的地址（默认跟随 qrTarget，操作者可手动切换） */
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [nativeAddrs, setNativeAddrs] = useState<NativeLanAddress[]>([]);
  const [copied, setCopied] = useState(false);
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
        const currentPort = boot?.port ?? port;
        if (boot?.port && boot.port !== port) setPort(boot.port);

        const statusEndpoint = isNativeApp()
          ? `http://127.0.0.1:${currentPort}/api/network/status`
          : `/api/network/status`;
        const res = await fetch(statusEndpoint);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as NetStatusLite;
        if (!alive) return;
        setNetStatus(data);
        setPhase('running');

        // 原生层或服务端补充网卡探测：合并视角，去重，给出真实候选列表
        let extras: NativeLanAddress[] = [];
        try {
          const { addresses } = await HostServer.lanAddresses();
          extras = addresses ?? [];
        } catch {
          // 忽略
        }
        if (!alive) return;
        setNativeAddrs(extras);

        const extraUrls = extras.map((a) => `http://${a.address}:${currentPort}`);
        const merged = Array.from(new Set([...(data.lan ?? []), ...extraUrls]));
        setCandidates(merged);
        // 自动跟随服务端推荐的 qrTarget；操作者手动改过则尊重其选择
        setSelectedUrl((prev) => prev ?? data.qrTarget ?? (merged[0] || `http://127.0.0.1:${currentPort}`));
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
  }, [port]);

  function enterLobby(targetRole: 'table' | 'player' = 'table') {
    // 分享地址必须 LAN 可达：优先操作者当前选中的二维码地址/服务端推荐 qrTarget；
    // 本机直连内嵌服务器仍用回环地址（两者分开记录，见 serverAddress.ts）
    const shareBase = selectedUrl ?? netStatus?.qrTarget ?? (candidates[0] || null);
    setShareServerBase(shareBase);
    setRuntimeServerBase(`http://127.0.0.1:${port}`);
    saveAppMode(targetRole);
    if (onExit) {
      onExit(targetRole);
    }
  }

  async function copyQrUrl() {
    if (!qrUrl) return;
    try {
      await navigator.clipboard.writeText(qrUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 剪贴板异常静默降级
    }
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
          <div className="home-brand" aria-label="聚乐桌游">
            <span className="home-brand__tile" aria-hidden="true">
              <img src="/icon-192.png" alt="" className="home-brand__img" />
            </span>
            <div>
              <span className="home-brand__name">聚乐桌游</span>
              <span className="host-console__badge">{isPc ? '电脑主机大屏' : '主机模式'}</span>
            </div>
          </div>
          {isNativeApp() ? (
            <button type="button" className="host-console__switch" onClick={backToModeSelection}>
              切换身份
            </button>
          ) : canClose ? (
            <button
              type="button"
              className="host-console__switch host-console__switch--return"
              onClick={() => {
                const saved = getSavedAppMode();
                onExit?.(saved === 'player' ? 'player' : 'table');
              }}
              title="返回大厅"
            >
              <ArrowLeft size={15} aria-hidden="true" />
              <span>返回大厅</span>
            </button>
          ) : null}
        </header>

        <div className="host-console__grid">
          {/* 左侧/上半部：状态与控制 */}
          <div className="host-console__col host-console__col--status">
            <section className={`host-status-card is-${phase}`} aria-live="polite">
              <div className="host-status-card__row">
                {phase === 'starting' && <Loader2 size={20} className="host-spin" aria-hidden="true" />}
                {phase === 'running' && <span className="host-status-dot" aria-hidden="true" />}
                {phase === 'error' && <Settings size={20} aria-hidden="true" />}
                <div>
                  <strong>
                    {phase === 'starting' && '正在初始化游戏服务器…'}
                    {phase === 'running' && `游戏服务器运行中 · 端口 ${port}`}
                    {phase === 'error' && `启动失败：${errorMsg ?? '未知错误'}`}
                  </strong>
                  <p className="host-status-card__sub">
                    {phase === 'running'
                      ? (isPc ? '本机已开启局域网服务器，同局域网设备免下载直接加入' : '本机已具备局域网联机服务能力，局域网玩家可直连')
                      : '正在初始化本地网络服务'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="host-status-card__action"
                onClick={() => void toggleServer()}
              >
                {phase === 'running'
                  ? (<><RotateCcw size={13} aria-hidden="true" /> 重启服务</>)
                  : (<><Play size={13} aria-hidden="true" /> 启动服务</>)}
              </button>
            </section>

            {phase === 'running' && (
              <>
                <section className="host-net-card">
                  <div className={`smart-network-badge ${isHotspot ? 'is-hotspot' : 'is-wifi'}`}>
                    {isHotspot
                      ? (<><Radio size={14} aria-hidden="true" /> 热点 0 流量直连模式</>)
                      : (<><Wifi size={14} aria-hidden="true" /> 局域网 Wi-Fi 模式</>)}
                  </div>
                  {isNativeApp() && !isHotspot && (
                    <button
                      type="button"
                      className="host-net-card__link"
                      onClick={() => void HostServer.openNetworkSettings()}
                    >
                      开热点更稳（0 流量）→ 跳转设置
                    </button>
                  )}
                  {isPc && (
                    <span className="host-net-card__tip">
                      {isHotspot ? '已连接电脑移动热点' : '电脑与手机需处于同一 Wi-Fi 或电脑热点'}
                    </span>
                  )}
                </section>

                <section className="host-online-banner" aria-label="在线玩家统计">
                  <span className="host-online-banner__dot" aria-hidden="true" />
                  <span>
                    当前在线设备：<strong>{netStatus?.onlineClientCount ?? 0}</strong> 台
                  </span>
                </section>

                <section className="host-enter-section">
                  {isPc ? (
                    <>
                      <button
                        type="button"
                        className="primary-btn host-enter-btn host-enter-btn--table"
                        onClick={() => enterLobby('table')}
                      >
                        <Monitor size={20} aria-hidden="true" />
                        <span>进入大厅（桌面大屏模式）</span>
                      </button>
                      <p className="host-enter-desc">
                        🌟 <strong>推荐</strong>：电脑置于桌面或投屏电视，全场共享牌桌与倒计时；玩家手机仅展示私密手牌。
                      </p>
                      <button
                        type="button"
                        className="host-enter-btn--secondary"
                        onClick={() => enterLobby('player')}
                      >
                        <Users size={17} aria-hidden="true" />
                        <span>以普通玩家身份进入大厅</span>
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="primary-btn host-enter-btn"
                      onClick={() => enterLobby('player')}
                    >
                      <LogIn size={18} aria-hidden="true" />
                      <span>进入大厅（本机开房）</span>
                    </button>
                  )}
                </section>
              </>
            )}
          </div>

          {/* 右侧/下半部：二维码与候选网卡 */}
          {phase === 'running' && (
            <div className="host-console__col host-console__col--qr">
              <section className="host-qr-card" aria-label="玩家扫码加入">
                <div className="host-qr-frame">
                  <QRCodeSVG
                    value={qrUrl}
                    size={isPc ? 200 : 160}
                    className="host-qr"
                    role="img"
                    aria-label="入口地址二维码"
                  />
                </div>
                <p className="host-qr-hint">手机连接同一网络后，相机扫码或浏览器输入即可开玩：</p>
                <div className="host-qr-url-row">
                  <code className="host-qr-url">{qrUrl}</code>
                  <button
                    type="button"
                    className="host-qr-copy-btn"
                    onClick={() => void copyQrUrl()}
                    title="复制连接网址"
                    aria-label="复制连接网址"
                  >
                    {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
                    <span>{copied ? '已复制' : '复制'}</span>
                  </button>
                </div>

                {multiCandidate && (
                  <div className="host-qr-candidates" role="group" aria-label="选择入口地址">
                    <p className="host-qr-candidates__hint">
                      检测到多个网卡地址（如同时连有 Wi-Fi 与热点），扫码连不上可切换：
                    </p>
                    <div className="host-qr-candidates__list">
                      {candidates.map((url) => {
                        const matchedNative = nativeAddrs.find((n) => url.includes(n.address));
                        const label = matchedNative ? `${matchedNative.interfaceName}: ${url}` : url;
                        return (
                          <button
                            key={url}
                            type="button"
                            className={`text-btn host-qr-candidate ${url === qrUrl ? 'is-active' : ''}`}
                            onClick={() => setSelectedUrl(url)}
                          >
                            <span className="host-qr-candidate__radio" aria-hidden="true">
                              {url === qrUrl ? '●' : '○'}
                            </span>
                            <span className="host-qr-candidate__text">{label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {candidates.length === 0 && (
                  <p className="host-qr-warn">
                    未检测到局域网 IP 地址。请确认电脑已连接 Wi-Fi 或开启移动热点，再点击「重启服务」。
                  </p>
                )}
              </section>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
