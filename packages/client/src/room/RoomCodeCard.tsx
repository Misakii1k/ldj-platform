/**
 * 房间码分享卡片（1-2）。
 * 独立承载「房间身份 + 房间码 + 二维码 + 复制入口」，
 * 不复用游戏目录卡片（game-card）承载房间信息。
 */
import { QRCodeSVG } from 'qrcode.react';
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

  async function copyInvite() {
    await navigator.clipboard?.writeText(inviteUrl);
    showToast('邀请链接已复制', 'success');
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

      <div className="room-code-card__code">
        <span className="room-code-card__label">房间码</span>
        <strong className="room-code room-code-card__value">{roomCode}</strong>
        <button
          type="button"
          className="room-code-card__copy"
          aria-label="复制房间码"
          onClick={() => void copyRoomCode()}
        >
          复制房间码
        </button>
      </div>

      <div className="room-code-card__invite">
        <QRCodeSVG
          value={inviteUrl}
          size={128}
          className="room-code-card__qr"
          role="img"
          aria-label="邀请二维码：扫码直达本房间加入页"
        />
        <div className="room-code-card__invite-text">
          <span>扫码加入</span>
          <button
            type="button"
            className="room-code-card__copy"
            aria-label="复制邀请链接"
            onClick={() => void copyInvite()}
          >
            复制邀请链接
          </button>
        </div>
      </div>
    </section>
  );
}
