import { DEFAULT_TTS_CONFIG, TTS_STORAGE_KEY, type TtsSettingsConfig } from './types.ts';
import { speakViaSystemTts, stopSystemTts } from '../../native/systemTts.ts';

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
let activeAudioUrl: string | null = null;
/** 单调递增调用序号：interrupt 场景下旧调用即使 fetch 后返回也不得再播放 */
let speakSeq = 0;

function discardActiveAudio(): void {
  if (activeAudio) {
    try {
      activeAudio.pause();
    } catch {
      // 忽略
    }
    activeAudio.onended = null;
    activeAudio = null;
  }
  if (activeAudioUrl !== null) {
    URL.revokeObjectURL(activeAudioUrl);
    activeAudioUrl = null;
  }
}

export function stopPlayback(): void {
  void stopSystemTts();
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
  discardActiveAudio();
}

export async function speakText(
  text: string,
  configOverride?: Partial<TtsSettingsConfig>,
  interrupt = true
): Promise<void> {
  const config = { ...loadTtsSettings(), ...configOverride };
  const seq = ++speakSeq;

  if (typeof window === 'undefined') return;

  if (interrupt) {
    void stopSystemTts();
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    discardActiveAudio();
  }

  // 1. Android 原生 / 本地 System TTS 模式
  if (config.engine === 'system_tts') {
    await speakViaSystemTts(text, {
      rate: config.rate,
      pitch: config.pitch,
      interrupt,
    });
    return;
  }

  // 2. Web Speech API 原生模式
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

      // 请求期间若已有更新的语音调用，直接丢弃本次结果（不播放、不回退）
      if (seq !== speakSeq) return;

      if (!res.ok) {
        throw new Error(`TTS API 响应错误: ${res.status}`);
      }

      const blob = await res.blob();
      if (seq !== speakSeq) return;

      const audioUrl = URL.createObjectURL(blob);
      const audio = new Audio(audioUrl);
      audio.volume = config.volume;
      discardActiveAudio();
      activeAudio = audio;
      activeAudioUrl = audioUrl;
      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        if (activeAudio === audio) {
          activeAudio = null;
          activeAudioUrl = null;
        }
      };
      try {
        await audio.play();
      } catch (playErr) {
        // 播放被拒/被打断：回收 blob URL；若本调用仍是最新则走回退，否则静默丢弃
        URL.revokeObjectURL(audioUrl);
        if (activeAudio === audio) {
          activeAudio = null;
          activeAudioUrl = null;
        }
        if (seq === speakSeq) {
          throw playErr;
        }
      }
    } catch (err) {
      if (seq !== speakSeq) return;
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
