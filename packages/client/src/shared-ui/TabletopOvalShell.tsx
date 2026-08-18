import React, { useEffect, useState, type ReactNode } from 'react';
import { webAudio } from './WebAudioManager.ts';
import { GameIcon } from './GameIcon.tsx';
import { UserAvatar } from '../user/UserAvatar.tsx';
import { useUserProfile } from '../user/UserProfileContext.tsx';
import { useConnection } from '../connection/useConnection.ts';

export interface PlayerSeat {
  id: string;
  name: string;
  avatar?: string;
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

/** 横屏矮视口（如 844x390 手机横屏）：椭圆座位环在矮毛毡上必然互相侵占，改用顶部座位条。 */
function useLandscapeShort(): boolean {
  const [short, setShort] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(orientation: landscape) and (max-height: 520px)');
    const update = () => setShort(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return short;
}

/** felt 主题：poker（牌桌绿）、mystery（机密茄紫）、party（星空紫）、court（判庭蓝黑）、tribunal（暗夜羊皮纸）、orchard（果园夜）、meadow（磡草晴）、letter（信笺宫廷）、night（虫月夜）、arena（金铃竞技） */
export type TabletopTheme =
  | 'mystery' | 'poker' | 'party' | 'court' | 'tribunal'
  | 'orchard' | 'meadow' | 'letter' | 'night' | 'arena'
  | 'tribunal-day' | 'tribunal-night' | 'tribunal-dawn';

export interface TabletopOvalShellProps {
  title: string;
  subtitle?: string;
  theme?: TabletopTheme;
  players: PlayerSeat[];
  currentUserId?: string;
  centerArena: React.ReactNode;
  bottomBar?: React.ReactNode;
  topRightControls?: ReactNode;
  phaseBannerText?: string;
  phaseBannerSubtext?: string;
  hideSeats?: boolean;
  /**
   * 中心舞台空间：
   * - 'safe'（默认）：压缩中心区避让环形座位（弃牌堆等小块内容）；
   * - 'arena'：舞台占满椭圆纵向空间、两侧让开座位（卡片为主要交互的阶段面板，如谁是卧底）。
   */
  stageFit?: 'safe' | 'arena';
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
  hideSeats = false,
  stageFit = 'safe',
}: TabletopOvalShellProps) {
  const { profile } = useUserProfile();
  const { state } = useConnection();
  const [muted, setMuted] = useState(webAudio.isMuted());
  const members = state.room?.members ?? [];

  const toggleSound = () => {
    const next = !muted;
    webAudio.setMuted(next);
    setMuted(next);
  };

  const sortedPlayers = [...players];
  const meIndex = sortedPlayers.findIndex((p) => p.id === currentUserId);
  let orderedPlayers = sortedPlayers;

  if (meIndex > 0) {
    orderedPlayers = [
      ...sortedPlayers.slice(meIndex),
      ...sortedPlayers.slice(0, meIndex),
    ];
  }

  const dense = players.length >= 8;

  const renderSeatChip = (player: (typeof orderedPlayers)[number]) => {
    const isMe = player.id === currentUserId;
    const member = members.find((m) => m.playerId === player.id);
    const resolvedAvatar = player.avatar || player.avatarUrl || member?.avatar || (isMe ? profile.avatar : 'preset:fox');

    return (
      <div
        key={player.id}
        className={`tabletop-seat tabletop-seat--chip ${player.isCurrentTurn ? 'tabletop-seat--active-turn' : ''} ${
          player.isSpeaking ? 'tabletop-seat--speaking' : ''
        } ${player.isEliminated ? 'tabletop-seat--eliminated' : ''} ${
          isMe ? 'tabletop-seat--me' : ''
        }`}
      >
        <div className="tabletop-avatar-box">
          <UserAvatar
            avatar={resolvedAvatar}
            nickname={player.name}
            size={28}
            className="tabletop-avatar-img"
          />

          {player.isCurrentTurn && <div className="tabletop-turn-halo" />}
          {player.isSpeaking && <div className="tabletop-speech-wave" />}

          {player.handCount !== undefined && player.handCount >= 0 && (
            <span className="tabletop-hand-badge" title="持牌数">
              <GameIcon name="cards_deck" size={13} style={{ marginRight: '3px' }} />
              {player.handCount}
            </span>
          )}
        </div>

        <div className="tabletop-seat-info">
          <span className="tabletop-seat-name">{player.name} {isMe ? '(我)' : ''}</span>
          {player.badge && <span className="tabletop-custom-badge">{player.badge}</span>}
          {player.roleTag && <span className="tabletop-role-tag">{player.roleTag}</span>}
          {player.score !== undefined && <span className="tabletop-seat-score">得分: {player.score}</span>}
        </div>
      </div>
    );
  };

  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>(() => {
    const saved = localStorage.getItem('ldj_tabletop_orientation');
    if (saved === 'portrait' || saved === 'landscape') return saved;
    return 'portrait';
  });

  const toggleOrientation = () => {
    setOrientation((prev) => {
      const next = prev === 'portrait' ? 'landscape' : 'portrait';
      localStorage.setItem('ldj_tabletop_orientation', next);
      return next;
    });
  };

  return (
    <div className={`tabletop-shell tabletop-theme-${theme} tabletop-shell--${orientation} ${dense ? 'tabletop-shell--dense' : ''}`}>
      {/* 顶栏控制（超紧凑空间） */}
      <header className="tabletop-header">
        <div className="tabletop-header__info">
          <div className="tabletop-header__title-row">
            <span className="tabletop-header__kicker">局域网桌游</span>
            <h1 className="tabletop-header__title">{title}</h1>
          </div>
          {subtitle && <p className="tabletop-header__sub">{subtitle}</p>}
        </div>

        {/* 玩家列表席位条（直接嵌入顶栏中心，当显式 hideSeats 时消除） */}
        {!hideSeats && orderedPlayers.length > 0 && (
          <div className="tabletop-seats-bar" aria-label="玩家席位">
            {orderedPlayers.map((player) => renderSeatChip(player))}
          </div>
        )}

        <div className="tabletop-header__actions">
          {topRightControls}
          <button
            type="button"
            className="tabletop-sound-btn tabletop-orient-btn"
            onClick={toggleOrientation}
            title={orientation === 'landscape' ? '切换为竖屏紧凑模式' : '切换为横屏宽幅模式'}
            aria-label={orientation === 'landscape' ? '切换为竖屏紧凑模式' : '切换为横屏宽幅模式'}
          >
            <span className="tabletop-sound-btn__icon" aria-hidden="true">
              <GameIcon name="cards_deck" size={16} />
            </span>
            <span className="tabletop-sound-btn__label">{orientation === 'landscape' ? '切竖屏' : '切横屏'}</span>
          </button>
          <button
            type="button"
            className="tabletop-sound-btn"
            onClick={toggleSound}
            title={muted ? '开启静音' : '关闭静音'}
            aria-label={muted ? '开启静音' : '关闭静音'}
          >
            <span className="tabletop-sound-btn__icon" aria-hidden="true">
              <GameIcon name={muted ? 'sound_off' : 'sound_on'} size={16} />
            </span>
            <span className="tabletop-sound-btn__label">{muted ? '音效关' : '音效开'}</span>
          </button>
        </div>
      </header>

      {/* 沉浸式游戏舞台全景区域（无桌子边界限制） */}
      <main className="tabletop-arena-container">
        {/* 阶段通知条 */}
        {(phaseBannerText || phaseBannerSubtext) && (
          <div className="tabletop-phase-banner">
            {phaseBannerText && <div className="tabletop-phase-banner__title">{phaseBannerText}</div>}
            {phaseBannerSubtext && <div className="tabletop-phase-banner__sub">{phaseBannerSubtext}</div>}
          </div>
        )}

        {/* 舞台中心竞技/内容区域 */}
        <div className="tabletop-center-content">{centerArena}</div>
      </main>

      {/* 底部玩家专属控制/手牌面板 */}
      {bottomBar && <footer className="tabletop-bottom-bar">{bottomBar}</footer>}
    </div>
  );
}
