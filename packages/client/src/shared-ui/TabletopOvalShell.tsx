import React, { useState } from 'react';
import { GameLeaveButton } from '../game/GameLeaveButton.tsx';
import { webAudio } from './WebAudioManager.ts';

export interface PlayerSeat {
  id: string;
  name: string;
  avatarUrl?: string;
  isCurrentTurn?: boolean;
  isSpeaking?: boolean;
  isEliminated?: boolean;
  isReady?: boolean;
  isHost?: boolean;
  roleTag?: string;
  score?: number;
  badge?: string;
  handCount?: number;
}

export interface TabletopOvalShellProps {
  title: string;
  subtitle?: string;
  theme?: 'mystery' | 'poker' | 'party' | 'court';
  players: PlayerSeat[];
  currentUserId?: string;
  centerArena: React.ReactNode;
  bottomBar?: React.ReactNode;
  topRightControls?: React.ReactNode;
  phaseBannerText?: string;
  phaseBannerSubtext?: string;
}

export function TabletopOvalShell({
  title,
  subtitle,
  theme = 'poker',
  players,
  currentUserId,
  centerArena,
  bottomBar,
  topRightControls,
  phaseBannerText,
  phaseBannerSubtext,
}: TabletopOvalShellProps) {
  const [muted, setMuted] = useState(webAudio.isMuted());

  const toggleSound = () => {
    const next = !muted;
    webAudio.setMuted(next);
    setMuted(next);
  };

  // 环形摆座计算 (将其他玩家环状排列在桌上，当前玩家坐底部)
  const sortedPlayers = [...players];
  const meIndex = sortedPlayers.findIndex((p) => p.id === currentUserId);
  let orderedPlayers = sortedPlayers;

  if (meIndex > 0) {
    orderedPlayers = [
      ...sortedPlayers.slice(meIndex),
      ...sortedPlayers.slice(0, meIndex),
    ];
  }

  // 环形位置映射
  const getSeatPositionStyle = (index: number, total: number): React.CSSProperties => {
    if (total <= 1) return { top: '5%', left: '50%', transform: 'translateX(-50%)' };
    
    // 底部是 index 0
    const angle = (index / total) * 2 * Math.PI + Math.PI / 2; // 0 在底部 (90deg)
    // 椭圆半径%
    const rx = 42; // x 轴半径 %
    const ry = 36; // y 轴半径 %

    const x = 50 + rx * Math.cos(angle);
    const y = 48 + ry * Math.sin(angle);

    return {
      left: `${x.toFixed(1)}%`,
      top: `${y.toFixed(1)}%`,
      transform: 'translate(-50%, -50%)',
    };
  };

  return (
    <div className={`tabletop-shell tabletop-theme-${theme}`}>
      {/* 顶栏控制 */}
      <header className="tabletop-header">
        <div className="tabletop-header__info">
          <span className="tabletop-header__kicker">局域网桌游</span>
          <h1 className="tabletop-header__title">{title}</h1>
          {subtitle && <p className="tabletop-header__sub">{subtitle}</p>}
        </div>

        <div className="tabletop-header__actions">
          {topRightControls}
          <button
            type="button"
            className="tabletop-sound-btn"
            onClick={toggleSound}
            title={muted ? '开启静音' : '关闭静音'}
          >
            {muted ? '🔇 音效关' : '🔊 音效开'}
          </button>
          <GameLeaveButton />
        </div>
      </header>

      {/* 沉浸式环形桌面区域 */}
      <div className="tabletop-arena-container">
        {/* 椭圆桌面画框 */}
        <div className="tabletop-oval-felt">
          {/* 阶段通知条 */}
          {(phaseBannerText || phaseBannerSubtext) && (
            <div className="tabletop-phase-banner">
              {phaseBannerText && <div className="tabletop-phase-banner__title">{phaseBannerText}</div>}
              {phaseBannerSubtext && <div className="tabletop-phase-banner__sub">{phaseBannerSubtext}</div>}
            </div>
          )}

          {/* 环形座位环 */}
          <div className="tabletop-seats-ring">
            {orderedPlayers.map((player, idx) => {
              const isMe = player.id === currentUserId;
              const posStyle = getSeatPositionStyle(idx, orderedPlayers.length);

              return (
                <div
                  key={player.id}
                  className={`tabletop-seat ${player.isCurrentTurn ? 'tabletop-seat--active-turn' : ''} ${
                    player.isSpeaking ? 'tabletop-seat--speaking' : ''
                  } ${player.isEliminated ? 'tabletop-seat--eliminated' : ''} ${
                    isMe ? 'tabletop-seat--me' : ''
                  }`}
                  style={posStyle}
                >
                  <div className="tabletop-avatar-box">
                    <div className="tabletop-avatar-inner">
                      {player.avatarUrl ? (
                        <img src={player.avatarUrl} alt={player.name} />
                      ) : (
                        <span className="tabletop-avatar-char">{player.name.slice(0, 1)}</span>
                      )}
                    </div>

                    {player.isCurrentTurn && <div className="tabletop-turn-halo" />}
                    {player.isSpeaking && <div className="tabletop-speech-wave" />}

                    {player.handCount !== undefined && player.handCount >= 0 && (
                      <span className="tabletop-hand-badge" title="持牌数">
                        🃏 {player.handCount}
                      </span>
                    )}

                    {player.badge && <span className="tabletop-custom-badge">{player.badge}</span>}
                  </div>

                  <div className="tabletop-seat-info">
                    <span className="tabletop-seat-name">{player.name} {isMe ? '(我)' : ''}</span>
                    {player.roleTag && <span className="tabletop-role-tag">{player.roleTag}</span>}
                    {player.score !== undefined && <span className="tabletop-seat-score">得分: {player.score}</span>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 椭圆中心竞技/广播区域 */}
          <div className="tabletop-center-content">{centerArena}</div>
        </div>
      </div>

      {/* 底部玩家专属控制/手牌面板 */}
      {bottomBar && <footer className="tabletop-bottom-bar">{bottomBar}</footer>}
    </div>
  );
}
