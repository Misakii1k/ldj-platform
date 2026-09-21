import { useCallback, useEffect, useState } from 'react';
import { webAudio } from '../../../shared-ui/WebAudioManager.ts';
import {
  DEFAULT_WITS_SETTINGS,
  readWitsSettings,
  writeWitsSettings,
  type WitsWagersSettings,
} from './witsSettings.ts';

export interface WitsSettingsApi {
  readonly settings: WitsWagersSettings;
  readonly update: (patch: Partial<WitsWagersSettings>) => void;
  readonly reset: () => void;
}

/**
 * 局内设置读写。音量变更同步推给 webAudio 单例，
 * 这样设置抽屉里的滑块与实际播放音量始终一致。
 */
export function useWitsWagersSettings(): WitsSettingsApi {
  const [settings, setSettings] = useState<WitsWagersSettings>(() => readWitsSettings());

  useEffect(() => {
    webAudio.setVolume(settings.soundVolume);
  }, [settings.soundVolume]);

  const update = useCallback((patch: Partial<WitsWagersSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      writeWitsSettings(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    const next = { ...DEFAULT_WITS_SETTINGS };
    writeWitsSettings(next);
    setSettings(next);
  }, []);

  return { settings, update, reset };
}
