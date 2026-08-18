import { useEffect, useState } from 'react';
import { useToast } from '../../shared-ui/ToastContext.tsx';
import { loadTtsSettings, saveTtsSettings, speakText } from './ttsManager.ts';
import type { TtsEngineType, TtsSettingsConfig } from './types.ts';

export function TtsSettings() {
  const { showToast } = useToast();
  const [config, setConfig] = useState<TtsSettingsConfig>(loadTtsSettings);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [isPlayingTest, setIsPlayingTest] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const updateVoices = () => {
      const all = window.speechSynthesis.getVoices();
      const zh = all.filter(
        (v) =>
          v.lang.includes('zh') ||
          v.lang.includes('cmn') ||
          v.name.includes('Chinese') ||
          v.name.includes('普通话') ||
          v.name.includes('Xiaoxiao') ||
          v.name.includes('Yunxi')
      );
      setAvailableVoices(zh.length > 0 ? zh : all);
    };

    updateVoices();
    window.speechSynthesis.addEventListener('voiceschanged', updateVoices);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', updateVoices);
  }, []);

  const handleEngineChange = (engine: TtsEngineType) => {
    const updated = { ...config, engine };
    setConfig(updated);
    saveTtsSettings(updated);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    saveTtsSettings(config);
    showToast('TTS 语音设置已保存');
  };

  const handleTestPlay = async () => {
    setIsPlayingTest(true);
    try {
      await speakText('天黑请闭眼，所有人扣紧骰盅。现在是夜间 1 点，请 1 点的玩家睁眼。', config, true);
    } finally {
      setTimeout(() => setIsPlayingTest(false), 2500);
    }
  };

  return (
    <form className="tts-settings-form" onSubmit={handleSave}>
      <div className="tts-section">
        <label className="tts-label-title">TTS 语音引擎选择</label>
        <div className="tts-engine-grid">
          <button
            type="button"
            className={`tts-engine-card ${config.engine === 'web_speech' ? 'is-active' : ''}`}
            onClick={() => handleEngineChange('web_speech')}
          >
            <div className="engine-icon">🌐</div>
            <div className="engine-meta">
              <strong>系统原生 Web Speech API</strong>
              <span>免配置 · 零网络延迟 · 本地中文发音</span>
            </div>
            {config.engine === 'web_speech' && <span className="engine-check">✓ 当前使用</span>}
          </button>

          <button
            type="button"
            className={`tts-engine-card ${config.engine === 'custom_api' ? 'is-active' : ''}`}
            onClick={() => handleEngineChange('custom_api')}
          >
            <div className="engine-icon">⚡</div>
            <div className="engine-meta">
              <strong>第三方 / OpenAI 兼容 TTS</strong>
              <span>高音质 · 拟真情绪 · 支持自定义端点</span>
            </div>
            {config.engine === 'custom_api' && <span className="engine-check">✓ 当前使用</span>}
          </button>
        </div>
      </div>

      {config.engine === 'web_speech' ? (
        <div className="tts-subpanel">
          <div className="form-group">
            <label htmlFor="tts-voice-select">系统发音人</label>
            <select
              id="tts-voice-select"
              className="tts-input"
              value={config.voiceURI || ''}
              onChange={(e) => {
                const updated = { ...config, voiceURI: e.target.value };
                setConfig(updated);
                saveTtsSettings(updated);
              }}
            >
              <option value="">系统默认中文语音</option>
              {availableVoices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </select>
            <span className="tts-hint">从浏览器检测到的本地发音人中选择（如微软 Xiaoxiao / 苹果婷婷等）</span>
          </div>

          <div className="form-row-sliders">
            <div className="form-group">
              <label>语速调节：{config.rate.toFixed(1)}x</label>
              <input
                type="range"
                min="0.7"
                max="1.5"
                step="0.1"
                value={config.rate}
                onChange={(e) => {
                  const updated = { ...config, rate: parseFloat(e.target.value) };
                  setConfig(updated);
                  saveTtsSettings(updated);
                }}
              />
            </div>

            <div className="form-group">
              <label>音调调节：{config.pitch.toFixed(1)}</label>
              <input
                type="range"
                min="0.8"
                max="1.2"
                step="0.1"
                value={config.pitch}
                onChange={(e) => {
                  const updated = { ...config, pitch: parseFloat(e.target.value) };
                  setConfig(updated);
                  saveTtsSettings(updated);
                }}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="tts-subpanel">
          <div className="form-group">
            <label htmlFor="tts-api-url">API Base URL</label>
            <input
              id="tts-api-url"
              type="text"
              className="tts-input"
              placeholder="https://api.openai.com/v1"
              value={config.apiUrl}
              onChange={(e) => {
                const updated = { ...config, apiUrl: e.target.value };
                setConfig(updated);
                saveTtsSettings(updated);
              }}
            />
          </div>

          <div className="form-group">
            <label htmlFor="tts-api-key">API Key（可选）</label>
            <input
              id="tts-api-key"
              type="password"
              className="tts-input"
              placeholder="sk-..."
              value={config.apiKey}
              onChange={(e) => {
                const updated = { ...config, apiKey: e.target.value };
                setConfig(updated);
                saveTtsSettings(updated);
              }}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="tts-api-model">模型 (Model)</label>
              <input
                id="tts-api-model"
                type="text"
                className="tts-input"
                placeholder="tts-1"
                value={config.apiModel}
                onChange={(e) => {
                  const updated = { ...config, apiModel: e.target.value };
                  setConfig(updated);
                  saveTtsSettings(updated);
                }}
              />
            </div>

            <div className="form-group">
              <label htmlFor="tts-api-voice">音色 (Voice)</label>
              <input
                id="tts-api-voice"
                type="text"
                className="tts-input"
                placeholder="alloy, echo, fable, onyx, nova, shimmer"
                value={config.apiVoice}
                onChange={(e) => {
                  const updated = { ...config, apiVoice: e.target.value };
                  setConfig(updated);
                  saveTtsSettings(updated);
                }}
              />
            </div>
          </div>
        </div>
      )}

      <div className="tts-actions-bar">
        <button
          type="button"
          className="secondary-btn tts-test-btn"
          onClick={handleTestPlay}
          disabled={isPlayingTest}
        >
          {isPlayingTest ? '🔊 正在试听中…' : '🔊 试听法官主持语音'}
        </button>

        <button type="submit" className="primary-btn tts-save-btn">
          保存 TTS 设置
        </button>
      </div>
    </form>
  );
}
