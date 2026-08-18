import { useRef, useState } from 'react';
import { SheetDialog } from './SheetDialog.tsx';
import { AiEngineSettings } from './ai-settings/AiEngineSettings.tsx';
import { TtsSettings } from './tts-settings/TtsSettings.tsx';

interface SettingsSheetProps {
  onClose: () => void;
}

export function SettingsSheet({ onClose }: SettingsSheetProps) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const [activeTab, setActiveTab] = useState<'ai' | 'tts'>('ai');

  return (
    <SheetDialog
      title="平台设置"
      description="管理 AI 陪练引擎与 TTS 智能法官语音配置。"
      onClose={onClose}
      initialFocusRef={closeButtonRef}
    >
      <div className="settings-nav-tabs" role="tablist" aria-label="设置分类">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'ai'}
          className={`settings-nav-tab ${activeTab === 'ai' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('ai')}
        >
          <span className="tab-icon">🤖</span>
          <span>AI 陪练引擎</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'tts'}
          className={`settings-nav-tab ${activeTab === 'tts' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('tts')}
        >
          <span className="tab-icon">🎙️</span>
          <span>语音法官 TTS</span>
        </button>
      </div>

      <div className="settings-panel-content">
        {activeTab === 'ai' ? <AiEngineSettings /> : <TtsSettings />}
      </div>
    </SheetDialog>
  );
}
