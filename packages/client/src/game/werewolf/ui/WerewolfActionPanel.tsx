import React from 'react';
import { GameActionFeedback } from '../../../shared-ui/GameMotion.tsx';
import type { WerewolfActionGroup } from '../presentation.ts';

interface WerewolfActionPanelProps {
  readonly groups: readonly WerewolfActionGroup[];
  readonly waitingHint: string | null;
  readonly busy: boolean;
  readonly phaseKey: string;
  readonly onAct: (payload: unknown) => void;
}

export function WerewolfActionPanel({ groups, waitingHint, busy, phaseKey, onAct }: WerewolfActionPanelProps) {
  if (groups.length === 0) {
    if (!waitingHint) return null;
    return (
      <section className="werewolf-actions werewolf-actions--waiting" aria-live="polite">
        <span className="werewolf-actions__waiting-dot" />
        <span className="werewolf-actions__waiting-text">{waitingHint}</span>
      </section>
    );
  }

  return (
    <section className="werewolf-actions" aria-label="可执行操作" aria-busy={busy} data-busy={busy || undefined}>
      {busy && (
        <div className="werewolf-actions__busy-hint">
          <span className="werewolf-actions__waiting-dot" />
          <span>处理中…</span>
        </div>
      )}
      {groups.map((group) => (
        <div key={group.id} className="werewolf-actions__group">
          <div className="werewolf-actions__header-line">
            <h2 className="werewolf-actions__title">{group.title}</h2>
            {group.hint && <span className="werewolf-actions__hint">{group.hint}</span>}
          </div>

          {group.options.length === 0 ? (
            <p className="werewolf-actions__empty">暂无可选目标</p>
          ) : (
            <div className="werewolf-actions__options">
              {group.options.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`werewolf-action-btn ${option.id === 'confirm' || option.id === 'done' ? 'werewolf-action-btn--primary' : ''}`}
                  disabled={busy}
                  onClick={() => onAct(option.payload)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
