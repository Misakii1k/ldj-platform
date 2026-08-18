import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  assessFrameSample,
  lowerMotionLevel,
  parseMotionPreference,
  resolveInitialMotion,
  type DeviceMotionSignals,
  type MotionLevel,
  type MotionPreference,
  type MotionReason,
  type MotionResolution,
} from './motionPolicy.ts';

interface MotionContextValue {
  preference: MotionPreference;
  setPreference: (preference: MotionPreference) => void;
  level: MotionLevel;
  reason: MotionReason;
  isAuto: boolean;
}

interface NavigatorMotionSignals extends Navigator {
  deviceMemory?: number;
  connection?: { saveData?: boolean };
}

const STORAGE_KEY = 'ldj_motion_preference';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function readStoredPreference(): MotionPreference {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? parseMotionPreference(saved) : 'full';
  } catch {
    return 'full';
  }
}

function readSignals(prefersReducedMotion: boolean): DeviceMotionSignals {
  const motionNavigator = navigator as NavigatorMotionSignals;
  return {
    prefersReducedMotion,
    saveData: motionNavigator.connection?.saveData === true,
    hardwareConcurrency: navigator.hardwareConcurrency || undefined,
    deviceMemory: motionNavigator.deviceMemory,
  };
}

function initialResolution(preference: MotionPreference): MotionResolution {
  const prefersReducedMotion = window.matchMedia(REDUCED_MOTION_QUERY).matches;
  return resolveInitialMotion(preference, readSignals(prefersReducedMotion));
}

const MotionContext = createContext<MotionContextValue | null>(null);

export function MotionProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<MotionPreference>(readStoredPreference);
  const [resolution, setResolution] = useState<MotionResolution>(() => initialResolution(preference));
  const sampledPreferenceRef = useRef<MotionPreference | null>(null);

  const setPreference = (nextPreference: MotionPreference) => {
    setPreferenceState(nextPreference);
    sampledPreferenceRef.current = null;
    try {
      localStorage.setItem(STORAGE_KEY, nextPreference);
    } catch {
      return;
    }
  };

  useEffect(() => {
    const mediaQuery = window.matchMedia(REDUCED_MOTION_QUERY);
    const updateResolution = () => {
      setResolution(resolveInitialMotion(preference, readSignals(mediaQuery.matches)));
      sampledPreferenceRef.current = null;
    };
    updateResolution();
    mediaQuery.addEventListener('change', updateResolution);
    return () => mediaQuery.removeEventListener('change', updateResolution);
  }, [preference]);

  useEffect(() => {
    if (resolution.level === 'minimal' || resolution.level === 'off') return;
    if (sampledPreferenceRef.current === preference || document.hidden) return;

    let delayId = 0;
    let frameId = 0;
    let cancelled = false;
    let completed = false;
    const frameTimes: number[] = [];
    const sampleDuration = 4000;
    let startedAt = 0;
    let previousAt = 0;

    const resetSample = () => {
      window.clearTimeout(delayId);
      cancelAnimationFrame(frameId);
      frameTimes.length = 0;
      startedAt = 0;
      previousAt = 0;
    };

    const finish = () => {
      completed = true;
      sampledPreferenceRef.current = preference;
      if (frameTimes.length === 0) return;
      const totalDuration = frameTimes.reduce((total, duration) => total + duration, 0);
      const averageFps = totalDuration > 0 ? 1000 / (totalDuration / frameTimes.length) : 60;
      const longFrameRatio = frameTimes.filter((duration) => duration > 50).length / frameTimes.length;
      const assessment = assessFrameSample({ averageFps, longFrameRatio });
      if (!assessment) return;
      setResolution((current) => {
        const level = lowerMotionLevel(current.level, assessment.level);
        return level === current.level ? current : { level, reason: assessment.reason };
      });
    };

    const sampleFrame = (now: number) => {
      if (cancelled || document.hidden) return;
      if (startedAt === 0) {
        startedAt = now;
        previousAt = now;
      } else {
        frameTimes.push(now - previousAt);
        previousAt = now;
      }
      if (now - startedAt >= sampleDuration) {
        finish();
        return;
      }
      frameId = requestAnimationFrame(sampleFrame);
    };

    const startSample = () => {
      if (cancelled || completed || document.hidden) return;
      resetSample();
      delayId = window.setTimeout(() => {
        frameId = requestAnimationFrame(sampleFrame);
      }, 1000);
    };

    const handleVisibilityChange = () => {
      if (document.hidden) resetSample();
      else startSample();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    startSample();

    return () => {
      cancelled = true;
      resetSample();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [preference, resolution.level]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.motionLevel = resolution.level;
    root.dataset.motionPreference = preference;
    root.dataset.motionReason = resolution.reason;
    return () => {
      delete root.dataset.motionLevel;
      delete root.dataset.motionPreference;
      delete root.dataset.motionReason;
    };
  }, [preference, resolution]);

  const value = useMemo<MotionContextValue>(() => ({
    preference,
    setPreference,
    level: resolution.level,
    reason: resolution.reason,
    isAuto: preference === 'auto',
  }), [preference, resolution]);

  return <MotionContext.Provider value={value}>{children}</MotionContext.Provider>;
}

export function useMotion() {
  const context = useContext(MotionContext);
  if (!context) throw new Error('useMotion must be used within MotionProvider');
  return context;
}
