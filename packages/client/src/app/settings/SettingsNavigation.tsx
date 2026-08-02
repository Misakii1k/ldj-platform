import { useRef, type KeyboardEvent, type RefObject } from 'react';
import { SETTINGS_SECTIONS, nextSettingsSection, type SettingsSectionId } from './settingsNavigationState.ts';

interface SettingsNavigationProps {
  activeSection: SettingsSectionId;
  onChange: (section: SettingsSectionId) => void;
  firstTabRef: RefObject<HTMLButtonElement | null>;
}

export function SettingsNavigation({ activeSection, onChange, firstTabRef }: SettingsNavigationProps) {
  const tabRefs = useRef<Partial<Record<SettingsSectionId, HTMLButtonElement | null>>>({});

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const target = nextSettingsSection(activeSection, event.key);
    if (target === activeSection) return;
    event.preventDefault();
    onChange(target);
    tabRefs.current[target]?.focus();
  }

  return (
    <nav className="settings-navigation" aria-label="平台设置分类">
      <div className="settings-navigation__tabs" role="tablist">
        {SETTINGS_SECTIONS.map((section, index) => (
          <button
            key={section.id}
            id={`settings-tab-${section.id}`}
            ref={(element) => {
              tabRefs.current[section.id] = element;
              if (index === 0) firstTabRef.current = element;
            }}
            type="button"
            role="tab"
            className="settings-navigation__tab"
            aria-selected={activeSection === section.id}
            aria-controls={`settings-panel-${section.id}`}
            tabIndex={activeSection === section.id ? 0 : -1}
            onClick={() => onChange(section.id)}
            onKeyDown={handleKeyDown}
          >
            <strong>{section.label}</strong>
            <small>{section.description}</small>
          </button>
        ))}
      </div>
    </nav>
  );
}
