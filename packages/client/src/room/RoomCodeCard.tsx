import { SmartNetworkGuide } from './SmartNetworkGuide.tsx';
import { useToast } from '../shared-ui/ToastContext.tsx';

interface RoomCodeCardProps {
  gameName: string;
  roomCode: string;
  inviteUrl: string;
  online: number;
  max: number;
}

export function RoomCodeCard({ gameName, roomCode, inviteUrl, online, max }: RoomCodeCardProps) {
  const { showToast } = useToast();

  async function copyRoomCode() {
    await navigator.clipboard?.writeText(roomCode);
    showToast('房间码已复制', 'success');
  }

  return (
    <section className="room-code-card" aria-labelledby="room-code-title">
      <div className="room-code-card__head">
        <span className="room-code-card__tile" aria-hidden="true">{gameName.slice(0, 1)}</span>
        <div className="room-code-card__identity">
          <h2 id="room-code-title">{gameName} · 房间大厅</h2>
          <p className="room-code-card__online">{online}/{max} 在线</p>
        </div>
      </div>

      <SmartNetworkGuide inviteUrl={inviteUrl} roomCode={roomCode} />
    </section>
  );
}
