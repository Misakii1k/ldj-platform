import type { ApiProfile } from './types.ts';

interface AiProfilePickerProps {
  profiles: readonly ApiProfile[];
  selectedId: string;
  disabled: boolean;
  creating: boolean;
  newName: string;
  onApply: (profile: ApiProfile) => void;
  onDelete: (profile: ApiProfile) => void;
  onCreatingChange: (creating: boolean) => void;
  onNewNameChange: (name: string) => void;
  onCreate: () => void;
}

export function AiProfilePicker(props: AiProfilePickerProps) {
  const { profiles, selectedId, disabled, creating, newName, onApply, onDelete, onCreatingChange, onNewNameChange, onCreate } = props;
  return (
    <section className="ai-profile-picker" aria-labelledby="ai-profile-title">
      <div className="ai-section-heading">
        <div><span className="ai-eyebrow">快捷预设</span><h3 id="ai-profile-title">选择一个起点</h3></div>
        <button type="button" className="ai-text-action" onClick={() => onCreatingChange(!creating)} disabled={disabled}>存为新预设</button>
      </div>
      <div className="settings-profiles-list">
        {profiles.map((profile) => (
          <div key={profile.id} className={`settings-profile-chip ${selectedId === profile.id ? 'is-active' : ''}`}>
            <button type="button" onClick={() => onApply(profile)} disabled={disabled}>{profile.name}</button>
            {!profile.builtIn && (
              <button type="button" className="settings-profile-delete" aria-label={`删除预设 ${profile.name}`} onClick={() => onDelete(profile)} disabled={disabled}>×</button>
            )}
          </div>
        ))}
      </div>
      {creating && (
        <div className="settings-profile-save-box">
          <input value={newName} onChange={(event) => onNewNameChange(event.target.value)} placeholder="预设名称" maxLength={64} aria-label="新预设名称" />
          <button type="button" onClick={onCreate}>保存</button>
          <button type="button" onClick={() => onCreatingChange(false)}>取消</button>
        </div>
      )}
    </section>
  );
}
