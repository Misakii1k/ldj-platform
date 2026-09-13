import { useRef, useState } from 'react';
import { SheetDialog } from './SheetDialog.tsx';
import { AiEngineSettings } from './ai-settings/AiEngineSettings.tsx';
import { TtsSettings } from './tts-settings/TtsSettings.tsx';
import { ConnectionSettings } from './ConnectionSettings.tsx';
import { AboutUpdateSettings } from './AboutUpdateSettings.tsx';
import { isNativeApp } from './nativePlatform.ts';
import { useUpdateState } from './update/useUpdateState.ts';

interface SettingsSheetProps {
  onClose: () => void;
}

type SettingsTab = 'ai' | 'tts' | 'connection' | 'about';

export function SettingsSheet({ onClose }: SettingsSheetProps) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const native = isNativeApp();
  const [activeTab, setActiveTab] = useState<SettingsTab>('ai');
  const { hasNewUpdate } = useUpdateState();

  return (
    <SheetDialog
      title="平台设置"
      description={native ? '管理连接、AI 引擎、法官语音播报与版本更新。' : '管理 AI 引擎、法官语音播报与版本更新。'}
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

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'about'}
          className={`settings-nav-tab ${activeTab === 'about' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('about')}
        >
          <span>关于与更新</span>
          {hasNewUpdate && <span className="update-unread-dot" aria-label="有可用更新" />}
        </button>
      </div>

      <div className="settings-panel-content">
        {activeTab === 'ai' && <AiEngineSettings />}
        {activeTab === 'tts' && <TtsSettings />}
        {activeTab === 'connection' && native && <ConnectionSettings submitLabel="切换到该主机" />}
        {activeTab === 'about' && <AboutUpdateSettings />}
      </div>
    </SheetDialog>
  );
}
