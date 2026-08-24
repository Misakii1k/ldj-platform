import { registerPlugin } from '@capacitor/core';
import { isNativeApp } from '../app/nativePlatform.ts';

interface SystemTtsPluginInterface {
  speak(options: {
    text: string;
    rate?: number;
    pitch?: number;
    interrupt?: boolean;
  }): Promise<{ success: boolean; utteranceId?: string; error?: string }>;
  stop(): Promise<{ stopped: boolean }>;
  isAvailable(): Promise<{ available: boolean }>;
}

const SystemTtsNative = registerPlugin<SystemTtsPluginInterface>('SystemTts');

export async function speakViaSystemTts(
  text: string,
  options?: { rate?: number; pitch?: number; interrupt?: boolean }
): Promise<boolean> {
  if (isNativeApp()) {
    try {
      const res = await SystemTtsNative.speak({
        text,
        rate: options?.rate ?? 1.0,
        pitch: options?.pitch ?? 1.0,
        interrupt: options?.interrupt ?? true,
      });
      if (res && res.success) {
        return true;
      }
    } catch (err) {
      console.warn('Native SystemTts failed, falling back to Web Speech:', err);
    }
  }

  // Web Speech API fallback
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      if (options?.interrupt !== false) {
        window.speechSynthesis.cancel();
      }
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = options?.rate ?? 1.0;
      utterance.pitch = options?.pitch ?? 1.0;
      utterance.lang = 'zh-CN';
      window.speechSynthesis.speak(utterance);
      return true;
    } catch {
      return false;
    }
  }

  return false;
}

export async function stopSystemTts(): Promise<void> {
  if (isNativeApp()) {
    try {
      await SystemTtsNative.stop();
    } catch {
      // Ignore
    }
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // Ignore
    }
  }
}
