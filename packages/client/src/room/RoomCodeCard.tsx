import React, { useState } from 'react';
import { SmartNetworkGuide } from './SmartNetworkGuide.tsx';

interface RoomCodeCardProps {
  gameName: string;
  gameId?: string;
  roomCode: string;
  inviteUrl: string;
  online: number;
  max: number;
}

export function RoomCodeCard({ gameName, gameId, roomCode, inviteUrl, online, max }: RoomCodeCardProps) {
  const [imgError, setImgError] = useState(false);

  return (
    <section className="room-code-card" aria-labelledby="room-code-title">
      <div className="room-code-card__head">
        <div className="room-code-card__logo-wrap" aria-hidden="true">
          {gameId && !imgError ? (
            <img
              src={`/icons/${gameId}.png`}
              alt=""
              className="room-code-card__logo-img"
              onError={() => setImgError(true)}
            />
          ) : (
            <span className="room-code-card__tile">{gameName.slice(0, 1)}</span>
          )}
        </div>
        <div className="room-code-card__identity">
          <h2 id="room-code-title">{gameName} · 房间大厅</h2>
          <p className="room-code-card__online">{online}/{max} 在线</p>
        </div>
      </div>

      <SmartNetworkGuide inviteUrl={inviteUrl} roomCode={roomCode} />
    </section>
  );
}
