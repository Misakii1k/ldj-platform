/**
 * 一智千金局内本地设置（纯逻辑，便于单测）。
 *
 * 动效强度不在这里存储——它由全局 MotionProvider（localStorage `ldj_motion_preference`）
 * 统一管理，设置抽屉只是代理 useMotion().setPreference，避免出现两份互相打架的档位。
 */

export type WitsTheme = 'felt-green' | 'walnut' | 'midnight';

export interface WitsWagersSettings {
  /** 音效音量 0..1，静音状态由 webAudio 单例自身维护 */
  soundVolume: number;
  /** 桌面主题 */
  theme: WitsTheme;
  /** 保存下注前是否二次确认 */
  confirmBets: boolean;
  /** 正文字号缩放 0.9..1.3 */
  fontScale: number;
  /** 紧凑模式：压缩留白，让小屏放下更多槽位 */
  compact: boolean;
}

export const WITS_SETTINGS_STORAGE_KEY = 'ldj_ww_settings';

export const DEFAULT_WITS_SETTINGS: WitsWagersSettings = {
  soundVolume: 0.6,
  theme: 'felt-green',
  confirmBets: true,
  fontScale: 1,
  compact: false,
};

const THEMES: readonly WitsTheme[] = ['felt-green', 'walnut', 'midnight'];

export const MIN_FONT_SCALE = 0.9;
export const MAX_FONT_SCALE = 1.3;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * 宽松解析：任何单项损坏都回落到该项默认值，绝不整份丢弃用户设置。
 */
export function parseWitsSettings(raw: unknown): WitsWagersSettings {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ...DEFAULT_WITS_SETTINGS };
  }
  const input = raw as Record<string, unknown>;

  const soundVolume =
    typeof input.soundVolume === 'number' && Number.isFinite(input.soundVolume)
      ? clamp(input.soundVolume, 0, 1)
      : DEFAULT_WITS_SETTINGS.soundVolume;

  const theme =
    typeof input.theme === 'string' && THEMES.includes(input.theme as WitsTheme)
      ? (input.theme as WitsTheme)
      : DEFAULT_WITS_SETTINGS.theme;

  const confirmBets =
    typeof input.confirmBets === 'boolean' ? input.confirmBets : DEFAULT_WITS_SETTINGS.confirmBets;

  const fontScale =
    typeof input.fontScale === 'number' && Number.isFinite(input.fontScale)
      ? clamp(input.fontScale, MIN_FONT_SCALE, MAX_FONT_SCALE)
      : DEFAULT_WITS_SETTINGS.fontScale;

  const compact = typeof input.compact === 'boolean' ? input.compact : DEFAULT_WITS_SETTINGS.compact;

  return { soundVolume, theme, confirmBets, fontScale, compact };
}

export function readWitsSettings(storage?: Storage): WitsWagersSettings {
  const store = storage ?? (typeof localStorage === 'undefined' ? undefined : localStorage);
  if (!store) return { ...DEFAULT_WITS_SETTINGS };
  try {
    const raw = store.getItem(WITS_SETTINGS_STORAGE_KEY);
    if (raw === null) return { ...DEFAULT_WITS_SETTINGS };
    return parseWitsSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_WITS_SETTINGS };
  }
}

export function writeWitsSettings(settings: WitsWagersSettings, storage?: Storage): void {
  const store = storage ?? (typeof localStorage === 'undefined' ? undefined : localStorage);
  if (!store) return;
  try {
    store.setItem(WITS_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // 隐私模式等场景下写入失败不影响本局体验
  }
}
