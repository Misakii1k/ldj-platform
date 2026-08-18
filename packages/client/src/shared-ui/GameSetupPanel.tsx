import type { GameSetupSpec } from '@ldj/shared';
import { applySetupValue, type SetupConfig } from './setupState.ts';

interface GameSetupPanelProps {
  readonly setup: GameSetupSpec;
  readonly value: SetupConfig;
  readonly disabled?: boolean;
  /** compact：弹层/创建场景的紧凑布局（收敛开局配置时引入） */
  readonly variant?: 'default' | 'compact';
  readonly onChange: (next: SetupConfig) => void;
}

/**
 * 开局规则面板：所有游戏的玩法模式与选项统一采用「实体桌游点选芯片」与「步进器」呈现，
 * 彻底告别原生原生下拉框/勾选框，交互手感与视觉风格与《谁是卧底》完全一致。
 */
export function GameSetupPanel({ setup, value, disabled = false, variant = 'default', onChange }: GameSetupPanelProps) {
  const update = (key: string, next: unknown) => onChange(applySetupValue(setup, value, key, next));
  const compact = variant === 'compact';

  return (
    <section className={`tabletop-setup ${compact ? 'tabletop-setup--compact' : ''}`} aria-labelledby="tabletop-setup-title">
      <div className="tabletop-setup__heading"><h2 id="tabletop-setup-title">本局规则</h2></div>

      {setup.rulesets.length > 0 && (
        <div className="tabletop-setup__field">
          <span className="tabletop-setup__label" id="tabletop-setup-ruleset-label">玩法模式</span>
          <div className="setup-chips" role="radiogroup" aria-labelledby="tabletop-setup-ruleset-label">
            {setup.rulesets.map((ruleset) => {
              const isSelected = value.rulesetId === ruleset.id;
              return (
                <button
                  key={ruleset.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  className={`setup-chip ${isSelected ? 'is-selected' : ''}`}
                  disabled={disabled}
                  onClick={() => update('rulesetId', ruleset.id)}
                >
                  {ruleset.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {setup.options.map((option) => {
        const fieldId = `tabletop-setup-${option.key}-label`;

        return (
          <div className="tabletop-setup__field" key={option.key}>
            <span className="tabletop-setup__label" id={fieldId}>{option.label}</span>

            {/* 单选 / 分段芯片（统一替代原生 select 下拉框） */}
            {(option.kind === 'select' || option.kind === 'segmented') && (() => {
              const currentVal = value[option.key] !== undefined ? value[option.key] : option.defaultValue;
              return (
                <div className="setup-chips" role="radiogroup" aria-labelledby={fieldId}>
                  {option.choices.map((choice) => {
                    const isSelected = String(currentVal) === String(choice.value);
                    return (
                      <button
                        key={String(choice.value)}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        className={`setup-chip ${isSelected ? 'is-selected' : ''}`}
                        disabled={disabled}
                        onClick={() => update(option.key, choice.value)}
                      >
                        {choice.label}
                        {choice.value === option.defaultValue && <em className="setup-chip__badge">默认</em>}
                      </button>
                    );
                  })}
                </div>
              );
            })()}

            {/* 布尔开关芯片（统一替代原生 checkbox） */}
            {option.kind === 'boolean' && (() => {
              const currentBool = value[option.key] !== undefined ? Boolean(value[option.key]) : Boolean(option.defaultValue);
              return (
                <div className="setup-chips" role="radiogroup" aria-labelledby={fieldId}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={currentBool}
                    className={`setup-chip ${currentBool ? 'is-selected' : ''}`}
                    disabled={disabled}
                    onClick={() => update(option.key, true)}
                  >
                    开启
                    {option.defaultValue === true && <em className="setup-chip__badge">默认</em>}
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={!currentBool}
                    className={`setup-chip ${!currentBool ? 'is-selected' : ''}`}
                    disabled={disabled}
                    onClick={() => update(option.key, false)}
                  >
                    关闭
                    {option.defaultValue === false && <em className="setup-chip__badge">默认</em>}
                  </button>
                </div>
              );
            })()}

            {/* 数值步进器（统一替代原生 number 输入框） */}
            {option.kind === 'integer' && (() => {
              const rawVal = Number(value[option.key]);
              const currentVal = typeof value[option.key] !== 'undefined' && !Number.isNaN(rawVal) ? rawVal : Number(option.defaultValue);
              const min = option.min ?? 0;
              const max = option.max ?? 999;
              const step = option.step ?? 1;

              return (
                <div className="setup-stepper">
                  <button
                    type="button"
                    className="setup-stepper__btn"
                    disabled={disabled || currentVal <= min}
                    onClick={() => update(option.key, Math.max(min, currentVal - step))}
                    aria-label="减少"
                  >
                    −
                  </button>
                  <div className="setup-stepper__display">
                    <span className="setup-stepper__number">{currentVal}</span>
                    {option.label.includes('秒') ? <span className="setup-stepper__unit">秒</span> : null}
                    {option.label.includes('次') ? <span className="setup-stepper__unit">次</span> : null}
                    {option.label.includes('张') || option.label.includes('手牌') ? <span className="setup-stepper__unit">张</span> : null}
                    {option.label.includes('分') ? <span className="setup-stepper__unit">分</span> : null}
                  </div>
                  <button
                    type="button"
                    className="setup-stepper__btn"
                    disabled={disabled || currentVal >= max}
                    onClick={() => update(option.key, Math.min(max, currentVal + step))}
                    aria-label="增加"
                  >
                    +
                  </button>
                </div>
              );
            })()}

            {option.description && <small className="tabletop-setup__desc">{option.description}</small>}
          </div>
        );
      })}
    </section>
  );
}
