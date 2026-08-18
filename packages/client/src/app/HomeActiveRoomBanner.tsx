import { useState } from 'react';
import { GAME_CATALOG } from '@ldj/shared';
import { ArrowRight, DoorOpen, Flame, Users } from 'lucide-react';
import { useConnection } from '../connection/useConnection.ts';

export function HomeActiveRoomBanner() {
  const { me, state, setViewingHome, send, clearMe } = useConnection();
  const room = state.room;
  const [leaving, setLeaving] = useState(false);

  if (!me || !room || room.status === 'CLOSED') {
    return null;
  }

  const roomGame = GAME_CATALOG.find((g) => g.id === room.gameId);
  const gameTitle = roomGame?.displayName ?? room.gameId;
  const myMember = room.members.find((m) => m.playerId === me.playerId);
  const isHost = Boolean(myMember?.isHost);
  const isPlaying = room.status === 'IN_GAME';
  const isPostGame = room.status === 'POST_GAME';

  const handleReturnToRoom = () => {
    setViewingHome(false);
  };

  const handleLeaveOrClose = async () => {
    if (leaving) return;
    setLeaving(true);
    try {
      if (isHost && room.status !== 'IN_GAME') {
        await send('room_command', { command: 'close_room' });
      } else {
        await send('leave_room', {});
      }
    } catch {
      // 忽略服务端网络失败，前端强制清理
    } finally {
      clearMe();
      setLeaving(false);
    }
  };

  const statusLabel = isPlaying ? '牌局激战中' : isPostGame ? '牌局结算中' : '房间组队中';

  return (
    <section className="home-active-room-banner home-motion-layer" data-motion-step="0" aria-label="进行中的对局提醒">
      <div className="home-active-room-banner__content">
        <div className={`home-active-room-banner__tag ${isPlaying ? 'is-playing' : ''}`}>
          <span className="home-active-room-pulse" aria-hidden="true" />
          {isPlaying ? (
            <>
              <Flame size={13} strokeWidth={2.4} aria-hidden="true" />
              <span>{statusLabel}</span>
            </>
          ) : (
            <>
              <Users size={13} strokeWidth={2.4} aria-hidden="true" />
              <span>{statusLabel}</span>
            </>
          )}
        </div>
        <div className="home-active-room-banner__main">
          <h2 className="home-active-room-banner__title">
            进行中房间：<strong>{gameTitle}</strong> · 房间码 <code>{me.roomCode}</code>
          </h2>
          <p className="home-active-room-banner__desc">
            当前身份：{isHost ? '👑 房主' : '👤 玩家'}（{me.nickname}） · 成员 {room.members.length} 人 · 座位已保留，可随时返回
          </p>
        </div>
      </div>
      <div className="home-active-room-banner__actions">
        <button
          type="button"
          className="home-active-room-banner__btn home-active-room-banner__btn--return"
          onClick={handleReturnToRoom}
        >
          <span>返回原房间</span>
          <ArrowRight size={16} strokeWidth={2.4} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="home-active-room-banner__btn home-active-room-banner__btn--leave"
          onClick={handleLeaveOrClose}
          disabled={leaving}
          title={isHost && room.status !== 'IN_GAME' ? '解散此房间' : '离开此房间'}
        >
          <DoorOpen size={15} strokeWidth={2.2} aria-hidden="true" />
          <span>{leaving ? '正在离开…' : isHost && room.status !== 'IN_GAME' ? '解散原房间' : '离开原房间'}</span>
        </button>
      </div>
    </section>
  );
}
