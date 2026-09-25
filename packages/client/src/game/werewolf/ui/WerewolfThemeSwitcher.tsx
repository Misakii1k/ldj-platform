import React from 'react';

export type WerewolfThemeKey = 'woodcut' | 'eclipse' | 'theatre';

interface WerewolfThemeSwitcherProps {
  readonly theme: WerewolfThemeKey;
  readonly onSelectTheme: (theme: WerewolfThemeKey) => void;
}

const THEME_OPTIONS: readonly { key: WerewolfThemeKey; label: string; title: string }[] = [
  { key: 'woodcut', label: '木刻', title: 'A · 林中木刻' },
  { key: 'eclipse', label: '月蚀', title: 'B · 月蚀星轨' },
  { key: 'theatre', label: '赤幕', title: 'C · 赤幕剧场' },
];

export function WerewolfThemeSwitcher({ theme, onSelectTheme }: WerewolfThemeSwitcherProps) {
  return (
    <div className="ww-theme-switcher" role="group" aria-label="对局主题切换">
      {THEME_OPTIONS.map((opt) => {
        const isSelected = theme === opt.key;
        return (
          <button
            key={opt.key}
            type="button"
            className={`ww-theme-btn ${isSelected ? 'is-active' : ''}`}
            onClick={() => onSelectTheme(opt.key)}
            aria-pressed={isSelected}
            title={opt.title}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
