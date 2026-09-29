import React from 'react';
import { UserAvatar } from '../../../user/UserAvatar.tsx';
import { useCountdown } from '../../../shared-ui/useCountdown.ts';
import { PokerCard } from './PokerCard.tsx';
import type { LandlordCard } from '../types.ts';

export type LandlordRole = 'lord' | 'farmer' | 'unknown';

export interface OpponentFigureProps {
  nickname: string;
  avatar?: string;
  color?: string;
  role?: LandlordRole;
  handCount: number;
  active?: boolean;
  deadlineAt?: number | null;
  side?: 'left' | 'right';
  bubble?: {
    text: string;
    sticky?: boolean;
    hot?: boolean;
  } | null;
  revealedCards?: LandlordCard[] | null;
  /** 输出 data-player-id：舞台演出（飞行终点 / 元宝落点）按它测量席位 */
  playerId?: string;
  /** 炸弹落地时半身像往后缩一下（契约 §4.2） */
  flinch?: boolean;
  className?: string;
}

const RING_CIRCUMFERENCE = 2 * Math.PI * 26; // r = 26 => ~163.36

function MiniCountdownRing({ deadlineAt }: { deadlineAt: number }) {
  const { secondsLeft, expired } = useCountdown(deadlineAt);
  if (expired || secondsLeft <= 0) return null;

  const isLow = secondsLeft <= 10;
  const isLast = secondsLeft <= 5;
  // 假定默认倒计时总长 15~20s 进行进度衰减展示
  const progressRatio = Math.max(0, Math.min(1, secondsLeft / 15));
  const strokeDashoffset = RING_CIRCUMFERENCE * (1 - progressRatio);

  const ringClasses = [
    'th-mini-ring',
    isLow && 'is-low',
    isLast && 'is-last',
  ].filter(Boolean).join(' ');

  return (
    <div className={ringClasses} aria-label={`剩余 ${secondsLeft} 秒`}>
      <svg viewBox="0 0 60 60">
        <circle className="track" cx="30" cy="30" r="26" />
        <circle
          className="bar"
          cx="30"
          cy="30"
          r="26"
          style={{
            strokeDasharray: RING_CIRCUMFERENCE,
            strokeDashoffset,
          }}
        />
      </svg>
      <span className="ring-num">{secondsLeft}</span>
    </div>
  );
}

/**
 * 对手半身像席位组件。
 *
 * 契约：contracts/landlord.md §4
 * - 半身像：统一剪影，衣服填充席位色，脸部嵌入 UserAvatar 圆形裁切
 * - 名牌：身份圆章（主 / 农 / ?）、玩家名、剩余手牌张数（<=2 张变珊瑚红警示）
 * - 倒计时：名牌右上小倒计时环（轮到该对手时）
 * - 气泡：叫分 / 出牌 / 要不起发言
 * - 手牌预览：未亮牌显示至多 8 张背面小牌；结算公开时正面摊开展出
 */
export function OpponentFigure({
  nickname,
  avatar,
  color,
  role = 'unknown',
  handCount,
  active = false,
  deadlineAt,
  side = 'left',
  bubble,
  revealedCards,
  playerId,
  flinch = false,
  className = '',
}: OpponentFigureProps) {
  const isWarn = handCount <= 2 && handCount > 0;
  const roleText = role === 'lord' ? '主' : role === 'farmer' ? '农' : '?';

  const containerClasses = [
    'th-opp',
    side === 'left' ? 'is-left' : 'is-right',
    active && 'is-active',
    flinch && 'is-flinch',
    className,
  ].filter(Boolean).join(' ');

  const roleClasses = [
    'th-role',
    role === 'lord' && 'is-lord',
    role === 'farmer' && 'is-farmer',
    role === 'unknown' && 'is-unknown',
  ].filter(Boolean).join(' ');

  const displayCount = Math.max(0, handCount);
  const backCardCount = Math.min(displayCount, 8);

  return (
    <div
      className={containerClasses}
      {...(playerId ? { 'data-player-id': playerId } : {})}
    >
      {/* 活跃玩家身后的呼吸光晕 */}
      <span className="th-opp__halo" aria-hidden="true" />

      {/* 统一半身像剪影 + 头像嵌入 */}
      <div className="th-figure" aria-hidden="true">
        <svg className="th-figure__body" viewBox="0 0 120 110">
          <path
            d="M8 110 Q12 60 60 58 Q108 60 112 110 Z"
            fill={color || 'var(--th-wood)'}
            stroke="var(--gp-ink)"
            strokeWidth="4"
            strokeLinejoin="round"
          />
          <path
            d="M42 60 L60 84 L78 60"
            fill="var(--gp-surface, var(--th-card-inner-white))"
            stroke="var(--gp-ink)"
            strokeWidth="3.5"
            strokeLinejoin="round"
          />
        </svg>
        <div className="th-figure__face">
          <UserAvatar avatar={avatar} nickname={nickname} size={54} />
        </div>
      </div>

      {/* 名牌：身份圆章随角色变化重挂载，触发盖章放大（契约 §2 landlordId 行） */}
      <div className="th-plate">
        <span key={role} className={roleClasses}>{roleText}</span>
        <b>{nickname}</b>
        <span
          className={`th-plate__cnt ${isWarn ? 'is-warn' : ''}`}
          title={`剩余 ${displayCount} 张`}
        >
          {displayCount}
        </span>
        {active && typeof deadlineAt === 'number' && (
          <MiniCountdownRing deadlineAt={deadlineAt} />
        )}
      </div>

      {/* 气泡 */}
      {bubble && Boolean(bubble.text) && (
        <div
          className={`th-say ${bubble.sticky ? 'is-stay' : 'is-show'} ${bubble.hot ? 'is-hot' : ''}`}
        >
          {bubble.text}
        </div>
      )}

      {/* 手牌背面小扇 / 终局公开亮牌 */}
      {revealedCards && revealedCards.length > 0 ? (
        <div className="th-opp-hand is-open">
          {revealedCards.map((card, idx) => (
            <PokerCard
              key={card.id || `${card.rank}-${card.suit}-${idx}`}
              rank={card.rank}
              suit={card.suit}
              size="sm"
              flip
              /* 输家剩牌间隔 90ms 逐张翻开（契约 §4.3） */
              style={{ animationDelay: `${idx * 90}ms` }}
            />
          ))}
        </div>
      ) : backCardCount > 0 ? (
        <div className="th-opp-hand" aria-hidden="true">
          {Array.from({ length: backCardCount }).map((_, idx) => (
            <PokerCard key={idx} back size="sm" />
          ))}
        </div>
      ) : null}
    </div>
  );
}
