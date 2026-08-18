import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type BgMode = 'party' | 'particles' | 'video' | 'minimal';

interface BackgroundContextType {
  bgMode: BgMode;
  setBgMode: (mode: BgMode) => void;
}

const STORAGE_KEY = 'ldj_bg_mode';

const BackgroundContext = createContext<BackgroundContextType>({
  bgMode: 'party',
  setBgMode: () => {},
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
  }, [bgMode]);

  return (
    <BackgroundContext.Provider value={{ bgMode, setBgMode }}>
      {children}
    </BackgroundContext.Provider>
  );
}

export function useBackground() {
  return useContext(BackgroundContext);
}
