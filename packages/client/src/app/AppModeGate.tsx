/**
 * APP 身份门控页（仅原生 APP 显示）：
 * 选择本机身份（玩家/桌面/主机）后进入应用。
 * 玩家/桌面需再连接主机；主机模式直接进入主机控制台。
 */
import { useEffect, useRef, useState } from 'react';
import { Smartphone, Monitor, Server, Sparkles } from 'lucide-react';
import { useAppMode } from './AppModeContext.tsx';
import { ConnectionSettings } from './ConnectionSettings.tsx';

interface IdentityCardSpec {
  mode: 'player' | 'table' | 'host';
  icon: typeof Smartphone;
  tag: string;
  title: string;
  description: string;
  hint: string;
  isRecommend?: boolean;
}

const IDENTITY_CARDS: IdentityCardSpec[] = [
  {
    mode: 'player',
    icon: Smartphone,
    tag: '个人手牌',
    title: '玩家模式',
    description: '手持设备，加入房间并操作个人私密手牌',
    hint: '手机专属手牌 · 推荐普通玩家',
    isRecommend: true,
  },
  {
    mode: 'table',
    icon: Monitor,
    tag: '公共大屏',
    title: '桌面模式',
    description: '平板或电脑平放桌中，作全场公共大屏展示',
    hint: '大屏观赛 · 桌面公用看板',
  },
  {
    mode: 'host',
    icon: Server,
    tag: '本机开房',
    title: '主机模式',
    description: '这台设备充当游戏服务器，无需外网局域网直连',
    hint: '内嵌服务器 · 一键开房建服',
  },
];

export function AppModeGate() {
  const { confirmMode } = useAppMode();
  const [selected, setSelected] = useState<'player' | 'table' | null>(null);
  const connectRef = useRef<HTMLElement | null>(null);

  function pickCard(mode: IdentityCardSpec['mode']) {
    if (mode === 'host') {
      confirmMode('host');
      return;
    }
    setSelected(mode);
  }

  useEffect(() => {
    if (selected !== null && connectRef.current) {
      // 稍微延迟等待 DOM 渲染后平滑滑动入视口
      const timer = setTimeout(() => {
        connectRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [selected]);

  return (
    <main className="app-mode-gate">
      <div className="app-mode-gate__content">
        <header className="app-mode-gate__brand">
          <div className="home-brand" aria-label="聚乐桌游">
            <span className="home-brand__tile" aria-hidden="true">
              <img src="/icon-192.png" alt="" className="home-brand__img" />
            </span>
            <span className="home-brand__name">聚乐桌游</span>
          </div>
          <p className="app-mode-gate__eyebrow">扫码即玩 · 手机就是专属手牌</p>
          <h1 className="app-mode-gate__title">选择这台设备的身份</h1>
          <p className="app-mode-gate__subtitle">
            同一局域网内免外网极速联机，随时随地开启派对
          </p>
        </header>

        <div className="app-mode-gate__cards app-mode-gate__cards--three" role="radiogroup" aria-label="设备身份">
          {IDENTITY_CARDS.map(({ mode, icon: Icon, tag, title, description, hint, isRecommend }) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={mode === 'host' || selected === mode}
              className={`app-mode-card ${selected === mode ? 'is-selected' : ''} ${isRecommend ? 'is-recommend' : ''}`}
              onClick={() => pickCard(mode)}
            >
              <div className="app-mode-card__top">
                <span className="app-mode-card__tag">{tag}</span>
                {isRecommend && <span className="app-mode-card__recommend-badge"><Sparkles size={11} /> 常用</span>}
              </div>
              <div className="app-mode-card__icon-box">
                <Icon size={28} strokeWidth={2.2} aria-hidden="true" className="app-mode-card__icon" />
              </div>
              <span className="app-mode-card__title">{title}</span>
              <span className="app-mode-card__desc">{description}</span>
              <span className="app-mode-card__hint">{hint}</span>
            </button>
          ))}
        </div>

        {selected !== null && (
          <section className="app-mode-gate__connect" aria-label="连接主机" ref={connectRef}>
            <div className="app-mode-gate__connect-head">
              <span className="app-mode-gate__connect-title">连接游戏主机</span>
              <span className="app-mode-gate__connect-sub">地址见主机屏幕二维码或房主分享的局域网链接</span>
            </div>
            <ConnectionSettings submitLabel="连接并进入大厅" onSaved={() => confirmMode(selected)} />
          </section>
        )}
      </div>
    </main>
  );
}
