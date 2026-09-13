import React from 'react';
import type { WerewolfActionGroup } from '../presentation.ts';

interface WerewolfActionPanelProps {
  readonly groups: readonly WerewolfActionGroup[];
  readonly waitingHint: string | null;
  readonly busy: boolean;
  readonly phaseKey: string;
  readonly onAct: (payload: unknown) => void;
}

function isTargetOption(option: { payload: Readonly<Record<string, unknown>> }): boolean {
  return typeof option.payload.targetPlayerId === 'string';
}

export function WerewolfActionPanel({ groups, waitingHint, busy, onAct }: WerewolfActionPanelProps) {
  // 目标型动作（投票放逐/查验/毒杀/守护/开枪/夜刀）改为点击席位头像后就地选择；
  // 底栏只保留非目标型选项（弃票、不使用道具、确认、结束发言等）。
  const dockGroups = groups.map((group) => ({
    ...group,
    options: group.options.filter((option) => !isTargetOption(option)),
  }));
  const hasAnyDockOption = dockGroups.some((group) => group.options.length > 0);

  if (groups.length === 0 || !hasAnyDockOption) {
    if (!waitingHint && groups.length === 0) return null;
    const targetOnly = groups.length > 0 && groups.every((group) => group.options.length > 0 && group.options.every(isTargetOption));
    return (
      <section className="werewolf-actions werewolf-actions--waiting" aria-live="polite" aria-label="可执行操作">
        <span className="werewolf-actions__waiting-dot" />
        <span className="werewolf-actions__waiting-text">{targetOnly ? '点击席位头像，选择你的目标' : waitingHint}</span>
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
      {dockGroups.map((group) => (
        <div key={group.id} className="werewolf-actions__group">
          <div className="werewolf-actions__header-line">
            <h2 className="werewolf-actions__title">{group.title}</h2>
            {group.hint && <span className="werewolf-actions__hint">{group.hint}</span>}
          </div>

          {group.options.length === 0 ? (
            <p className="werewolf-actions__empty">点击席位头像选择目标</p>
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
