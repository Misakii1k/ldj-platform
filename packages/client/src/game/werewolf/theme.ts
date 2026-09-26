/**
 * 狼人杀唯一主题源（02-VISUAL.md / T09）。
 *
 * - 持久 key: ldj_werewolf_theme_pair_v1
 * - 偏好对: forest | theatre，缺省 forest
 * - 自动迁移旧 key: ldj_werewolf_theme (woodcut/eclipse -> forest, theatre -> theatre)
 * - 结合 period (day/night) 纯函数解析为四种渲染主题：
 *   forest + day   -> woodcut-day
 *   forest + night -> eclipse-night
 *   theatre + day  -> theatre-day
 *   theatre + night -> theatre-night
 * - storage 读写异常安全容错，绝不抛出异常导致崩溃。
 */

export type WerewolfThemePair = 'forest' | 'theatre';
export type WerewolfThemePeriod = 'day' | 'night';
export type WerewolfResolvedTheme =
  | 'woodcut-day'
  | 'eclipse-night'
  | 'theatre-day'
  | 'theatre-night';

export const THEME_PAIR_STORAGE_KEY = 'ldj_werewolf_theme_pair_v1';
export const LEGACY_THEME_STORAGE_KEY = 'ldj_werewolf_theme';

export function resolveThemePeriod(
  timelinePeriod?: 'day' | 'night' | null,
  phase?: string | null,
  nightStage?: string | null,
): WerewolfThemePeriod {
  // 终局强制白天
  if (phase === 'game_over') {
    return 'day';
  }
  // 权威时间线优先
  if (timelinePeriod === 'night' || timelinePeriod === 'day') {
    return timelinePeriod;
  }
  // 旧流程回退按服务端 phase / nightStage 推导
  if (phase === 'night' || (nightStage !== null && nightStage !== undefined && nightStage !== 'done')) {
    return 'night';
  }
  return 'day';
}

export function resolveWerewolfTheme(
  pair: WerewolfThemePair,
  period: WerewolfThemePeriod,
): WerewolfResolvedTheme {
  if (pair === 'theatre') {
    return period === 'night' ? 'theatre-night' : 'theatre-day';
  }
  return period === 'night' ? 'eclipse-night' : 'woodcut-day';
}

function safeGetStorage(storage?: Storage): Storage | null {
  if (storage) return storage;
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  return null;
}

export function getThemePairPreference(storage?: Storage): WerewolfThemePair {
  try {
    const s = safeGetStorage(storage);
    if (!s) return 'forest';

    const current = s.getItem(THEME_PAIR_STORAGE_KEY);
    if (current === 'forest' || current === 'theatre') {
      return current;
    }

    // 兼容旧 key 一次性迁移
    const legacy = s.getItem(LEGACY_THEME_STORAGE_KEY);
    if (legacy === 'theatre') {
      try {
        s.setItem(THEME_PAIR_STORAGE_KEY, 'theatre');
      } catch {
        // ignore storage errors
      }
      return 'theatre';
    }
    if (legacy === 'woodcut' || legacy === 'eclipse') {
      try {
        s.setItem(THEME_PAIR_STORAGE_KEY, 'forest');
      } catch {
        // ignore storage errors
      }
      return 'forest';
    }
  } catch {
    // ignore
  }
  return 'forest';
}

export function setThemePairPreference(pair: WerewolfThemePair, storage?: Storage): void {
  try {
    const s = safeGetStorage(storage);
    if (!s) return;
    s.setItem(THEME_PAIR_STORAGE_KEY, pair);
  } catch {
    // ignore
  }
}
