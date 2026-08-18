import { useRef } from 'react';
import { SheetDialog } from './SheetDialog.tsx';
import { AiEngineSettings } from './ai-settings/AiEngineSettings.tsx';

interface SettingsSheetProps {
  onClose: () => void;
}

export function SettingsSheet({ onClose }: SettingsSheetProps) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  return (
    <SheetDialog
      title="平台设置"
      description="管理 AI 陪练引擎、模型与推理服务参数。"
      onClose={onClose}
      initialFocusRef={closeButtonRef}
    >
      <div className="settings-single-panel">
        <AiEngineSettings />
      </div>
    </SheetDialog>
  );
}
