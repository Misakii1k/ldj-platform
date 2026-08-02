import { useRef, useState } from 'react';
import { SheetDialog } from './SheetDialog.tsx';
import { AiEngineSettings } from './ai-settings/AiEngineSettings.tsx';
import { AppearanceSettings } from './settings/AppearanceSettings.tsx';
import { BackgroundSettings } from './settings/BackgroundSettings.tsx';
import { SettingsNavigation } from './settings/SettingsNavigation.tsx';
import type { SettingsSectionId } from './settings/settingsNavigationState.ts';

interface SettingsSheetProps {
  onClose: () => void;
}

export function SettingsSheet({ onClose }: SettingsSheetProps) {
  const [activeSection, setActiveSection] = useState<SettingsSectionId>('ai');
  const firstTabRef = useRef<HTMLButtonElement | null>(null);

  return (
    <SheetDialog
      title="平台设置"
      description="管理 AI、动效与背景主题。"
      onClose={onClose}
      initialFocusRef={firstTabRef}
    >
      <div className="settings-layout">
        <SettingsNavigation activeSection={activeSection} onChange={setActiveSection} firstTabRef={firstTabRef} />
        <div className="settings-content">
          <section id="settings-panel-ai" role="tabpanel" aria-labelledby="settings-tab-ai" hidden={activeSection !== 'ai'}><AiEngineSettings /></section>
          <section id="settings-panel-appearance" role="tabpanel" aria-labelledby="settings-tab-appearance" hidden={activeSection !== 'appearance'}><AppearanceSettings /></section>
          <section id="settings-panel-background" role="tabpanel" aria-labelledby="settings-tab-background" hidden={activeSection !== 'background'}><BackgroundSettings /></section>
        </div>
      </div>
    </SheetDialog>
  );
}
