import type { GameSetupSpec } from '@ldj/shared';
import { applySetupValue, type SetupConfig } from './setupState.ts';

interface GameSetupPanelProps {
  readonly setup: GameSetupSpec;
  readonly value: SetupConfig;
  readonly disabled?: boolean;
  readonly onChange: (next: SetupConfig) => void;
}

export function GameSetupPanel({ setup, value, disabled = false, onChange }: GameSetupPanelProps) {
  const update = (key: string, next: unknown) => onChange(applySetupValue(setup, value, key, next));
  return (
    <section className="tabletop-setup" aria-labelledby="tabletop-setup-title">
      <div className="tabletop-setup__heading"><span>HOUSE RULES</span><h2 id="tabletop-setup-title">本局规则</h2></div>
      <label><span>规则预设</span><select value={String(value.rulesetId)} disabled={disabled} onChange={(event) => update('rulesetId', event.target.value)}>{setup.rulesets.map((ruleset) => <option key={ruleset.id} value={ruleset.id}>{ruleset.label}</option>)}</select></label>
      {setup.options.map((option) => (
        <label key={option.key}>
          <span>{option.label}</span>
          {option.kind === 'select' && <select value={String(value[option.key])} disabled={disabled} onChange={(event) => update(option.key, event.target.value)}>{option.choices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}</select>}
          {option.kind === 'integer' && <input type="number" value={Number(value[option.key])} min={option.min} max={option.max} step={option.step} disabled={disabled} onChange={(event) => update(option.key, Number(event.target.value))} />}
          {option.kind === 'boolean' && <input type="checkbox" checked={Boolean(value[option.key])} disabled={disabled} onChange={(event) => update(option.key, event.target.checked)} />}
          {option.description && <small>{option.description}</small>}
        </label>
      ))}
    </section>
  );
}
