/**
 * 狼人杀唯一主题源（剧场 · 2026-09-26 视觉交接计划 W01）。
 *
 * - 持久 key: ldj_werewolf_theme_pair_v1
 * - 只保留剧场一套主题（用户 2026-09-26「最后一个主题只要一套就行了，要剧场」）。
 *   森林（木刻日 / 月蚀夜）不再打磨，主题切换入口与相关组件已移除。
 * - 旧存储值（forest / woodcut / eclipse / 任何未知值）一律迁移为 theatre。
 * - 结合 period (day/night) 纯函数解析为两种渲染主题：
 *   theatre + day   -> theatre-day（红幕拉开、脚灯亮、暖追光，**仍是暗场**）
 *   theatre + night -> theatre-night（红幕合拢、脚灯熄、冷月光，近黑）
 * - storage 读写异常安全容错，绝不抛出异常导致崩溃。
 */

export type WerewolfThemePair = 'theatre';
export type WerewolfThemePeriod = 'day' | 'night';
export type WerewolfResolvedTheme = 'theatre-day' | 'theatre-night';

export const THEME_PAIR_STORAGE_KEY = 'ldj_werewolf_theme_pair_v1';
export const LEGACY_THEME_STORAGE_KEY = 'ldj_werewolf_theme';
export const DEFAULT_THEME_PAIR: WerewolfThemePair = 'theatre';

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

/** 唯一主题：period 直接决定渲染主题，不再有主题对这一维度。 */
export function resolveWerewolfTheme(period: WerewolfThemePeriod): WerewolfResolvedTheme {
  return period === 'night' ? 'theatre-night' : 'theatre-day';
}

function safeGetStorage(storage?: Storage): Storage | null {
  if (storage) return storage;
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  return null;
}

/**
 * 读取主题偏好。只可能是 theatre：任何旧值（forest / woodcut / eclipse / 未知值）
 * 与缺失值都会就地归一化成 theatre，旧 key 一并清掉。
 */
export function getThemePairPreference(storage?: Storage): WerewolfThemePair {
  const s = safeGetStorage(storage);
  if (!s) return DEFAULT_THEME_PAIR;
  try {
    if (s.getItem(THEME_PAIR_STORAGE_KEY) !== DEFAULT_THEME_PAIR) {
      s.setItem(THEME_PAIR_STORAGE_KEY, DEFAULT_THEME_PAIR);
    }
    if (s.getItem(LEGACY_THEME_STORAGE_KEY) !== null) {
      s.removeItem(LEGACY_THEME_STORAGE_KEY);
    }
  } catch {
    // 隐私模式 / 配额受限时安全回退，不影响渲染
  }
  return DEFAULT_THEME_PAIR;
}

export function setThemePairPreference(pair: WerewolfThemePair, storage?: Storage): void {
  try {
    const s = safeGetStorage(storage);
    if (!s) return;
    s.setItem(THEME_PAIR_STORAGE_KEY, pair);
  } catch {
    // ignore storage errors
  }
}
