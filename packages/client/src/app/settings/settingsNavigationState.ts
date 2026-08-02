export type SettingsSectionId = 'ai' | 'appearance' | 'background';

export const SETTINGS_SECTIONS = [
  { id: 'ai', label: 'AI 引擎', description: '连接服务、模型与推理参数' },
  { id: 'appearance', label: '界面效果', description: '调整动效与性能偏好' },
  { id: 'background', label: '背景主题', description: '选择桌面视觉主题' },
] as const;

export function nextSettingsSection(current: SettingsSectionId, key: string): SettingsSectionId {
  const index = SETTINGS_SECTIONS.findIndex((item) => item.id === current);
  if (key === 'Home') return SETTINGS_SECTIONS[0].id;
  if (key === 'End') return SETTINGS_SECTIONS[2].id;
  if (key === 'ArrowRight' || key === 'ArrowDown') return SETTINGS_SECTIONS[(index + 1) % SETTINGS_SECTIONS.length]!.id;
  if (key === 'ArrowLeft' || key === 'ArrowUp') return SETTINGS_SECTIONS[(index - 1 + SETTINGS_SECTIONS.length) % SETTINGS_SECTIONS.length]!.id;
  return current;
}
