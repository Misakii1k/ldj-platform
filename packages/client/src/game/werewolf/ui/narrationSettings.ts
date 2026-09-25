export const NARRATION_SETTINGS_EVENT = 'ldj:werewolf-narration-settings';

export function readNarrationSettings(storage?: Pick<Storage, 'getItem'>): { enabled: boolean | null; volume: number } {
  try {
    storage ??= typeof localStorage === 'undefined' ? undefined : localStorage;
    const enabled = storage?.getItem('ldj_werewolf_narration_enabled');
    const rawVolume = storage?.getItem('ldj_werewolf_narration_volume');
    const volume = rawVolume == null ? 0.8 : Number(rawVolume);
    return { enabled: enabled === 'true' ? true : enabled === 'false' ? false : null,
      volume: Number.isFinite(volume) && volume >= 0 && volume <= 1 ? volume : 0.8 };
  } catch { return { enabled: null, volume: 0.8 }; }
}
