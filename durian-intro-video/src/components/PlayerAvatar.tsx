import React from 'react';
import { DurianCardGraphic, type DurianCardData } from './DurianCardGraphic';

export interface PlayerInfo {
  id: string;
  name: string;
  avatarEmoji: string;
  color: string;
  isMe?: boolean;
  penalty?: number;
  isCurrentTurn?: boolean;
  isEliminated?: boolean;
  card?: DurianCardData;
  cardHiddenToMe?: boolean;
}

interface PlayerAvatarProps {
  player: PlayerInfo;
  showCard?: boolean;
  cardScale?: number;
  highlightCard?: boolean;
  style?: React.CSSProperties;
}

export const PlayerAvatar: React.FC<PlayerAvatarProps> = ({
  player,
  showCard = true,
  cardScale = 1,
  highlightCard = false,
  style = {},
}) => {
  const penalty = player.penalty ?? 0;
  const isDanger = penalty >= 5;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        position: 'relative',
        ...style,
      }}
    >
      {/* 行动中高亮指示器 */}
      {player.isCurrentTurn && (
        <div
          style={{
            position: 'absolute',
            top: -14,
            padding: '2px 10px',
            borderRadius: 12,
            background: 'linear-gradient(90deg, #f59e0b, #ef4444)',
            color: '#fff',
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: 1,
            boxShadow: '0 2px 8px rgba(245,158,11,0.6)',
            zIndex: 10,
          }}
        >
          ▶ 行动中
        </div>
      )}

      {/* 头顶立牌（面向他人，自己盲牌） */}
      {showCard && (
        <div
          style={{
            marginBottom: 10,
            transform: `scale(${cardScale})`,
            transformOrigin: '50% 100%',
            transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
            filter: highlightCard ? 'drop-shadow(0 0 16px rgba(234,179,8,0.8))' : 'none',
          }}
        >
          {player.isMe && player.cardHiddenToMe ? (
            <DurianCardGraphic
              isSecret
              secretLabel="你的头顶暗牌"
              width={160}
              height={105}
              glowColor={player.isCurrentTurn ? '#eab308' : undefined}
            />
          ) : player.card ? (
            <DurianCardGraphic
              card={player.card}
              width={160}
              height={105}
              glowColor={player.isCurrentTurn ? '#3b82f6' : undefined}
            />
          ) : (
            <DurianCardGraphic isSecret secretLabel="未发牌" width={160} height={105} />
          )}

          {/* 立牌木质底座 */}
          <div
            style={{
              width: 140,
              height: 10,
              margin: '-4px auto 0',
              background: 'linear-gradient(180deg, #b45309, #78350f)',
              borderRadius: '0 0 6px 6px',
              boxShadow: '0 4px 8px rgba(0,0,0,0.4)',
            }}
          />
        </div>
      )}

      {/* 玩家头像圆环 */}
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          background: `radial-gradient(circle at 30% 30%, ${player.color}ee, ${player.color}99)`,
          border: player.isCurrentTurn
            ? '3.5px solid #facc15'
            : player.isMe
              ? '3px solid #38bdf8'
              : '2.5px solid rgba(255,255,255,0.4)',
          boxShadow: player.isCurrentTurn
            ? '0 0 20px rgba(250,204,21,0.8), 0 4px 12px rgba(0,0,0,0.5)'
            : '0 4px 12px rgba(0,0,0,0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 34,
          position: 'relative',
        }}
      >
        {player.avatarEmoji}

        {/* 皇冠标识（当前玩家） */}
        {player.isMe && (
          <div
            style={{
              position: 'absolute',
              top: -12,
              right: -6,
              fontSize: 18,
              filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))',
            }}
          >
            👑
          </div>
        )}
      </div>

      {/* 玩家名字与身份 */}
      <div
        style={{
          marginTop: 6,
          textAlign: 'center',
        }}
      >
        <div
          style={{
            fontSize: 14,
            fontWeight: 800,
            color: player.isMe ? '#38bdf8' : '#fff',
            letterSpacing: 0.5,
          }}
        >
          {player.name}
          {player.isMe && <span style={{ fontSize: 11, opacity: 0.8 }}> (你)</span>}
        </div>

        {/* 罚分情况 */}
        <div
          style={{
            marginTop: 2,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 3,
            padding: '1px 8px',
            borderRadius: 10,
            background: isDanger ? 'rgba(239,68,68,0.25)' : 'rgba(0,0,0,0.4)',
            border: isDanger ? '1px solid #ef4444' : '1px solid rgba(255,255,255,0.1)',
            fontSize: 11,
            fontWeight: 700,
            color: isDanger ? '#fca5a5' : '#cbd5e1',
          }}
        >
          <span>💥 {penalty}/7 分</span>
        </div>
      </div>
    </div>
  );
};
