import React, { useState } from 'react';
import type { WerewolfSelfModel } from '../presentation.ts';
import { GameIcon } from '../../../shared-ui/GameIcon.tsx';

interface PrivateRolePanelProps {
  readonly self: WerewolfSelfModel | null;
  readonly synced: boolean;
}

export function PrivateRolePanel({ self, synced }: PrivateRolePanelProps) {
  const [revealed, setRevealed] = useState(false);

  if (self === null) {
    return (
      <aside className="werewolf-compact-role werewolf-compact-role--spectator" aria-label="观战中">
        <span className="werewolf-compact-role__icon">👁️</span>
        <span className="werewolf-compact-role__title">观战视角</span>
      </aside>
    );
  }

  return (
    <aside className={`werewolf-compact-role ${revealed ? 'is-revealed' : ''}`} aria-label="私密身份">
      <div className="werewolf-compact-role__main" onClick={() => setRevealed(!revealed)}>
        <div className="werewolf-compact-role__thumb-box">
          <img
            src={self.artworkUrl}
            alt={self.roleLabel}
            className={`werewolf-compact-role__thumb ${revealed ? 'is-clear' : 'is-blurred'}`}
          />
          {!revealed && <span className="werewolf-compact-role__lock">🔒</span>}
        </div>

        <div className="werewolf-compact-role__info">
          <div className="werewolf-compact-role__label-row">
            <span className="werewolf-compact-role__label">我的身份</span>
            <span className={`werewolf-compact-role__status-pill ${self.alive ? 'is-alive' : 'is-out'}`}>
              {self.alive ? '存活' : '已出局'}
            </span>
          </div>

          <div className="werewolf-compact-role__name-row">
            <strong className="werewolf-compact-role__name">
              {revealed ? self.roleLabel : '•••• (点击查看)'}
            </strong>
          </div>
        </div>

        <button
          type="button"
          className="werewolf-compact-role__toggle-btn"
          title={revealed ? '隐藏身份' : '查看私密身份'}
          onClick={(e) => {
            e.stopPropagation();
            setRevealed(!revealed);
          }}
        >
          {revealed ? '隐藏' : '查看'}
        </button>
      </div>

      {revealed && (
        <div className="werewolf-compact-role__popover" role="dialog" aria-label="身份详情">
          <div className="werewolf-compact-role__popover-header">
            <img src={self.artworkUrl} alt={self.roleLabel} className="werewolf-compact-role__popover-art" />
            <div>
              <h3>{self.roleLabel}</h3>
              <span className="werewolf-compact-role__popover-tag">{self.alive ? '存活中' : '已出局 (保留观战)'}</span>
            </div>
          </div>
          <p className="werewolf-compact-role__popover-hint">{self.roleHint}</p>
        </div>
      )}
    </aside>
  );
}
