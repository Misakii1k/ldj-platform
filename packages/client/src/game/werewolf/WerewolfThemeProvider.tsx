import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { WerewolfResolvedTheme, WerewolfThemePair, WerewolfThemePeriod } from './theme.ts';
import {
  getThemePairPreference,
  resolveThemePeriod,
  resolveWerewolfTheme,
  setThemePairPreference,
} from './theme.ts';

export interface WerewolfThemeContextValue {
  /** 只可能是 'theatre'；主题切换入口已随森林主题一并移除（W01）。 */
  readonly pair: WerewolfThemePair;
  /** 保留签名：主题已收敛为唯一剧场，切换是 no-op，只为兼容旧消费者。 */
  readonly setPair: (pair: WerewolfThemePair) => void;
  readonly period: WerewolfThemePeriod;
  readonly resolvedTheme: WerewolfResolvedTheme;
}

const WerewolfThemeContext = createContext<WerewolfThemeContextValue>({
  pair: 'theatre',
  setPair: () => {},
  period: 'day',
  resolvedTheme: 'theatre-day',
});

export function useWerewolfTheme(): WerewolfThemeContextValue {
  return useContext(WerewolfThemeContext);
}

export interface WerewolfThemeProviderProps {
  readonly timelinePeriod?: 'day' | 'night' | null;
  readonly phase?: string | null;
  readonly nightStage?: string | null;
  readonly children: React.ReactNode;
}

export function WerewolfThemeProvider({
  timelinePeriod,
  phase,
  nightStage,
  children,
}: WerewolfThemeProviderProps) {
  // 读取即迁移：旧存储值（forest / woodcut / eclipse / 未知值）会被归一并写回 theatre。
  const [pair] = useState<WerewolfThemePair>(() => getThemePairPreference());

  const period = useMemo(
    () => resolveThemePeriod(timelinePeriod, phase, nightStage),
    [timelinePeriod, phase, nightStage],
  );

  const setPair = (nextPair: WerewolfThemePair) => {
    // 唯一主题：切换不再改变画面，只把归一化后的值写回存储。
    setThemePairPreference(nextPair);
  };

  const resolvedTheme = useMemo(
    () => resolveWerewolfTheme(period),
    [period],
  );

  useEffect(() => {
    const portalRoot = document.getElementById('werewolf-portal-root');
    if (portalRoot) {
      portalRoot.setAttribute('data-ww-theme', resolvedTheme);
    }
  }, [resolvedTheme]);

  const value = useMemo(
    () => ({ pair, setPair, period, resolvedTheme }),
    [pair, period, resolvedTheme],
  );

  return (
    <WerewolfThemeContext.Provider value={value}>
      <div data-ww-theme={resolvedTheme} style={{ display: 'contents' }}>
        {children}
      </div>
    </WerewolfThemeContext.Provider>
  );
}
