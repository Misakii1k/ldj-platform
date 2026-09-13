import { useEffect, useState, type FormEvent } from 'react';
import { useToast } from '../../shared-ui/ToastContext.tsx';
import { loadTtsSettings, saveTtsSettings, speakText, stopPlayback } from './ttsManager.ts';
import type { TtsEngineType, TtsSettingsConfig } from './types.ts';
import { Volume2, VolumeX, Smartphone, Globe, Sparkles, Check, Info, Eye, EyeOff } from 'lucide-react';
import './tts-settings.css';

export function TtsSettings() {
  const { showToast } = useToast();
  const [config, setConfig] = useState<TtsSettingsConfig>(loadTtsSettings);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [isPlayingTest, setIsPlayingTest] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

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
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', updateVoices);
      stopPlayback();
    };
  }, []);

  const handleEngineChange = (engine: TtsEngineType) => {
    const updated = { ...config, engine };
    setConfig(updated);
    saveTtsSettings(updated);
  };

  const handleSave = (e: FormEvent) => {
    e.preventDefault();
    saveTtsSettings(config);
    showToast('TTS 语音设置已保存', 'success');
  };

  const handleTestPlayToggle = async () => {
    if (isPlayingTest) {
      stopPlayback();
      setIsPlayingTest(false);
      return;
    }
    setIsPlayingTest(true);
    try {
      await speakText('天黑请闭眼，所有人扣紧骰盅。现在是夜间 1 点，请 1 点的玩家睁眼。', config, true);
    } finally {
      setTimeout(() => setIsPlayingTest(false), 2600);
    }
  };

  return (
    <form className="tts-settings-form" onSubmit={handleSave}>
      {/* 1. 状态总览卡片 */}
      <div className="tts-status-card">
        <div className="tts-status-header">
          <span className="tts-status-title">
            <Volume2 size={18} />
            法官语音播报引擎
          </span>
          <span className="tts-status-badge">
            <span className="tts-status-dot" />
            <span className="tts-status-text">
              {config.engine === 'system_tts'
                ? '系统原生 TTS'
                : config.engine === 'web_speech'
                ? '浏览器 Web 语音'
                : '第三方 / 兼容 API'}
            </span>
          </span>
        </div>
        <p className="tts-status-desc">
          {config.engine === 'system_tts' &&
            '使用 Android 手机系统内置语音（小爱、华为、Google 等），免配置、免流量且超低延迟。'}
          {config.engine === 'web_speech' &&
            `使用浏览器 HTML5 语音合成接口，当前检测到 ${availableVoices.length} 位可用系统发音人。`}
          {config.engine === 'custom_api' &&
            '通过远端大模型 TTS 兼容端点实时生成高保真拟真声音，适合沉浸式剧情对局。'}
        </p>
      </div>

      {/* 2. 引擎选择区（统一 .choice-card 规范） */}
      <div className="tts-section">
        <div className="tts-section-label">
          <span>选择语音引擎</span>
        </div>
        <div className="tts-engine-grid">
          <button
            type="button"
            className={`choice-card ${config.engine === 'system_tts' ? 'is-selected' : ''}`}
            onClick={() => handleEngineChange('system_tts')}
          >
            <div className="choice-card-header">
              <Smartphone size={18} className="choice-card-icon" />
              <span className="choice-card-title">系统原生 TTS</span>
              <span className="choice-badge">推荐</span>
            </div>
            <p className="choice-card-desc">
              系统内置引擎，离线可用且零网络延迟。
            </p>
          </button>

          <button
            type="button"
            className={`choice-card ${config.engine === 'web_speech' ? 'is-selected' : ''}`}
            onClick={() => handleEngineChange('web_speech')}
          >
            <div className="choice-card-header">
              <Globe size={18} className="choice-card-icon" />
              <span className="choice-card-title">浏览器语音</span>
              {config.engine === 'web_speech' && (
                <span className="choice-badge is-active-badge">当前</span>
              )}
            </div>
            <p className="choice-card-desc">
              网页标准发音，支持本地多发音人切换。
            </p>
          </button>

          <button
            type="button"
            className={`choice-card ${config.engine === 'custom_api' ? 'is-selected' : ''}`}
            onClick={() => handleEngineChange('custom_api')}
          >
            <div className="choice-card-header">
              <Sparkles size={18} className="choice-card-icon" />
              <span className="choice-card-title">自定义 API</span>
              {config.engine === 'custom_api' && (
                <span className="choice-badge is-active-badge">当前</span>
              )}
            </div>
            <p className="choice-card-desc">
              OpenAI / CosyVoice 兼容端点，音质自然。
            </p>
          </button>
        </div>
      </div>

      {/* 3. 参数配置子面板 */}
      {config.engine === 'system_tts' ? (
        <div className="tts-subpanel">
          <div className="tts-tip-banner">
            <Info size={16} />
            <span>
              已启用系统原生 Text-To-Speech 服务。将直接使用 Android 手机系统内置的语音引擎（如小米小爱、华为、Google 语音服务等）进行法官主持与播报。
            </span>
          </div>

          <div className="form-row-sliders">
            <div className="form-group">
              <div className="tts-slider-header">
                <span className="tts-slider-title">语速调节</span>
                <span className="tts-slider-badge">{config.rate.toFixed(1)}x</span>
              </div>
              <input
                type="range"
                className="tactile-range"
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
              <div className="tts-slider-header">
                <span className="tts-slider-title">音调调节</span>
                <span className="tts-slider-badge">{config.pitch.toFixed(1)}</span>
              </div>
              <input
                type="range"
                className="tactile-range"
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
      ) : config.engine === 'web_speech' ? (
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
              <div className="tts-slider-header">
                <span className="tts-slider-title">语速调节</span>
                <span className="tts-slider-badge">{config.rate.toFixed(1)}x</span>
              </div>
              <input
                type="range"
                className="tactile-range"
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
              <div className="tts-slider-header">
                <span className="tts-slider-title">音调调节</span>
                <span className="tts-slider-badge">{config.pitch.toFixed(1)}</span>
              </div>
              <input
                type="range"
                className="tactile-range"
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
            <div className="tts-preset-chips">
              <span className="tts-preset-label">快捷预设:</span>
              <button
                type="button"
                className="tts-preset-chip"
                onClick={() => {
                  const updated = {
                    ...config,
                    apiUrl: 'https://api.openai.com/v1',
                    apiModel: 'tts-1',
                    apiVoice: 'alloy',
                  };
                  setConfig(updated);
                  saveTtsSettings(updated);
                  showToast('已填入 OpenAI 官方 TTS 预设', 'success');
                }}
              >
                OpenAI 官方
              </button>
              <button
                type="button"
                className="tts-preset-chip"
                onClick={() => {
                  const updated = {
                    ...config,
                    apiUrl: 'https://api.siliconflow.cn/v1',
                    apiModel: 'FunAudioLLM/CosyVoice2-0.5B',
                    apiVoice: 'FunAudioLLM/CosyVoice2-0.5B:alex',
                  };
                  setConfig(updated);
                  saveTtsSettings(updated);
                  showToast('已填入硅基流动 CosyVoice 预设', 'success');
                }}
              >
                硅基流动 CosyVoice
              </button>
            </div>
          </div>

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
            <div className="tts-key-input-wrap">
              <input
                id="tts-api-key"
                type={showApiKey ? 'text' : 'password'}
                className="tts-input"
                placeholder="sk-..."
                value={config.apiKey}
                onChange={(e) => {
                  const updated = { ...config, apiKey: e.target.value };
                  setConfig(updated);
                  saveTtsSettings(updated);
                }}
              />
              <button
                type="button"
                className="tts-key-toggle-btn"
                onClick={() => setShowApiKey((v) => !v)}
                aria-label={showApiKey ? '隐藏 API Key' : '查看 API Key'}
              >
                {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
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
                placeholder="alloy, echo, alex"
                value={config.apiVoice}
                onChange={(e) => {
                  const updated = { ...config, apiVoice: e.target.value };
                  setConfig(updated);
                  saveTtsSettings(updated);
                }}
              />
            </div>
          </div>

          <div className="form-group">
            <div className="tts-slider-header">
              <span className="tts-slider-title">语速倍率</span>
              <span className="tts-slider-badge">{config.rate.toFixed(1)}x</span>
            </div>
            <input
              type="range"
              className="tactile-range"
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
        </div>
      )}

      {/* 4. 底部操作栏 */}
      <div className="tts-actions-bar">
        <button
          type="button"
          className={`secondary-btn tts-test-btn ${isPlayingTest ? 'is-playing' : ''}`}
          onClick={handleTestPlayToggle}
        >
          {isPlayingTest ? <VolumeX size={16} /> : <Volume2 size={16} />}
          <span>{isPlayingTest ? '停止试听' : '试听法官主持语音'}</span>
        </button>

        <button type="submit" className="primary-btn tts-save-btn">
          <Check size={16} />
          <span>保存 TTS 设置</span>
        </button>
      </div>
    </form>
  );
}
