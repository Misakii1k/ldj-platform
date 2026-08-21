/**
 * APP 身份门控页（仅原生 APP 显示）：
 * 选择本机身份（玩家/桌面），并连接到主机后进入应用。
 */
import { useState } from 'react';
import { Smartphone, Monitor } from 'lucide-react';
import { useAppMode } from './AppModeContext.tsx';
import { ConnectionSettings } from './ConnectionSettings.tsx';
import type { AppMode } from './appMode.ts';

const IDENTITY_CARDS: Array<{
  mode: Exclude<AppMode, 'host'>;
  icon: typeof Smartphone;
  title: string;
  description: string;
}> = [
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
];

export function AppModeGate() {
  const { confirmMode } = useAppMode();
  const [selected, setSelected] = useState<Exclude<AppMode, 'host'> | null>(null);

  return (
    <main className="app-mode-gate">
      <div className="app-mode-gate__content">
        <header className="app-mode-gate__brand">
          <span className="app-mode-gate__tile" aria-hidden="true">聚</span>
          <h1 className="app-mode-gate__title">聚乐桌</h1>
          <p className="app-mode-gate__subtitle">选择这台设备的身份</p>
        </header>

        <div className="app-mode-gate__cards" role="radiogroup" aria-label="设备身份">
          {IDENTITY_CARDS.map(({ mode, icon: Icon, title, description }) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={selected === mode}
              className={`app-mode-card ${selected === mode ? 'is-selected' : ''}`}
              onClick={() => setSelected(mode)}
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
