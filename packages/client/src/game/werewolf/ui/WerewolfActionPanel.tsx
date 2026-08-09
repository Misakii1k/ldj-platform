import type { WerewolfActionGroup } from '../presentation.ts';

interface WerewolfActionPanelProps {
  readonly groups: readonly WerewolfActionGroup[];
  readonly waitingHint: string | null;
  readonly busy: boolean;
  readonly onAct: (payload: unknown) => void;
}

export function WerewolfActionPanel({ groups, waitingHint, busy, onAct }: WerewolfActionPanelProps) {
  if (groups.length === 0) {
    return waitingHint === null ? null : (
      <section className="werewolf-actions werewolf-actions--waiting" aria-live="polite">
        <p>{waitingHint}</p>
      </section>
    );
  }

  return (
    <section className="werewolf-actions" aria-label="可执行操作" aria-busy={busy} data-busy={busy || undefined}>
      {busy && <p className="werewolf-actions__busy" role="status">正在提交本次选择…</p>}
      {groups.map((group) => (
        <div key={group.id} className="werewolf-actions__group">
          <h2>{group.title}</h2>
          {group.hint && <p className="werewolf-actions__hint">{group.hint}</p>}
          {group.options.length === 0 ? (
            <p className="werewolf-actions__hint">没有可选目标</p>
          ) : (
            <div className="werewolf-actions__options">
              {group.options.map((option) => (
                <button
                  key={option.id}
                  type="button"
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
