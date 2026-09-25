import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { WerewolfResolvedTheme, WerewolfThemePair, WerewolfThemePeriod } from './theme.ts';
import {
  getThemePairPreference,
  resolveThemePeriod,
  resolveWerewolfTheme,
  setThemePairPreference,
} from './theme.ts';

export interface WerewolfThemeContextValue {
  readonly pair: WerewolfThemePair;
  readonly setPair: (pair: WerewolfThemePair) => void;
  readonly period: WerewolfThemePeriod;
  readonly resolvedTheme: WerewolfResolvedTheme;
}

const WerewolfThemeContext = createContext<WerewolfThemeContextValue>({
  pair: 'forest',
  setPair: () => {},
  period: 'day',
  resolvedTheme: 'woodcut-day',
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
  const [pair, setPairState] = useState<WerewolfThemePair>(() => getThemePairPreference());

  const period = useMemo(
    () => resolveThemePeriod(timelinePeriod, phase, nightStage),
    [timelinePeriod, phase, nightStage],
  );

  const setPair = (nextPair: WerewolfThemePair) => {
    setPairState(nextPair);
    setThemePairPreference(nextPair);
  };

  const resolvedTheme = useMemo(
    () => resolveWerewolfTheme(pair, period),
    [pair, period],
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
