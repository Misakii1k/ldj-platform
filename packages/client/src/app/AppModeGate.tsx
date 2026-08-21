/**
 * APP 身份门控页（仅原生 APP 显示）：
 * 选择本机身份（玩家/桌面/主机）后进入应用。
 * 玩家/桌面需再连接主机；主机模式直接进入主机控制台。
 */
import { useState } from 'react';
import { Smartphone, Monitor, Server } from 'lucide-react';
import { useAppMode } from './AppModeContext.tsx';
import { ConnectionSettings } from './ConnectionSettings.tsx';

interface IdentityCardSpec {
  mode: 'player' | 'table' | 'host';
  icon: typeof Smartphone;
  title: string;
  description: string;
}

const IDENTITY_CARDS: IdentityCardSpec[] = [
  {
    mode: 'player',
    icon: Smartphone,
    title: '玩家模式',
    description: '手持设备，加入牌局个人操作',
  },
  {
    mode: 'table',
    icon: Monitor,
    title: '桌面模式',
    description: '平放桌中，作公共大屏展示',
  },
  {
    mode: 'host',
    icon: Server,
    title: '主机模式',
    description: '本机当服务器，大家连你',
  },
];

export function AppModeGate() {
  const { confirmMode } = useAppMode();
  const [selected, setSelected] = useState<'player' | 'table' | null>(null);

  function pickCard(mode: IdentityCardSpec['mode']) {
    if (mode === 'host') {
      confirmMode('host');
      return;
    }
    setSelected(mode);
  }

  return (
    <main className="app-mode-gate">
      <div className="app-mode-gate__content">
        <header className="app-mode-gate__brand">
          <span className="app-mode-gate__tile" aria-hidden="true">聚</span>
          <h1 className="app-mode-gate__title">聚乐桌</h1>
          <p className="app-mode-gate__subtitle">选择这台设备的身份</p>
        </header>

        <div className="app-mode-gate__cards app-mode-gate__cards--three" role="radiogroup" aria-label="设备身份">
          {IDENTITY_CARDS.map(({ mode, icon: Icon, title, description }) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={mode === 'host' || selected === mode}
              className={`app-mode-card ${selected === mode ? 'is-selected' : ''}`}
              onClick={() => pickCard(mode)}
            >
              <Icon size={30} strokeWidth={1.8} aria-hidden="true" className="app-mode-card__icon" />
              <span className="app-mode-card__title">{title}</span>
              <span className="app-mode-card__desc">{description}</span>
            </button>
          ))}
        </div>

        {selected !== null && (
          <section className="app-mode-gate__connect" aria-label="连接主机">
            <p className="app-mode-gate__hint">地址见主机屏幕二维码或房主分享的链接</p>
            <ConnectionSettings submitLabel="连接并进入" onSaved={() => confirmMode(selected)} />
          </section>
        )}
      </div>
    </main>
  );
}
