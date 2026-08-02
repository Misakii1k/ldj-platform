import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type BgMode = 'party' | 'particles' | 'video' | 'minimal';
export type GamePhaseAtmosphere = 'idle' | 'word_reveal' | 'speaking' | 'voting' | 'game_over';

interface BackgroundContextType {
  bgMode: BgMode;
  setBgMode: (mode: BgMode) => void;
  atmosphere: GamePhaseAtmosphere;
  setAtmosphere: (atmosphere: GamePhaseAtmosphere) => void;
}

const STORAGE_KEY = 'ldj_bg_mode';

const BackgroundContext = createContext<BackgroundContextType>({
  bgMode: 'party',
  setBgMode: () => {},
  atmosphere: 'idle',
  setAtmosphere: () => {},
});

export function BackgroundProvider({ children }: { children: ReactNode }) {
  const [bgMode, setBgModeState] = useState<BgMode>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'party' || saved === 'particles' || saved === 'video' || saved === 'minimal') {
        return saved;
      }
    } catch {
      // Ignore localStorage errors
    }
    return 'party';
  });

  const [atmosphere, setAtmosphere] = useState<GamePhaseAtmosphere>('idle');

  const setBgMode = (mode: BgMode) => {
    setBgModeState(mode);
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // Ignore localStorage errors
    }
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-bg-mode', bgMode);
    document.documentElement.setAttribute('data-atmosphere', atmosphere);
  }, [bgMode, atmosphere]);

  return (
    <BackgroundContext.Provider value={{ bgMode, setBgMode, atmosphere, setAtmosphere }}>
      {children}
    </BackgroundContext.Provider>
  );
}

export function useBackground() {
  return useContext(BackgroundContext);
}
