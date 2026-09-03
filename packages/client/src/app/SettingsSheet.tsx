import { useRef, useState } from 'react';
import { SheetDialog } from './SheetDialog.tsx';
import { AiEngineSettings } from './ai-settings/AiEngineSettings.tsx';
import { TtsSettings } from './tts-settings/TtsSettings.tsx';
import { ConnectionSettings } from './ConnectionSettings.tsx';
import { isNativeApp } from './nativePlatform.ts';

interface SettingsSheetProps {
  onClose: () => void;
}

type SettingsTab = 'ai' | 'tts' | 'connection';

export function SettingsSheet({ onClose }: SettingsSheetProps) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const native = isNativeApp();
  const [activeTab, setActiveTab] = useState<SettingsTab>('ai');

  return (
    <SheetDialog
      title="平台设置"
      description={native ? '管理连接、AI 陪练引擎与 TTS 智能法官语音配置。' : '管理 AI 陪练引擎与 TTS 智能法官语音配置。'}
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
          <span>AI 引擎</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'tts'}
          className={`settings-nav-tab ${activeTab === 'tts' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('tts')}
        >
          <span>语音 TTS</span>
        </button>

        {native && (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'connection'}
            className={`settings-nav-tab ${activeTab === 'connection' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('connection')}
          >
            <span>连接主机</span>
          </button>
        )}
      </div>

      <div className="settings-panel-content">
        {activeTab === 'ai' && <AiEngineSettings />}
        {activeTab === 'tts' && <TtsSettings />}
        {activeTab === 'connection' && native && <ConnectionSettings submitLabel="切换到该主机" />}
      </div>
    </SheetDialog>
  );
}
