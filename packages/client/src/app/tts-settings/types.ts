export type TtsEngineType = 'web_speech' | 'custom_api';

export interface TtsSettingsConfig {
  engine: TtsEngineType;
  /** Web Speech 参数 */
  voiceURI?: string;
  rate: number; // 0.8 ~ 1.5
  pitch: number; // 0.8 ~ 1.2
  volume: number; // 0 ~ 1
  /** 自定义 / OpenAI 兼容 TTS API 参数 */
  apiUrl: string;
  apiKey: string;
  apiModel: string;
  apiVoice: string;
}

export const DEFAULT_TTS_CONFIG: TtsSettingsConfig = {
  engine: 'web_speech',
  voiceURI: '',
  rate: 1.0,
  pitch: 1.0,
  volume: 1.0,
  apiUrl: 'https://api.openai.com/v1',
  apiKey: '',
  apiModel: 'tts-1',
  apiVoice: 'alloy',
};

export const TTS_STORAGE_KEY = 'ldj_tts_config';
