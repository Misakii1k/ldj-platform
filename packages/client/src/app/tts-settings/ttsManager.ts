import { DEFAULT_TTS_CONFIG, TTS_STORAGE_KEY, type TtsSettingsConfig } from './types.ts';

export function loadTtsSettings(): TtsSettingsConfig {
  try {
    const raw = localStorage.getItem(TTS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<TtsSettingsConfig>;
      return { ...DEFAULT_TTS_CONFIG, ...parsed };
    }
  } catch {
    // Ignore localStorage read errors
  }
  return { ...DEFAULT_TTS_CONFIG };
}

export function saveTtsSettings(config: TtsSettingsConfig): void {
  try {
    localStorage.setItem(TTS_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Ignore localStorage write errors
  }
}

let activeAudio: HTMLAudioElement | null = null;

export async function speakText(
  text: string,
  configOverride?: Partial<TtsSettingsConfig>,
  interrupt = true
): Promise<void> {
  const config = { ...loadTtsSettings(), ...configOverride };

  if (typeof window === 'undefined') return;

  if (interrupt) {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (activeAudio) {
      activeAudio.pause();
      activeAudio = null;
    }
  }

  // 1. Web Speech API 原生模式
  if (config.engine === 'web_speech') {
    if (!('speechSynthesis' in window)) return;
    try {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = config.rate;
      utterance.pitch = config.pitch;
      utterance.volume = config.volume;
      utterance.lang = 'zh-CN';

      const voices = window.speechSynthesis.getVoices();
      if (config.voiceURI) {
        const found = voices.find((v) => v.voiceURI === config.voiceURI);
        if (found) utterance.voice = found;
      } else {
        const zhVoice = voices.find(
          (v) =>
            v.lang.includes('zh') ||
            v.lang.includes('cmn') ||
            v.name.includes('Chinese') ||
            v.name.includes('普通话')
        );
        if (zhVoice) utterance.voice = zhVoice;
      }

      window.speechSynthesis.speak(utterance);
    } catch {
      // Ignore synthesis errors
    }
    return;
  }

  // 2. Custom OpenAI-compatible TTS API 模式
  if (config.engine === 'custom_api' && config.apiUrl) {
    try {
      const url = config.apiUrl.replace(/\/+$/, '') + '/audio/speech';
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (config.apiKey) {
        headers['Authorization'] = `Bearer ${config.apiKey}`;
      }

      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: config.apiModel || 'tts-1',
          input: text,
          voice: config.apiVoice || 'alloy',
          speed: config.rate,
        }),
      });

      if (!res.ok) {
        throw new Error(`TTS API 响应错误: ${res.status}`);
      }

      const blob = await res.blob();
      const audioUrl = URL.createObjectURL(blob);
      const audio = new Audio(audioUrl);
      audio.volume = config.volume;
      activeAudio = audio;
      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        if (activeAudio === audio) activeAudio = null;
      };
      await audio.play();
    } catch (err) {
      console.warn('Custom TTS API failed, falling back to Web Speech:', err);
      // 回退到 Web Speech
      if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'zh-CN';
        window.speechSynthesis.speak(utterance);
      }
    }
  }
}
