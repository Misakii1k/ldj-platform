export type MotionPreference = 'auto' | 'full' | 'reduced' | 'off';
export type MotionLevel = 'full' | 'reduced' | 'minimal' | 'off';
export type MotionReason = 'user' | 'reduced-motion' | 'save-data' | 'device' | 'runtime' | 'default';

export interface DeviceMotionSignals {
  prefersReducedMotion: boolean;
  saveData: boolean;
  hardwareConcurrency?: number;
  deviceMemory?: number;
}

export interface FrameSample {
  averageFps: number;
  longFrameRatio: number;
}

export interface MotionResolution {
  level: MotionLevel;
  reason: MotionReason;
}

const MOTION_PREFERENCES: readonly MotionPreference[] = ['auto', 'full', 'reduced', 'off'];
const MOTION_LEVEL_RANK: Record<MotionLevel, number> = {
  full: 3,
  reduced: 2,
  minimal: 1,
  off: 0,
};

export function parseMotionPreference(value: unknown): MotionPreference {
  return MOTION_PREFERENCES.includes(value as MotionPreference)
    ? value as MotionPreference
    : 'auto';
}

export function resolveInitialMotion(
  preference: MotionPreference,
  signals: DeviceMotionSignals,
): MotionResolution {
  if (preference === 'off') return { level: 'off', reason: 'user' };
  if (signals.prefersReducedMotion) return { level: 'minimal', reason: 'reduced-motion' };
  if (preference === 'full' || preference === 'reduced') {
    return { level: preference, reason: 'user' };
  }
  if (signals.saveData) return { level: 'minimal', reason: 'save-data' };
  if (
    (signals.hardwareConcurrency !== undefined && signals.hardwareConcurrency <= 2) ||
    (signals.deviceMemory !== undefined && signals.deviceMemory <= 2)
  ) {
    return { level: 'minimal', reason: 'device' };
  }
  if (
    (signals.hardwareConcurrency !== undefined && signals.hardwareConcurrency <= 4) ||
    (signals.deviceMemory !== undefined && signals.deviceMemory <= 4)
  ) {
    return { level: 'reduced', reason: 'device' };
  }
  return { level: 'full', reason: 'default' };
}

export function assessFrameSample(sample: FrameSample): MotionResolution | null {
  if (sample.averageFps < 28 || sample.longFrameRatio > 0.4) {
    return { level: 'minimal', reason: 'runtime' };
  }
  if (sample.averageFps < 45 || sample.longFrameRatio > 0.2) {
    return { level: 'reduced', reason: 'runtime' };
  }
  return null;
}

export function lowerMotionLevel(current: MotionLevel, proposed: MotionLevel): MotionLevel {
  return MOTION_LEVEL_RANK[proposed] < MOTION_LEVEL_RANK[current] ? proposed : current;
}
