import React from 'react';
import type { LandlordRole } from './OpponentFigure.tsx';

export interface LandlordPlateProps {
  nickname: string;
  role?: LandlordRole;
  handCount?: number;
  active?: boolean;
  bubble?: {
    text: string;
    sticky?: boolean;
    hot?: boolean;
  } | null;
  /** 输出 data-player-id：舞台演出（飞行终点 / 元宝落点）按它测量席位 */
  playerId?: string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * 斗地主我的名牌组件（通常固定在左下角）。
 *
 * 契约：contracts/landlord.md §4.1 ~ §4.3
 * 包含：身份圆章（主 / 农 / ?）、玩家昵称、剩余手牌张数、气泡提示。
 */
export function LandlordPlate({
  nickname,
  role = 'unknown',
  handCount,
  active = false,
  bubble,
  playerId,
  className = '',
  style,
}: LandlordPlateProps) {
  const roleText = role === 'lord' ? '主' : role === 'farmer' ? '农' : '?';
  const isWarn = typeof handCount === 'number' && handCount <= 2 && handCount > 0;

  const roleClasses = [
    'th-role',
    role === 'lord' && 'is-lord',
    role === 'farmer' && 'is-farmer',
    role === 'unknown' && 'is-unknown',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={`th-me-plate ${active ? 'is-active' : ''} ${className}`.trim()}
      style={style}
      {...(playerId ? { 'data-player-id': playerId } : {})}
    >
      <div className={`th-plate ${active ? 'is-active' : ''}`}>
        {/* 身份圆章随角色变化重挂载，触发盖章放大（契约 §2 landlordId 行） */}
        <span key={role} className={roleClasses}>{roleText}</span>
        <b>{nickname}</b>
        {typeof handCount === 'number' && (
          <span
            className={`th-plate__cnt ${isWarn ? 'is-warn' : ''}`}
            title={`剩余 ${handCount} 张`}
          >
            {Math.max(0, handCount)}
          </span>
        )}
      </div>

      {bubble && Boolean(bubble.text) && (
        <div
          className={`th-say ${bubble.sticky ? 'is-stay' : 'is-show'} ${bubble.hot ? 'is-hot' : ''}`}
        >
          {bubble.text}
        </div>
      )}
    </div>
  );
}
