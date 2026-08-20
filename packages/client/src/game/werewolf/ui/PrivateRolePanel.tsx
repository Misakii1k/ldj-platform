import React, { useState } from 'react';
import type { WerewolfSelfModel } from '../presentation.ts';
import { IdentityFlipCard } from '../../../shared-ui/IdentityFlipCard.tsx';

interface PrivateRolePanelProps {
  readonly self: WerewolfSelfModel | null;
  readonly synced: boolean;
}

export function PrivateRolePanel({ self, synced: _synced }: PrivateRolePanelProps) {
  const [showDetail, setShowDetail] = useState(false);

  if (self === null) {
    return (
      <aside className="werewolf-compact-role werewolf-compact-role--spectator" aria-label="观战中">
        <span className="werewolf-compact-role__icon">👁️</span>
        <span className="werewolf-compact-role__title">观战视角</span>
      </aside>
    );
  }

  const isWolf = self.role === 'wolf';

  return (
    <aside className={`werewolf-compact-role is-revealed`} aria-label="身份牌">
      <div className="werewolf-compact-role__main" onClick={() => setShowDetail(!showDetail)}>
        <div className="werewolf-compact-role__thumb-box">
          <img
            src={self.artworkUrl}
            alt={self.roleLabel}
            className="werewolf-compact-role__thumb is-clear"
          />
        </div>

        <div className="werewolf-compact-role__info">
          <div className="werewolf-compact-role__label-row">
            <span className="werewolf-compact-role__label">身份牌</span>
            <span className={`werewolf-compact-role__status-pill ${self.alive ? 'is-alive' : 'is-out'}`}>
              {self.alive ? '存活' : '已出局'}
            </span>
          </div>

          <div className="werewolf-compact-role__name-row">
            <strong className="werewolf-compact-role__name">
              {self.roleLabel}
            </strong>
          </div>
        </div>

        <button
          type="button"
          className="werewolf-compact-role__toggle-btn"
          title={showDetail ? '收起卡牌' : '查看身份卡牌'}
          onClick={(e) => {
            e.stopPropagation();
            setShowDetail(!showDetail);
          }}
        >
          {showDetail ? '收起' : '详情'}
        </button>
      </div>

      {showDetail && (
        <div className="werewolf-compact-role__popover" role="dialog" aria-label="身份详情">
          <IdentityFlipCard
            theme="gothic"
            variant="compact"
            roleName={self.roleLabel}
            roleSubtitle={isWolf ? '狼人阵营' : '好人阵营'}
            roleCamp={isWolf ? 'evil' : 'good'}
            artworkUrl={self.artworkUrl}
            secretHints={[self.roleHint]}
            canInteract={true}
          />
        </div>
      )}
    </aside>
  );
}
