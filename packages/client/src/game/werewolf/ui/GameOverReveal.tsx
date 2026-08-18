import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import type { WerewolfPresentationModel } from '../presentation.ts';
import { UserAvatar } from '../../../user/UserAvatar.tsx';

const ROLE_ICONS: Record<string, string> = {
  狼人: '🐺',
  女巫: '🧙',
  预言家: '🔮',
  猎人: '🏹',
  守卫: '🛡️',
  村民: '🧑',
  白痴: '🃏',
};

const ROLE_CLASS: Record<string, string> = {
  狼人: 'role-wolf',
  女巫: 'role-witch',
  预言家: 'role-seer',
  猎人: 'role-hunter',
  守卫: 'role-guard',
  村民: 'role-villager',
  白痴: 'role-idiot',
};

interface GameOverRevealProps {
  readonly reveal: WerewolfPresentationModel['reveal'];
  readonly seats?: WerewolfPresentationModel['seats'];
}

export function GameOverReveal({ reveal, seats = [] }: GameOverRevealProps) {
  const [closed, setClosed] = useState(false);

  if (reveal === null) return null;

  const isWolfWin = reveal.headline.includes('狼人');

  // 若用户点击右上角叉号关闭了遮罩弹窗，则在牌桌中央展示重新打开复盘的醒目按钮
  if (closed) {
    return (
      <div className="werewolf-reopen-reveal-container">
        <button
          type="button"
          className="werewolf-reopen-reveal-btn"
          onClick={() => setClosed(false)}
          title="重新打开终局全员身份复盘遮罩"
        >
          📜 查看终局全员身份揭晓
        </button>
      </div>
    );
  }

  return (
    <>
      {/* 牌桌中央保留简要提示 */}
      <div className="werewolf-reopen-reveal-container">
        <button
          type="button"
          className="werewolf-reopen-reveal-btn"
          onClick={() => setClosed(false)}
        >
          📜 终局大揭晓（点击查看）
        </button>
      </div>

      {/* 独立遮罩弹层 (Portal to body)，不受移动端窄列限制，支持全景双列展开与随时关闭 */}
      {createPortal(
        <div className="werewolf-reveal-overlay" role="dialog" aria-modal="true" aria-label="终局全员身份复盘">
          <div className="werewolf-reveal-modal">
            {/* 右上角关闭叉号 */}
            <button
              type="button"
              className="werewolf-reveal__close-btn"
              onClick={() => setClosed(true)}
              title="关闭复盘遮罩，返回查看桌面与结算操作"
              aria-label="关闭"
            >
              ✕
            </button>

            <div className="werewolf-reveal__header">
              <span className="werewolf-reveal__tag">终局全员身份揭晓</span>
              <h2 className={`werewolf-reveal__headline ${isWolfWin ? 'winner-wolves' : 'winner-village'}`}>
                {isWolfWin ? '🐺 ' : '🌟 '}
                {reveal.headline}
              </h2>
            </div>

            <div className="werewolf-reveal__grid">
              {reveal.rows.map((row) => {
                const seat = seats.find((s) => s.name === row.name);
                const icon = ROLE_ICONS[row.roleLabel] ?? '🎭';
                const roleCls = ROLE_CLASS[row.roleLabel] ?? '';
                const isAlive = seat ? seat.alive : true;

                return (
                  <div
                    key={row.name}
                    className={`werewolf-reveal-card ${roleCls} ${!isAlive ? 'is-eliminated' : ''}`}
                  >
                    <div className="reveal-card__avatar">
                      <UserAvatar avatar={seat?.avatar ?? 'preset:fox'} nickname={row.name} size={36} />
                      {seat && <span className="reveal-card__seat">{seat.seatLabel}</span>}
                    </div>

                    <div className="reveal-card__info">
                      <span className="reveal-card__name" title={row.name}>{row.name}</span>
                      <div className="reveal-card__role">
                        <span className="role-icon" aria-hidden="true">{icon}</span>
                        <strong className="role-text">{row.roleLabel}</strong>
                      </div>
                    </div>

                    <span className={`reveal-card__status ${isAlive ? 'status-alive' : 'status-out'}`}>
                      {isAlive ? '存活' : '出局'}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* 底部收起按钮 */}
            <div className="werewolf-reveal__footer">
              <button
                type="button"
                className="werewolf-reveal__dismiss-btn"
                onClick={() => setClosed(true)}
              >
                收起复盘 · 查看桌局与准备再来一局 ➔
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
